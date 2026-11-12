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
using TestingHosting.Platform.Homework;
using TestingHosting.Platform.Lessons;
using TestingHosting.Platform.Mocks;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;
using TestingHosting.Platform.Subscriptions;
using TestingHosting.Platform.TestAttempts;

namespace TestingHosting.Platform.IntegrationTests;

public sealed class TeacherSessionTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Password = "Synthetic-Teacher-Password-Only-123!";

    [Fact]
    public async Task ArchivingStudentRevokesCodeButKeepsLessonHistoryAndOtherWorkspace()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "archive-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "archive-south", "south@example.invalid", "teacher");
        var program = await SeedProgramAsync(factory, north.WorkspaceId);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "Other", true);
        using var client = factory.CreateClient();
        var session = await (await LoginAsync(client, "archive-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        var create = await client.PostAsJsonAsync("/api/v1/teacher/students",
            new TeacherCreateStudentRequest(Guid.NewGuid(), program, "Synthetic"));
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var student = await create.Content.ReadFromJsonAsync<TeacherCreateStudentResponse>();
        Assert.NotNull(student);
        await SeedHistoryAsync(factory, north.WorkspaceId, [student.MembershipId]);

        var path = $"/api/v1/teacher/students/{student.MembershipId}/archive";
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsync($"/api/v1/teacher/students/{foreign}/archive", null)).StatusCode);
        var archived = await client.PostAsync(path, null);
        Assert.Equal(HttpStatusCode.OK, archived.StatusCode);
        Assert.False((await archived.Content.ReadFromJsonAsync<TeacherArchiveStudentResponse>())!.IsActive);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync(path, null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/teacher/students/{student.MembershipId}")).StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherStudentView>>(
            "/api/v1/teacher/students"))!);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/v1/student-sessions",
                new { workspace = "archive-north", code = student.InviteCode })).StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Single(await db.Lessons.AsNoTracking().ToListAsync());
            Assert.Single(await db.LessonParticipants.AsNoTracking().ToListAsync());
            Assert.True((await db.WorkspaceStudentMemberships.AsNoTracking()
                .SingleAsync(x => x.Id == foreign)).IsActive);
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(path, null)).StatusCode);
    }

    [Fact]
    public async Task LessonAndHomeworkCommitTogetherOrRollBackAndReplayAsOneOperation()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "combined-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "combined-south", "south@example.invalid", "teacher");
        var first = await SeedStudentAsync(factory, north.WorkspaceId, "First", true);
        var second = await SeedStudentAsync(factory, north.WorkspaceId, "Second", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "Foreign", true);
        await SeedHomeworkAsync(factory, north.WorkspaceId, first);
        Guid catalog;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            catalog = (await db.HomeworkCatalogItems.AsNoTracking().SingleAsync()).Id;
        }
        var lesson = new TeacherLessonWriteRequest(Guid.NewGuid(), DateTimeOffset.UtcNow,
        [
            new(first, 60, "6", "Synthetic topic", "Present"),
            new(second, 45, "6", "Synthetic topic", "Absent")
        ]);
        var request = new TeacherLessonHomeworkRequest(lesson, catalog, 48);
        const string path = "/api/v1/teacher/lessons-with-homework";
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
        var session = await (await LoginAsync(client, "combined-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(path, request with
            {
                Lesson = lesson with
                {
                    RequestId = Guid.NewGuid(), Participants = [new(foreign, 60, null, null, "Present")]
                }
            })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Empty(await db.Lessons.AsNoTracking().ToListAsync());
            Assert.Single(await db.HomeworkAssignments.AsNoTracking().ToListAsync());
            await db.HomeworkAssignments.ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.SubmittedAt, DateTimeOffset.UtcNow)
                .SetProperty(x => x.Status, "submitted"));
        }

        var responses = await Task.WhenAll(Enumerable.Range(0, 3)
            .Select(_ => client.PostAsJsonAsync(path, request)));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Equal(2, responses.Count(x => x.StatusCode == HttpStatusCode.OK));
        var returned = await responses[0].Content.ReadFromJsonAsync<TeacherLessonHomeworkResponse>();
        Assert.NotNull(returned);
        Assert.Equal(2, returned.Lesson.ParticipantCount);
        Assert.Equal(2, returned.Homework!.AssignmentIds.Count);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with { DeadlineHours = 72 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with
            {
                CatalogItemId = null, DeadlineHours = null
            })).StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var saved = Assert.Single(await db.Lessons.AsNoTracking().Include(x => x.Participants).ToListAsync());
            Assert.Equal(2, saved.Participants.Count);
            Assert.Contains(saved.Participants, x => x.MembershipId == first && x.AttendanceStatus == "Present");
            Assert.Contains(saved.Participants, x => x.MembershipId == second && x.AttendanceStatus == "Absent");
            Assert.Equal(3, await db.HomeworkAssignments.CountAsync());
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
    }

    [Fact]
    public async Task TeacherCreatesStudentWithRepeatablePrivateCodeAndCannotUseForeignProgram()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "create-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "create-south", "south@example.invalid", "teacher");
        var program = await SeedProgramAsync(factory, north.WorkspaceId);
        var foreignProgram = await SeedProgramAsync(factory, south.WorkspaceId);
        using var client = factory.CreateClient();
        const string path = "/api/v1/teacher/students";
        var request = new TeacherCreateStudentRequest(Guid.NewGuid(), program, " Synthetic Student ",
            new TeacherStudentProfile(Grade: " 11 ", GroupId: " Group A ", TargetScore: "85",
                ParentName: "Synthetic parent", Notes: "Initial notes"));
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
        var session = await (await LoginAsync(client, "create-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(path, request with
            {
                RequestId = Guid.NewGuid(), ProgramId = foreignProgram
            })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(path, request with
            {
                RequestId = Guid.NewGuid(), StudentName = " "
            })).StatusCode);

        var responses = await Task.WhenAll(Enumerable.Range(0, 4)
            .Select(_ => client.PostAsJsonAsync(path, request)));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Equal(3, responses.Count(x => x.StatusCode == HttpStatusCode.OK));
        var results = await Task.WhenAll(responses.Select(x =>
            x.Content.ReadFromJsonAsync<TeacherCreateStudentResponse>()));
        var created = results[0];
        Assert.NotNull(created);
        Assert.Equal("Synthetic Student", created.StudentName);
        Assert.Equal("11", created.Profile.Grade);
        Assert.Equal("Group A", created.Profile.GroupId);
        Assert.Equal(32, created.InviteCode.Length);
        foreach (var result in results)
            Assert.Equal(created.InviteCode, result!.InviteCode);

        Assert.DoesNotContain(created.InviteCode, await client.GetStringAsync(path));
        var listed = Assert.Single((await client.GetFromJsonAsync<List<TeacherStudentView>>(path))!);
        Assert.Equal("11", listed.Grade);
        Assert.Equal("Group A", listed.GroupId);
        Assert.Equal("Synthetic parent", listed.ParentName);
        Assert.Equal("Initial notes", listed.Notes);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with { StudentName = "Other" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with
            {
                Profile = request.Profile! with { TargetScore = "90" }
            })).StatusCode);
        var studentSession = await client.PostAsJsonAsync("/api/v1/student-sessions",
            new { workspace = "create-north", code = created.InviteCode });
        Assert.Equal(HttpStatusCode.OK, studentSession.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/v1/student-sessions",
                new { workspace = "create-south", code = created.InviteCode })).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Single(await db.Students.AsNoTracking().ToListAsync());
            var membership = Assert.Single(await db.WorkspaceStudentMemberships.AsNoTracking().ToListAsync());
            Assert.Equal(created.MembershipId, membership.Id);
            Assert.Equal("85", membership.TargetScore);
            Assert.NotEqual(System.Text.Encoding.UTF8.GetBytes(created.InviteCode), membership.CodeHash);
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
    }

    [Fact]
    public async Task TeacherAssignsHomeworkAtomicallyAndReplaysConcurrentBatchWithoutResettingSubmissions()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "assign-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "assign-south", "south@example.invalid", "teacher");
        var first = await SeedStudentAsync(factory, north.WorkspaceId, "First", true);
        var second = await SeedStudentAsync(factory, north.WorkspaceId, "Second", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "Foreign", true);
        var catalog = await SeedCatalogAsync(factory, north.WorkspaceId, first);
        var foreignCatalog = await SeedCatalogAsync(factory, south.WorkspaceId, foreign);
        var request = new TeacherAssignHomeworkRequest(
            Guid.NewGuid(), catalog, DateTimeOffset.UtcNow, 48, [first, second]);
        using var client = factory.CreateClient();
        const string path = "/api/v1/teacher/homework/assignments";
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
        var session = await (await LoginAsync(client, "assign-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(path, request with
            {
                RequestId = Guid.NewGuid(), MembershipIds = [first, foreign]
            })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(path, request with
            {
                RequestId = Guid.NewGuid(), CatalogItemId = foreignCatalog
            })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(path, request with
            {
                RequestId = Guid.NewGuid(), MembershipIds = [first, first]
            })).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Empty(await db.HomeworkAssignments.AsNoTracking().ToListAsync());
        }

        var responses = await Task.WhenAll(Enumerable.Range(0, 4)
            .Select(_ => client.PostAsJsonAsync(path, request)));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Equal(3, responses.Count(x => x.StatusCode == HttpStatusCode.OK));
        var response = await responses[0].Content.ReadFromJsonAsync<TeacherAssignHomeworkResponse>();
        Assert.NotNull(response);
        Assert.Equal(2, response.AssignmentIds.Count);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var assignments = await db.HomeworkAssignments.AsNoTracking().ToListAsync();
            Assert.Equal(2, assignments.Count);
            Assert.Equal(2, assignments.Select(x => x.StudentId).Distinct().Count());
            Assert.All(assignments, x => Assert.Equal(48, (x.DeadlineAt - x.AssignedAt).TotalHours));
            await db.HomeworkAssignments.Where(x => x.Id == assignments[0].Id)
                .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.Status, "submitted"));
        }
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync(path, request with { MembershipIds = [second, first] })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with { DeadlineHours = 72 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with { MembershipIds = [first] })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with { RequestId = Guid.NewGuid() })).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Equal(2, await db.HomeworkAssignments.CountAsync());
            Assert.Equal(1, await db.HomeworkAssignments.CountAsync(x => x.Status == "submitted"));
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
    }

    [Fact]
    public async Task TeacherCreatesOnePairedLessonAndReplayCannotChangeAttendanceOrCrossWorkspace()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "lesson-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "lesson-south", "south@example.invalid", "teacher");
        var first = await SeedStudentAsync(factory, north.WorkspaceId, "First", true);
        var second = await SeedStudentAsync(factory, north.WorkspaceId, "Second", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "Foreign", true);
        using var client = factory.CreateClient();
        var request = new TeacherLessonWriteRequest(Guid.NewGuid(), DateTimeOffset.UtcNow,
        [
            new(first, 60, "6", "Synthetic topic", "Present"),
            new(second, 45, "6", "Synthetic topic", "Absent")
        ]);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons", request)).StatusCode);
        var session = await (await LoginAsync(client, "lesson-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons", request with
            {
                RequestId = Guid.NewGuid(), Participants = [new(foreign, 60, null, null, "Present")]
            })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons", request with
            {
                RequestId = Guid.NewGuid(), Participants = [request.Participants![0], request.Participants[0]]
            })).StatusCode);

        var created = await client.PostAsJsonAsync("/api/v1/teacher/lessons", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var firstResponse = await created.Content.ReadFromJsonAsync<TeacherLessonWriteResponse>();
        Assert.NotNull(firstResponse);
        Assert.Equal(2, firstResponse.ParticipantCount);
        var replay = await client.PostAsJsonAsync("/api/v1/teacher/lessons", request with
        {
            Participants = [request.Participants![1], request.Participants[0]]
        });
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal(firstResponse.LessonId,
            (await replay.Content.ReadFromJsonAsync<TeacherLessonWriteResponse>())!.LessonId);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons", request with
            {
                Participants = [request.Participants[0] with { AttendanceStatus = "Absent" }, request.Participants[1]]
            })).StatusCode);

        var simultaneous = request with { RequestId = Guid.NewGuid() };
        var responses = await Task.WhenAll(Enumerable.Range(0, 4)
            .Select(_ => client.PostAsJsonAsync("/api/v1/teacher/lessons", simultaneous)));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Equal(3, responses.Count(x => x.StatusCode == HttpStatusCode.OK));

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var all = await db.Lessons.AsNoTracking().Include(x => x.Participants)
                .Where(x => x.WorkspaceId == north.WorkspaceId).ToListAsync();
            Assert.Equal(2, all.Count);
            var saved = Assert.Single(all, x => x.Id == firstResponse.LessonId);
            Assert.Equal(2, saved.Participants.Count);
            Assert.Contains(saved.Participants, x => x.MembershipId == first && x.AttendanceStatus == "Present");
            Assert.Contains(saved.Participants, x => x.MembershipId == second && x.AttendanceStatus == "Absent");
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons", request)).StatusCode);
    }

    [Fact]
    public async Task TeacherSubscriptionWritePreservesNullsAndRejectsStaleOrForeignEdits()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "subscription-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "subscription-south", "south@example.invalid", "teacher");
        var own = await SeedStudentAsync(factory, north.WorkspaceId, "North", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "South", true);
        using var client = factory.CreateClient();
        var blank = new TeacherSubscriptionWriteRequest(8, null, null, null, null);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}", blank)).StatusCode);
        var session = await (await LoginAsync(client, "subscription-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{foreign}", blank)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}",
                blank with { LessonPrice = -1 })).StatusCode);
        var created = await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}", blank);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var first = await created.Content.ReadFromJsonAsync<TeacherSubscriptionView>();
        Assert.NotNull(first);
        Assert.Null(first.LessonPrice);
        Assert.Null(first.ResetAt);
        Assert.Null(first.BaseLessonCount);

        var repeat = await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}", blank);
        Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
        Assert.Equal(first.UpdatedAt,
            (await repeat.Content.ReadFromJsonAsync<TeacherSubscriptionView>())!.UpdatedAt);
        var update = blank with { PackageSize = 10, ExpectedUpdatedAt = first.UpdatedAt };
        var changed = await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}", update);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var second = await changed.Content.ReadFromJsonAsync<TeacherSubscriptionView>();
        Assert.NotNull(second);
        Assert.True(second.UpdatedAt > first.UpdatedAt);
        Assert.Null(second.LessonPrice);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}",
                update with { PackageSize = 12 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}", update)).StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var stored = Assert.Single(await db.SubscriptionSnapshots.AsNoTracking()
                .Where(x => x.WorkspaceId == north.WorkspaceId).ToListAsync());
            Assert.Equal(10, stored.PackageSize);
            Assert.Null(stored.LessonPrice);
            Assert.Null(stored.ResetAt);
            Assert.Null(stored.BaseLessonCount);
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}", update)).StatusCode);
    }

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
        Assert.Null(own.Grade);
        Assert.Null(own.ParentName);
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
    public async Task TeacherProgramsDoNotRevealOtherWorkspace()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "programs-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "programs-south", "south@example.invalid", "teacher");
        var own = await SeedProgramAsync(factory, north.WorkspaceId);
        await SeedProgramAsync(factory, south.WorkspaceId);
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/teacher/programs")).StatusCode);
        var session = await (await LoginAsync(client, "programs-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        var items = await client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>(
            "/api/v1/teacher/programs");
        Assert.Equal(own.ToString(), Assert.Single(items!).GetProperty("id").GetString());
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync("/api/v1/teacher/programs")).StatusCode);
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
    public async Task TeacherHomeworkReadsAreScopedIncludingMembershipFilter()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "homework-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "homework-south", "south@example.invalid", "teacher");
        var own = await SeedStudentAsync(factory, north.WorkspaceId, "North", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "South", true);
        await SeedHomeworkAsync(factory, north.WorkspaceId, own);
        await SeedHomeworkAsync(factory, south.WorkspaceId, foreign);
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/teacher/homework/catalog")).StatusCode);
        var session = await (await LoginAsync(client, "homework-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        Assert.Single((await client.GetFromJsonAsync<List<TeacherHomeworkCatalogView>>(
            "/api/v1/teacher/homework/catalog"))!);
        var assignment = Assert.Single((await client.GetFromJsonAsync<List<TeacherHomeworkAssignmentView>>(
            "/api/v1/teacher/homework/assignments"))!);
        Assert.Equal(own, assignment.MembershipId);
        Assert.Equal("assigned", assignment.Status);
        var submission = Assert.Single((await client.GetFromJsonAsync<List<TeacherHomeworkSubmissionView>>(
            $"/api/v1/teacher/homework/submissions?membershipId={own}"))!);
        Assert.Equal(assignment.Id, submission.AssignmentId);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherHomeworkAssignmentView>>(
            $"/api/v1/teacher/homework/assignments?membershipId={foreign}"))!);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherHomeworkSubmissionView>>(
            $"/api/v1/teacher/homework/submissions?membershipId={foreign}"))!);
    }

    [Fact]
    public async Task TeacherHistoricalResultsKeepMissingValuesAndRejectForeignMembership()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "results-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "results-south", "south@example.invalid", "teacher");
        var own = await SeedStudentAsync(factory, north.WorkspaceId, "North", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "South", true);
        await SeedResultsAsync(factory, north.WorkspaceId, own);
        await SeedResultsAsync(factory, south.WorkspaceId, foreign);
        using var client = factory.CreateClient();
        var session = await (await LoginAsync(client, "results-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        var test = Assert.Single((await client.GetFromJsonAsync<List<TeacherTestResultView>>(
            "/api/v1/teacher/tests/history"))!);
        Assert.Equal(own, test.MembershipId);
        Assert.Equal(75, test.ScorePercent);
        Assert.Null(test.CorrectCount);
        Assert.Null(test.TotalCount);
        var mock = Assert.Single((await client.GetFromJsonAsync<List<TeacherMockResultView>>(
            "/api/v1/teacher/mocks/results"))!);
        Assert.Equal(own, mock.MembershipId);
        Assert.Null(mock.Score);
        var task = Assert.Single((await client.GetFromJsonAsync<List<TeacherMockTaskView>>(
            "/api/v1/teacher/mocks/tasks"))!);
        Assert.Equal(own, task.MembershipId);
        Assert.Null(task.EarnedPoints);

        foreach (var path in new[] { "tests/history", "mocks/results", "mocks/tasks" })
        {
            var response = await client.GetAsync($"/api/v1/teacher/{path}?membershipId={foreign}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("[]", await response.Content.ReadAsStringAsync());
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync("/api/v1/teacher/mocks/results")).StatusCode);
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
        var program = await db.Programs.SingleOrDefaultAsync(x => x.WorkspaceId == workspaceId && x.Code == "MATH")
            ?? new LearningProgram
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

    private static async Task<Guid> SeedProgramAsync(ApiFactory factory, Guid workspaceId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var program = new LearningProgram
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId,
            Code = "SYNTHETIC", DisplayName = "Synthetic subject"
        };
        db.Programs.Add(program);
        await db.SaveChangesAsync();
        return program.Id;
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

    private static async Task SeedHomeworkAsync(ApiFactory factory, Guid workspaceId, Guid membershipId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var member = await db.WorkspaceStudentMemberships.SingleAsync(x => x.Id == membershipId);
        var assignedAt = DateTimeOffset.UtcNow.AddHours(-2);
        var catalog = new HomeworkCatalogItem
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, ProgramId = member.ProgramId,
            HomeworkId = "synthetic-hw", TaskNumber = 6, Name = "Synthetic homework",
            Url = "https://tests.invalid/homework", IsActive = true, SortOrder = 1, CreatedAt = assignedAt
        };
        db.HomeworkCatalogItems.Add(catalog);
        await db.SaveChangesAsync();
        var assignment = new HomeworkAssignment
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member.Id,
            StudentId = member.StudentId, ProgramId = member.ProgramId, CatalogItemId = catalog.Id,
            AssignmentRecordId = "synthetic-assignment", HomeworkId = catalog.HomeworkId,
            TaskNumber = 6, Name = catalog.Name, Url = catalog.Url, AssignedAt = assignedAt,
            DeadlineAt = assignedAt.AddHours(24), Status = "assigned", SchemaVersion = "2"
        };
        db.HomeworkAssignments.Add(assignment);
        await db.SaveChangesAsync();
        db.HomeworkSubmissions.Add(new HomeworkSubmission
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, AssignmentId = assignment.Id,
            MembershipId = member.Id, StudentId = member.StudentId, ProgramId = member.ProgramId,
            EventId = "synthetic-event", ScorePercent = 80, DurationSeconds = 60,
            CompletedAt = assignedAt.AddMinutes(30), IsLate = false, SchemaVersion = "2",
            CreatedAt = assignedAt.AddMinutes(30)
        });
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> SeedCatalogAsync(ApiFactory factory, Guid workspaceId, Guid membershipId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var member = await db.WorkspaceStudentMemberships.SingleAsync(x => x.Id == membershipId);
        var item = new HomeworkCatalogItem
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, ProgramId = member.ProgramId,
            HomeworkId = "batch-hw", TaskNumber = 6, Name = "Batch homework",
            Url = "https://tests.invalid/batch-hw", IsActive = true, SortOrder = 1,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.HomeworkCatalogItems.Add(item);
        await db.SaveChangesAsync();
        return item.Id;
    }

    private static async Task SeedResultsAsync(ApiFactory factory, Guid workspaceId, Guid membershipId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var member = await db.WorkspaceStudentMemberships.SingleAsync(x => x.Id == membershipId);
        var date = new DateOnly(2026, 11, 1);
        var now = DateTimeOffset.UtcNow;
        db.HistoricalTestResults.Add(new HistoricalTestResult
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member.Id,
            StudentId = member.StudentId, ProgramId = member.ProgramId,
            EventId = "synthetic-test", TestId = "test-1", TestDate = date,
            TopicId = "topic", TopicName = "Topic", TaskNumber = 6,
            ScorePercent = 75, DurationSeconds = 120, ServerSubmittedAt = now, SchemaVersion = "2"
        });
        db.HistoricalMockResults.Add(new HistoricalMockResult
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member.Id,
            StudentId = member.StudentId, ProgramId = member.ProgramId,
            EventId = "synthetic-mock", MockId = "mock-1", MockDate = date,
            VariantName = "Variant", PrimaryScore = 6, MaxPrimaryScore = 10,
            ScorePercent = 60, ServerSubmittedAt = now, SchemaVersion = "2"
        });
        db.HistoricalMockTaskResults.Add(new HistoricalMockTaskResult
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member.Id,
            StudentId = member.StudentId, ProgramId = member.ProgramId,
            EventId = "synthetic-mock", MockId = "mock-1", MockDate = date,
            TaskNumber = 6, TopicId = "topic", TopicName = "Topic",
            IsCorrect = false, Answered = true, ServerSubmittedAt = now, SchemaVersion = "2"
        });
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
