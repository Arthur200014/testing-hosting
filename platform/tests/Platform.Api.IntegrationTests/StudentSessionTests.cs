using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using TestingHosting.Platform.Configuration;
using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.IntegrationTests;

public sealed class StudentSessionTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task InitialMigrationAppliesToRealPostgres()
    {
        await ResetDatabaseAsync(factory);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();

        var appliedMigrations = await db.Database.GetAppliedMigrationsAsync();
        Assert.Single(appliedMigrations, migration => migration.EndsWith("_InitialPlatform", StringComparison.Ordinal));
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.True(await db.Database.CanConnectAsync());
    }

    [Fact]
    public async Task ValidCodeReturnsSignedScopedTokenAndExpectedStudentContract()
    {
        await ResetDatabaseAsync(factory);
        var seeded = await SeedAsync(factory, "north-school", "  ege-42  ");
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/student-sessions", new
        {
            workspace = " NORTH-SCHOOL ",
            code = "ＥＧＥ-42"
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<SessionResponse>();
        Assert.NotNull(body);
        Assert.Equal("Bearer", body.TokenType);
        Assert.Equal(seeded.StudentId, body.Student.Id);
        Assert.Equal(seeded.WorkspaceId, body.Student.WorkspaceId);
        Assert.Equal("EGE_MATH", body.Student.ProgramId);
        Assert.Equal("Fake Student", body.Student.DisplayName);

        var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
        var principal = handler.ValidateToken(body.AccessToken, new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = ApiFactory.Issuer,
            ValidateAudience = true,
            ValidAudience = ApiFactory.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Convert.FromBase64String(ApiFactory.SigningKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero,
            NameClaimType = ClaimTypes.Name,
            RoleClaimType = "role"
        }, out _);
        Assert.Equal(seeded.StudentId.ToString(), principal.FindFirstValue(JwtRegisteredClaimNames.Sub));
        Assert.Equal(seeded.WorkspaceId.ToString(), principal.FindFirstValue("workspace_id"));
        Assert.Equal("student", principal.FindFirstValue("role"));
        Assert.InRange(body.ExpiresAt, DateTimeOffset.UtcNow.AddMinutes(4), DateTimeOffset.UtcNow.AddMinutes(6));
    }

    [Fact]
    public async Task WrongCodeWrongWorkspaceAndInactiveStudentHaveIdenticalUnauthorizedResponse()
    {
        await ResetDatabaseAsync(factory);
        var seeded = await SeedAsync(factory, "north-school", "ALPHA-42");
        using var client = factory.CreateClient();

        var wrongCode = await PostAndReadAsync(client, "north-school", "WRONG");
        var wrongWorkspace = await PostAndReadAsync(client, "missing-school", "ALPHA-42");
        await SetStudentActiveAsync(factory, seeded.StudentId, false);
        var inactive = await PostAndReadAsync(client, "north-school", "ALPHA-42");

        Assert.Equal(HttpStatusCode.Unauthorized, wrongCode.Status);
        Assert.Equal(wrongCode, wrongWorkspace);
        Assert.Equal(wrongCode, inactive);
    }

    [Fact]
    public async Task CodeLookupCannotCrossWorkspaceBoundary()
    {
        await ResetDatabaseAsync(factory);
        await SeedAsync(factory, "workspace-a", "A-CODE");
        await SeedAsync(factory, "workspace-b", "B-CODE", "OGE_MATH");
        using var client = factory.CreateClient();

        var crossed = await client.PostAsJsonAsync("/api/v1/student-sessions", new
        {
            workspace = "workspace-b",
            code = "A-CODE"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, crossed.StatusCode);
    }

    [Fact]
    public async Task DatabaseStoresOnlyWorkspaceScopedHmacNotPlaintextCode()
    {
        await ResetDatabaseAsync(factory);
        const string plaintext = "NEVER-STORE-THIS-CODE";
        var seeded = await SeedAsync(factory, "hash-test", plaintext);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();

        var membership = await db.WorkspaceStudentMemberships.AsNoTracking()
            .SingleAsync(x => x.Id == seeded.MembershipId);
        Assert.Equal(32, membership.CodeHash.Length);
        Assert.False(membership.CodeHash.AsSpan().SequenceEqual(Encoding.UTF8.GetBytes(plaintext)));
        Assert.DoesNotContain(db.Model.FindEntityType(typeof(WorkspaceStudentMembership))!.GetProperties(),
            property => property.Name == "Code");
    }

    [Fact]
    public void MissingWeakAndPlaceholderSecretsFailFast()
    {
        var valid = ValidConfiguration();
        valid.Remove("Jwt:SigningKey");
        Assert.Throws<InvalidOperationException>(() => StartupConfiguration.Validate(
            new ConfigurationBuilder().AddInMemoryCollection(valid).Build()));

        valid["Jwt:SigningKey"] = "change-me";
        Assert.Throws<InvalidOperationException>(() => StartupConfiguration.Validate(
            new ConfigurationBuilder().AddInMemoryCollection(valid).Build()));

        valid["Jwt:SigningKey"] = Convert.ToBase64String(new byte[16]);
        Assert.Throws<InvalidOperationException>(() => StartupConfiguration.Validate(
            new ConfigurationBuilder().AddInMemoryCollection(valid).Build()));
    }

    [Fact]
    public async Task StudentSessionEndpointIsRateLimitedDeterministically()
    {
        await using var limitedFactory = new ApiFactory(rateLimit: 2);
        await ResetDatabaseAsync(limitedFactory);
        using var client = limitedFactory.CreateClient();

        var first = await client.PostAsJsonAsync("/api/v1/student-sessions", new { workspace = "none", code = "none" });
        var second = await client.PostAsJsonAsync("/api/v1/student-sessions", new { workspace = "none", code = "none" });
        var third = await client.PostAsJsonAsync("/api/v1/student-sessions", new { workspace = "none", code = "none" });

        Assert.Equal(HttpStatusCode.Unauthorized, first.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, second.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
    }

    private static async Task ResetDatabaseAsync(ApiFactory apiFactory)
    {
        await using var scope = apiFactory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await db.Database.MigrateAsync();
        await db.Database.ExecuteSqlRawAsync(
            "TRUNCATE TABLE platform.\"WorkspaceStudentMemberships\", platform.\"WorkspaceMemberships\", " +
            "platform.\"Students\", platform.\"TeacherUsers\", platform.\"Workspaces\", platform.\"Programs\" CASCADE;");
    }

    private static async Task<SeededIdentity> SeedAsync(
        ApiFactory apiFactory,
        string workspaceSlug,
        string code,
        string programCode = "EGE_MATH")
    {
        await using var scope = apiFactory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IStudentCodeHasher>();
        Assert.True(hasher.TryNormalizeWorkspace(workspaceSlug, out var normalizedWorkspace));
        Assert.True(hasher.TryNormalizeCode(code, out var normalizedCode));

        var workspace = new Workspace { Id = Guid.NewGuid(), Slug = normalizedWorkspace };
        var program = new LearningProgram
        {
            Id = Guid.NewGuid(), WorkspaceId = workspace.Id, Workspace = workspace,
            Code = programCode, DisplayName = $"Fake {programCode}"
        };
        var student = new Student
        {
            Id = Guid.NewGuid(), DisplayName = "Fake Student"
        };
        var membership = new WorkspaceStudentMembership
        {
            Id = Guid.NewGuid(),
            WorkspaceId = workspace.Id,
            Workspace = workspace,
            StudentId = student.Id,
            Student = student,
            ProgramId = program.Id,
            Program = program,
            CodeHash = hasher.Hash(normalizedWorkspace, normalizedCode),
            ImportSource = "integration-fixture",
            ImportExternalId = Guid.NewGuid().ToString()
        };
        db.Add(membership);
        await db.SaveChangesAsync();
        return new SeededIdentity(workspace.Id, student.Id, membership.Id);
    }

    private static async Task SetStudentActiveAsync(ApiFactory apiFactory, Guid studentId, bool active)
    {
        await using var scope = apiFactory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await db.Students.Where(x => x.Id == studentId).ExecuteUpdateAsync(setters => setters.SetProperty(x => x.IsActive, active));
    }

    private static async Task<UnauthorizedResult> PostAndReadAsync(HttpClient client, string workspace, string code)
    {
        var response = await client.PostAsJsonAsync("/api/v1/student-sessions", new { workspace, code });
        return new UnauthorizedResult(response.StatusCode, await response.Content.ReadAsStringAsync(), response.Content.Headers.ContentType?.MediaType);
    }

    private static Dictionary<string, string?> ValidConfiguration() => new()
    {
        ["Database:ConnectionString"] = "Host=test-db;Database=platform_tests;Username=platform_tests;Password=integration-test-password-123",
        ["Jwt:Issuer"] = ApiFactory.Issuer,
        ["Jwt:Audience"] = ApiFactory.Audience,
        ["Jwt:SigningKey"] = ApiFactory.SigningKey,
        ["Jwt:LifetimeMinutes"] = "5",
        ["StudentCodes:Pepper"] = ApiFactory.Pepper,
        ["Cors:AllowedOrigins:0"] = "https://tests.invalid",
        ["StudentSessions:RateLimitPermitLimit"] = "5",
        ["StudentSessions:RateLimitWindowSeconds"] = "60"
    };

    private sealed record SessionResponse(string AccessToken, string TokenType, DateTimeOffset ExpiresAt, SessionStudent Student);
    private sealed record SessionStudent(Guid Id, string DisplayName, string ProgramId, Guid WorkspaceId);
    private sealed record SeededIdentity(Guid WorkspaceId, Guid StudentId, Guid MembershipId);
    private sealed record UnauthorizedResult(HttpStatusCode Status, string Body, string? MediaType);
}
