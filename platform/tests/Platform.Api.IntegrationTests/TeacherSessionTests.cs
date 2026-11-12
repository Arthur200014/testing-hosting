using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Lessons;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;
using TestingHosting.Platform.Subscriptions;

namespace TestingHosting.Platform.IntegrationTests;

public sealed class TeacherSessionTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Password = "Synthetic-Teacher-Password-Only-123!";

    [Fact]
    public async Task TeacherStudentDirectoryIsScopedAndRevokedSessionsCannotReadIt()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "south", "south@example.invalid", "teacher");
        var ownId = await SeedStudentAsync(factory, north.WorkspaceId, "North student", true);
        var otherId = await SeedStudentAsync(factory, south.WorkspaceId, "South student", true);
        var inactiveId = await SeedStudentAsync(factory, north.WorkspaceId, "Archived student", false);
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/teacher/students")).StatusCode);
        var session = await (await LoginAsync(client, "north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        var students = await client.GetFromJsonAsync<List<TeacherStudentView>>("/api/v1/teacher/students");
        var own = Assert.Single(students!);
        Assert.Equal(ownId, own.MembershipId);
        Assert.Equal("North student", own.StudentName);
        Assert.Equal("MATH", own.ProgramCode);
        Assert.Equal("source-north student", own.ImportExternalId);
        var rawList = await client.GetStringAsync("/api/v1/teacher/students");
        Assert.DoesNotContain("codeHash", rawList, StringComparison.OrdinalIgnoreCase);

        Assert.Equal(HttpStatusCode.OK,
            (await client.GetAsync($"/api/v1/teacher/students/{ownId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/teacher/students/{otherId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/teacher/students/{inactiveId}")).StatusCode);

        var southSession = await (await LoginAsync(client, "south", "south@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(southSession);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", southSession.AccessToken);
        Assert.Equal(otherId, Assert.Single((await client.GetFromJsonAsync<List<TeacherStudentView>>(
            "/api/v1/teacher/students"))!).MembershipId);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/teacher/students/{ownId}")).StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync("/api/v1/teacher/students")).StatusCode);
    }

    [Fact]
    public async Task TeacherHistoryKeepsPairAttendanceAndNullableSubscriptionsWithinWorkspace()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "history-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "history-south", "south@example.invalid", "teacher");
        var first = await SeedStudentAsync(factory, north.WorkspaceId, "First", true);
        var second = await SeedStudentAsync(factory, north.WorkspaceId, "Second", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "Foreign", true);
        await SeedHistoryAsync(factory, north.WorkspaceId, [first, second]);
        await SeedHistoryAsync(factory, south.WorkspaceId, [foreign]);
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/teacher/lessons")).StatusCode);
        var session = await (await LoginAsync(client, "history-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        var lesson = Assert.Single((await client.GetFromJsonAsync<List<TeacherLessonView>>(
            "/api/v1/teacher/lessons"))!);
        Assert.Equal(2, lesson.Participants.Count);
        Assert.Contains(lesson.Participants, x => x.MembershipId == first && x.AttendanceStatus == "Present");
        Assert.Contains(lesson.Participants, x => x.MembershipId == second && x.AttendanceStatus == "Absent");
        Assert.DoesNotContain(lesson.Participants, x => x.MembershipId == foreign);

        var subscriptions = await client.GetFromJsonAsync<List<TeacherSubscriptionView>>(
            "/api/v1/teacher/subscriptions");
        Assert.Equal(2, subscriptions!.Count);
        Assert.All(subscriptions, x =>
        {
            Assert.Null(x.LessonPrice);
            Assert.Null(x.ResetAt);
            Assert.Null(x.BaseLessonCount);
            Assert.NotEqual(foreign, x.MembershipId);
        });

        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync("/api/v1/teacher/subscriptions")).StatusCode);
    }

    [Fact]
    public async Task TeacherSignsInToOwnWorkspaceAndLogoutRevokesToken()
    {
        await ResetAsync(factory);
        var seeded = await SeedAsync(factory, "school-north", "first@example.invalid", "owner");
        using var client = factory.CreateClient();

        var loggedIn = await LoginAsync(client, "school-north", " FIRST@example.invalid ", Password);
        Assert.Equal(HttpStatusCode.OK, loggedIn.StatusCode);
        var session = await loggedIn.Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        Assert.Equal(seeded.WorkspaceId, session.WorkspaceId);
        Assert.Equal(seeded.TeacherId, session.TeacherId);
        Assert.Equal("owner", session.WorkspaceRole);
        Assert.Equal("Bearer", session.TokenType);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        var me = await client.GetAsync("/api/v1/teacher/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var json = await me.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(seeded.WorkspaceId.ToString(), json.GetProperty("workspaceId").GetString());
        Assert.Equal(seeded.TeacherId.ToString(), json.GetProperty("teacherId").GetString());

        var logout = await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync("/api/v1/teacher-sessions/logout", null)).StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Single(await db.TeacherSessions.AsNoTracking().Where(x => x.MembershipId == seeded.MembershipId).ToListAsync());
        Assert.NotNull((await db.TeacherSessions.AsNoTracking().SingleAsync()).RevokedAt);
        Assert.NotEqual(Password, (await db.TeacherUsers.AsNoTracking().SingleAsync()).PasswordHash);
    }

    [Fact]
    public async Task InvalidCredentialsOrInactiveIdentityHaveSameGenericUnauthorizedResponse()
    {
        await ResetAsync(factory);
        var seeded = await SeedAsync(factory, "school-north", "first@example.invalid", "owner");
        using var client = factory.CreateClient();

        var incorrect = await LoginAsync(client, "school-north", "first@example.invalid", "WRONG-PASSWORD");
        var unknown = await LoginAsync(client, "school-north", "unknown@example.invalid", Password);
        var otherWorkspace = await LoginAsync(client, "school-south", "first@example.invalid", Password);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.WorkspaceMemberships.Where(x => x.Id == seeded.MembershipId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsActive, false));
        }
        var inactive = await LoginAsync(client, "school-north", "first@example.invalid", Password);

        foreach (var response in new[] { incorrect, unknown, otherWorkspace, inactive })
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        var expected = await incorrect.Content.ReadAsStringAsync();
        Assert.Equal(expected, await unknown.Content.ReadAsStringAsync());
        Assert.Equal(expected, await otherWorkspace.Content.ReadAsStringAsync());
        Assert.Equal(expected, await inactive.Content.ReadAsStringAsync());

        await using var verifyScope = factory.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Empty(await verifyDb.TeacherSessions.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task TeacherCannotAccessStudentPolicyAndStudentClaimsCannotAccessTeacher()
    {
        await ResetAsync(factory);
        var seeded = await SeedAsync(factory, "teacher-only", "t@example.invalid", "teacher");
        using var client = factory.CreateClient();
        var response = await LoginAsync(client, "teacher-only", "t@example.invalid", Password);
        var session = await response.Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/homework-assignments")).StatusCode);

        // A signed token carrying only student role is still refused by the teacher policy.
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            ForgeToken(Guid.NewGuid(), Guid.NewGuid(), seeded.WorkspaceId, seeded.MembershipId, "student"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);

        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);
    }

    [Fact]
    public async Task ValidSignatureCannotOverrideSessionWorkspaceOrMembership()
    {
        await ResetAsync(factory);
        var first = await SeedAsync(factory, "school-a", "a@example.invalid", "owner");
        var second = await SeedAsync(factory, "school-b", "b@example.invalid", "owner");
        using var client = factory.CreateClient();

        var response = await LoginAsync(client, "school-a", "a@example.invalid", Password);
        var session = await response.Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        var parsed = new JwtSecurityTokenHandler().ReadJwtToken(session.AccessToken);
        var sessionId = Guid.Parse(parsed.Claims.Single(x => x.Type == JwtRegisteredClaimNames.Jti).Value);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            ForgeToken(sessionId, first.TeacherId, second.WorkspaceId, first.MembershipId, "teacher"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            ForgeToken(sessionId, first.TeacherId, first.WorkspaceId, second.MembershipId, "teacher"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            ForgeToken(sessionId, second.TeacherId, first.WorkspaceId, first.MembershipId, "teacher"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);
    }

    [Fact]
    public async Task RemovingWorkspaceAccessInvalidatesExistingJwtImmediately()
    {
        await ResetAsync(factory);
        var seed = await SeedAsync(factory, "school-x", "owner@example.invalid", "owner");
        using var client = factory.CreateClient();
        var session = await (await LoginAsync(client, "school-x", "owner@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.Workspaces.Where(x => x.Id == seed.WorkspaceId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsActive, false));
        }

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);
    }


    [Fact]
    public async Task ChangingTeacherRoleRevokesOldOwnerToken()
    {
        await ResetAsync(factory);
        var seed = await SeedAsync(factory, "school-roles", "owner@example.invalid", "owner");
        using var client = factory.CreateClient();
        var session = await (await LoginAsync(client, "school-roles", "owner@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.WorkspaceMemberships.Where(x => x.Id == seed.MembershipId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.Role, "teacher"));
        }

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);
    }

    [Fact]
    public async Task ViewerMembershipCannotObtainTeacherToken()
    {
        await ResetAsync(factory);
        await SeedAsync(factory, "viewer-school", "viewer@example.invalid", "viewer");
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await LoginAsync(client, "viewer-school", "viewer@example.invalid", Password)).StatusCode);
    }

    [Fact]
    public async Task TeacherSignInHasIndependentIpRateLimit()
    {
        await using var limited = new ApiFactory(rateLimit: 5);
        await ResetAsync(limited);
        using var client = limited.CreateClient();
        for (int i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.Unauthorized,
                (await LoginAsync(client, "none", "none@example.invalid", "bad")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests,
            (await LoginAsync(client, "none", "none@example.invalid", "bad")).StatusCode);
    }

    [Fact]
    public async Task PrivilegedBootstrapCreatesOnlyFirstWorkspaceOwner()
    {
        await ResetAsync(factory);
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["TeacherBootstrap:Email"] = "bootstrap@example.invalid",
                ["TeacherBootstrap:Password"] = Password,
                ["TeacherBootstrap:Workspace"] = "new-school"
            }).Build();
        await TeacherBootstrapper.RunAsync(factory.Services, config);
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => TeacherBootstrapper.RunAsync(factory.Services, config));

        using var client = factory.CreateClient();
        var loggedIn = await LoginAsync(client, "new-school", "bootstrap@example.invalid", Password);
        Assert.Equal(HttpStatusCode.OK, loggedIn.StatusCode);
    }

    private static async Task ResetAsync(ApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await db.Database.MigrateAsync();
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        await db.Database.ExecuteSqlRawAsync(
            "TRUNCATE TABLE platform.\"TeacherSessions\", platform.\"WorkspaceMemberships\", " +
            "platform.\"WorkspaceStudentMemberships\", platform.\"TeacherUsers\", " +
            "platform.\"Students\", platform.\"Workspaces\", platform.\"Programs\" CASCADE;");
    }

    private static async Task<SeededTeacher> SeedAsync(ApiFactory factory, string slug, string email, string role)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var workspace = new Workspace { Id = Guid.NewGuid(), Slug = slug };
        var teacher = new TeacherUser
        {
            Id = Guid.NewGuid(), Email = email, NormalizedEmail = email.ToUpperInvariant()
        };
        teacher.PasswordHash = new PasswordHasher<TeacherUser>().HashPassword(teacher, Password);
        var membership = new WorkspaceMembership
        {
            Id = Guid.NewGuid(), Workspace = workspace, TeacherUser = teacher, Role = role
        };
        db.WorkspaceMemberships.Add(membership);
        await db.SaveChangesAsync();
        return new SeededTeacher(workspace.Id, teacher.Id, membership.Id);
    }

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client, string workspace, string email, string password) =>
        client.PostAsJsonAsync("/api/v1/teacher-sessions", new { workspace, email, password });

    private static async Task<Guid> SeedStudentAsync(ApiFactory factory, Guid workspaceId, string name, bool active)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var program = new LearningProgram
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, Code = "MATH", DisplayName = "Mathematics"
        };
        var student = new Student { Id = Guid.NewGuid(), DisplayName = name };
        var membership = new WorkspaceStudentMembership
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, Student = student, Program = program,
            CodeHash = System.Security.Cryptography.SHA256.HashData(Guid.NewGuid().ToByteArray()),
            ImportSource = "synthetic", ImportExternalId = "source-" + name.ToLowerInvariant(),
            IsActive = active
        };
        db.WorkspaceStudentMemberships.Add(membership);
        await db.SaveChangesAsync();
        return membership.Id;
    }

    private static async Task SeedHistoryAsync(ApiFactory factory, Guid workspaceId, Guid[] membershipIds)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var students = await db.WorkspaceStudentMemberships
            .Where(x => x.WorkspaceId == workspaceId && membershipIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id);
        var now = DateTimeOffset.UtcNow;
        var lesson = new Lesson
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, LegacyLessonId = "synthetic-lesson",
            LessonAt = now, CreatedAt = now
        };
        db.Lessons.Add(lesson);
        for (var i = 0; i < membershipIds.Length; i++)
        {
            var student = students[membershipIds[i]];
            db.LessonParticipants.Add(new LessonParticipant
            {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId, Lesson = lesson,
                MembershipId = student.Id, StudentId = student.StudentId, ProgramId = student.ProgramId,
                DurationMinutes = 60, AttendanceStatus = i == 0 ? "Present" : "Absent", CreatedAt = now
            });
            db.SubscriptionSnapshots.Add(new SubscriptionSnapshot
            {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId,
                MembershipId = student.Id, StudentId = student.StudentId, ProgramId = student.ProgramId,
                PackageSize = 8, UpdatedAt = now
            });
        }
        await db.SaveChangesAsync();
    }

    private static string ForgeToken(Guid sessionId, Guid userId, Guid workspaceId, Guid membershipId, string role)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, sessionId.ToString()),
            new Claim("workspace_id", workspaceId.ToString()),
            new Claim("membership_id", membershipId.ToString()),
            new Claim("role", role),
            new Claim("workspace_role", "owner")
        };
        var signed = new JwtSecurityToken(
            issuer: ApiFactory.Issuer, audience: ApiFactory.Audience, claims: claims,
            expires: DateTime.UtcNow.AddMinutes(4),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Convert.FromBase64String(ApiFactory.SigningKey)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(signed);
    }

    private sealed record SeededTeacher(Guid WorkspaceId, Guid TeacherId, Guid MembershipId);
}
