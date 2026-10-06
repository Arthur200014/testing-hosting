using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using TestingHosting.Platform.Homework;
using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.IntegrationTests;

public sealed class HomeworkTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task HomeworkMigrationIsAppliedToRealPostgres()
    {
        await ResetDatabaseAsync();
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var applied = await db.Database.GetAppliedMigrationsAsync();
        Assert.Contains(applied, migration => migration.EndsWith("_Homework", StringComparison.Ordinal));
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }

    [Fact]
    public async Task HomeworkEndpointsRequireStudentAuthentication()
    {
        await ResetDatabaseAsync();
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/homework-assignments")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/v1/homework-submissions", ValidPayload("auth-event", "hw-auth"))).StatusCode);

        using var teacherGet = new HttpRequestMessage(HttpMethod.Get, "/api/v1/homework-assignments");
        teacherGet.Headers.Authorization = new AuthenticationHeaderValue("Bearer", CreateToken([], "teacher"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(teacherGet)).StatusCode);
    }

    [Fact]
    public async Task StudentListsOnlyOwnCurrentProgramAssignments()
    {
        await ResetDatabaseAsync();
        var first = await SeedIdentityAsync("homework-list-a", "HOMEWORK-A");
        var second = await SeedIdentityAsync("homework-list-b", "HOMEWORK-B");
        await SeedAssignmentAsync(first, "assignment-visible", "hw-visible", DateTimeOffset.UtcNow.AddHours(-2));
        await SeedAssignmentAsync(second, "assignment-hidden", "hw-hidden", DateTimeOffset.UtcNow.AddHours(-2));
        using var client = factory.CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/homework-assignments");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", CreateToken(first));
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var assignments = await response.Content.ReadFromJsonAsync<List<HomeworkAssignmentResponse>>(JsonOptions);
        var assignment = Assert.Single(Assert.IsType<List<HomeworkAssignmentResponse>>(assignments));
        Assert.Equal("hw-visible", assignment.HomeworkId);
        Assert.DoesNotContain("hw-hidden", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task SubmissionUsesLatestRepeatedAssignmentAndMarksLateFromCompletionTime()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("homework-repeat", "HOMEWORK-REPEAT");
        var older = await SeedAssignmentAsync(identity, "assignment-old", "hw-repeat", DateTimeOffset.UtcNow.AddDays(-3));
        var latest = await SeedAssignmentAsync(identity, "assignment-new", "hw-repeat", DateTimeOffset.UtcNow.AddHours(-3), deadlineHours: 1);
        var completedAt = latest.AssignedAt.AddHours(2);
        using var client = factory.CreateClient();

        var response = await SendSubmissionAsync(client, CreateToken(identity),
            ValidPayload("repeat-event", "hw-repeat") with { CompletedAt = completedAt });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var receipt = await response.Content.ReadFromJsonAsync<HomeworkSubmissionResponse>(JsonOptions);
        Assert.NotNull(receipt);
        Assert.Equal(latest.Id, receipt!.AssignmentRecordId);
        Assert.True(receipt.Late);
        Assert.Equal("submitted_late", receipt.Status);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var storedOld = await db.HomeworkAssignments.AsNoTracking().SingleAsync(x => x.Id == older.Id);
        var storedLatest = await db.HomeworkAssignments.AsNoTracking().SingleAsync(x => x.Id == latest.Id);
        Assert.Null(storedOld.SubmittedAt);
        Assert.Equal(completedAt, storedLatest.SubmittedAt);
        Assert.Equal(70, storedLatest.ScorePercent);
    }

    [Fact]
    public async Task ExactReplayIsIdempotentAndChangedReplayConflicts()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("homework-replay", "HOMEWORK-REPLAY");
        await SeedAssignmentAsync(identity, "assignment-replay", "hw-replay", DateTimeOffset.UtcNow.AddHours(-2));
        using var client = factory.CreateClient();
        var token = CreateToken(identity);
        var payload = ValidPayload("homework-event", "hw-replay");

        var created = await SendSubmissionAsync(client, token, payload);
        var duplicate = await SendSubmissionAsync(client, token, payload);
        var conflict = await SendSubmissionAsync(client, token, payload with { ScorePercent = 71 });

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(HttpStatusCode.OK, duplicate.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        var duplicateReceipt = await duplicate.Content.ReadFromJsonAsync<HomeworkSubmissionResponse>(JsonOptions);
        Assert.True(duplicateReceipt?.Duplicate);

        await using var scope = factory.Services.CreateAsyncScope();
        Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().HomeworkSubmissions.CountAsync());
    }

    [Fact]
    public async Task EventIdCannotBeReplayedByAnotherStudent()
    {
        await ResetDatabaseAsync();
        var first = await SeedIdentityAsync("homework-owner-a", "HOMEWORK-OWNER-A");
        var second = await SeedIdentityAsync("homework-owner-b", "HOMEWORK-OWNER-B");
        await SeedAssignmentAsync(first, "assignment-owner-a", "hw-owner", DateTimeOffset.UtcNow.AddHours(-2));
        await SeedAssignmentAsync(second, "assignment-owner-b", "hw-owner", DateTimeOffset.UtcNow.AddHours(-2));
        using var client = factory.CreateClient();
        var payload = ValidPayload("shared-event", "hw-owner");

        Assert.Equal(HttpStatusCode.Created, (await SendSubmissionAsync(client, CreateToken(first), payload)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await SendSubmissionAsync(client, CreateToken(second), payload)).StatusCode);
    }

    [Fact]
    public async Task MissingAssignmentAndInvalidPayloadDoNotWrite()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("homework-invalid", "HOMEWORK-INVALID");
        using var client = factory.CreateClient();
        var token = CreateToken(identity);

        var missing = await SendSubmissionAsync(client, token, ValidPayload("missing-event", "missing-homework"));
        var invalid = await SendSubmissionAsync(client, token, ValidPayload("invalid-event", "missing-homework") with
        {
            EventId = " ", ScorePercent = 101, DurationSeconds = -1, SchemaVersion = ""
        });

        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        await using var scope = factory.Services.CreateAsyncScope();
        Assert.Equal(0, await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().HomeworkSubmissions.CountAsync());
    }

    [Fact]
    public async Task InactiveMembershipAfterTokenIssuanceCannotReadOrSubmit()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("homework-inactive", "HOMEWORK-INACTIVE");
        await SeedAssignmentAsync(identity, "assignment-inactive", "hw-inactive", DateTimeOffset.UtcNow.AddHours(-2));
        var token = CreateToken(identity);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.WorkspaceStudentMemberships.Where(x => x.Id == identity.MembershipId)
                .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.IsActive, false));
        }
        using var client = factory.CreateClient();

        using var list = new HttpRequestMessage(HttpMethod.Get, "/api/v1/homework-assignments");
        list.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(list)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await SendSubmissionAsync(client, token, ValidPayload("inactive-event", "hw-inactive"))).StatusCode);
    }

    private async Task ResetDatabaseAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await db.Database.MigrateAsync();
        await db.Database.ExecuteSqlRawAsync(
            "TRUNCATE TABLE platform.\"WorkspaceStudentMemberships\", platform.\"WorkspaceMemberships\", " +
            "platform.\"Students\", platform.\"TeacherUsers\", platform.\"Workspaces\", platform.\"Programs\" CASCADE;");
    }

    private async Task<SeededIdentity> SeedIdentityAsync(string workspaceSlug, string code)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IStudentCodeHasher>();
        var workspace = new Workspace { Id = Guid.NewGuid(), Slug = workspaceSlug };
        Assert.True(hasher.TryNormalizeWorkspace(workspace.Slug, out var normalizedWorkspace));
        Assert.True(hasher.TryNormalizeCode(code, out var normalizedCode));
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var program = new LearningProgram
        {
            Id = Guid.NewGuid(), Workspace = workspace, WorkspaceId = workspace.Id,
            Code = $"PROGRAM_{suffix}", DisplayName = $"Synthetic program {suffix}"
        };
        var student = new Student { Id = Guid.NewGuid(), DisplayName = $"Synthetic student {suffix}" };
        var membership = new WorkspaceStudentMembership
        {
            Id = Guid.NewGuid(), Workspace = workspace, WorkspaceId = workspace.Id,
            Student = student, StudentId = student.Id, Program = program, ProgramId = program.Id,
            CodeHash = hasher.Hash(normalizedWorkspace, normalizedCode),
            ImportSource = "homework-test-fixture", ImportExternalId = suffix
        };
        db.Add(membership);
        await db.SaveChangesAsync();
        return new(workspace.Id, membership.Id, student.Id, program.Id);
    }

    private async Task<SeededAssignment> SeedAssignmentAsync(
        SeededIdentity identity,
        string assignmentRecordId,
        string homeworkId,
        DateTimeOffset assignedAt,
        int deadlineHours = 24)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var catalog = await db.HomeworkCatalogItems.SingleOrDefaultAsync(x =>
            x.WorkspaceId == identity.WorkspaceId && x.ProgramId == identity.ProgramId && x.HomeworkId == homeworkId);
        if (catalog is null)
        {
            catalog = new HomeworkCatalogItem
            {
                Id = Guid.NewGuid(), WorkspaceId = identity.WorkspaceId, ProgramId = identity.ProgramId,
                HomeworkId = homeworkId, TaskNumber = 6, Name = $"Synthetic {homeworkId}",
                Url = $"https://tests.invalid/{homeworkId}", IsActive = true, SortOrder = 1,
                CreatedAt = assignedAt.AddDays(-1)
            };
            db.Add(catalog);
            await db.SaveChangesAsync();
        }
        var assignment = new HomeworkAssignment
        {
            Id = Guid.NewGuid(), WorkspaceId = identity.WorkspaceId, MembershipId = identity.MembershipId,
            StudentId = identity.StudentId, ProgramId = identity.ProgramId, CatalogItemId = catalog.Id,
            AssignmentRecordId = assignmentRecordId, HomeworkId = homeworkId, TaskNumber = 6,
            Name = catalog.Name, Url = catalog.Url, AssignedAt = assignedAt,
            DeadlineAt = assignedAt.AddHours(deadlineHours), Status = "assigned", SchemaVersion = "2"
        };
        db.Add(assignment);
        await db.SaveChangesAsync();
        return new(assignment.Id, assignment.AssignedAt);
    }

    private static HomeworkSubmissionRequest ValidPayload(string eventId, string homeworkId) => new(
        homeworkId,
        eventId,
        70,
        90,
        DateTimeOffset.UtcNow.AddMinutes(-1),
        "2");

    private static async Task<HttpResponseMessage> SendSubmissionAsync(
        HttpClient client,
        string token,
        HomeworkSubmissionRequest payload)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/homework-submissions")
        {
            Content = JsonContent.Create(payload, options: JsonOptions)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await client.SendAsync(request);
    }

    private static string CreateToken(SeededIdentity identity, string role = "student") => CreateToken(
        [
            new Claim(JwtRegisteredClaimNames.Sub, identity.StudentId.ToString()),
            new Claim("workspace_id", identity.WorkspaceId.ToString()),
            new Claim("membership_id", identity.MembershipId.ToString())
        ], role);

    private static string CreateToken(IEnumerable<Claim> claims, string role)
    {
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: ApiFactory.Issuer,
            audience: ApiFactory.Audience,
            claims: claims.Append(new Claim("role", role)),
            notBefore: now.AddMinutes(-1),
            expires: now.AddMinutes(5),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Convert.FromBase64String(ApiFactory.SigningKey)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private sealed record SeededIdentity(Guid WorkspaceId, Guid MembershipId, Guid StudentId, Guid ProgramId);
    private sealed record SeededAssignment(Guid Id, DateTimeOffset AssignedAt);
}
