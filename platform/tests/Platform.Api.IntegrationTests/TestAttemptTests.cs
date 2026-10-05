using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;
using TestingHosting.Platform.TestAttempts;

namespace TestingHosting.Platform.IntegrationTests;

public sealed class TestAttemptTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task TestAttemptMigrationIsAppliedToRealPostgresWithNoPendingMigrations()
    {
        await ResetDatabaseAsync();
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();

        var applied = await db.Database.GetAppliedMigrationsAsync();

        Assert.Contains(applied, migration => migration.EndsWith("_TestAttempts", StringComparison.Ordinal));
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.True(await db.Database.CanConnectAsync());
    }

    [Fact]
    public async Task MissingInvalidAndNonStudentAuthenticationCannotWrite()
    {
        await ResetDatabaseAsync();
        using var client = factory.CreateClient();
        var payload = ValidPayload("auth-event");

        var missing = await client.PostAsJsonAsync("/api/v1/test-attempts", payload);
        var invalid = await SendAsync(client, "not-a-jwt", payload);
        var nonStudent = await SendAsync(client, CreateToken([], role: "teacher"), payload);

        Assert.Equal(HttpStatusCode.Unauthorized, missing.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, invalid.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, nonStudent.StatusCode);
        Assert.Equal(0, await AttemptCountAsync());
    }

    [Fact]
    public async Task SuccessfulWriteUsesOnlyCurrentTokenIdentityAndDatabaseMembership()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("identity-school", "IDENTITY-CODE");
        using var client = factory.CreateClient();
        var payload = ValidPayload("identity-event") with
        {
            TestId = "  algebra-test  ",
            Topic = "  Synthetic algebra  ",
            SchemaVersion = "  1.0  "
        };
        var body = JsonSerializer.SerializeToNode(payload, JsonOptions)!.AsObject();
        body["workspaceId"] = Guid.NewGuid();
        body["membershipId"] = Guid.NewGuid();
        body["studentId"] = Guid.NewGuid();
        body["programId"] = Guid.NewGuid();

        var response = await SendAsync(client, CreateToken(identity), body);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        var result = await ReadAttemptResponseAsync(response);
        Assert.False(result.Duplicate);
        Assert.Equal(payload.EventId, result.EventId);
        Assert.Equal($"/api/v1/test-attempts/{result.AttemptId}", response.Headers.Location?.ToString());

        await using var scope = factory.Services.CreateAsyncScope();
        var stored = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().TestAttempts
            .AsNoTracking().SingleAsync();
        Assert.Equal(identity.WorkspaceId, stored.WorkspaceId);
        Assert.Equal(identity.MembershipId, stored.MembershipId);
        Assert.Equal(identity.StudentId, stored.StudentId);
        Assert.Equal(identity.ProgramId, stored.ProgramId);
        Assert.Equal("algebra-test", stored.TestId);
        Assert.Equal("Synthetic algebra", stored.Topic);
        Assert.Equal("1.0", stored.SchemaVersion);

        var requestProperties = typeof(TestAttemptRequest).GetProperties()
            .Select(property => property.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain("workspaceId", requestProperties);
        Assert.DoesNotContain("membershipId", requestProperties);
        Assert.DoesNotContain("studentId", requestProperties);
        Assert.DoesNotContain("programId", requestProperties);
    }

    [Fact]
    public async Task UnknownAndCrossedIdentityClaimsReturnGenericUnauthorizedWithoutWrites()
    {
        await ResetDatabaseAsync();
        var first = await SeedIdentityAsync("claims-a", "CLAIMS-A");
        var second = await SeedIdentityAsync("claims-b", "CLAIMS-B");
        using var client = factory.CreateClient();
        var identities = new[]
        {
            new SeededIdentity(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()),
            first with { StudentId = second.StudentId },
            first with { MembershipId = second.MembershipId },
            first with { WorkspaceId = second.WorkspaceId }
        };

        foreach (var (identity, index) in identities.Select((value, index) => (value, index)))
        {
            var response = await SendAsync(client, CreateToken(identity), ValidPayload($"foreign-{index}"));
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
            await AssertGenericProblemAsync(response, 401, "The student session is invalid.", first, second);
        }

        Assert.Equal(0, await AttemptCountAsync());
    }

    [Theory]
    [InlineData("workspace")]
    [InlineData("student")]
    [InlineData("membership")]
    [InlineData("program")]
    public async Task InactiveIdentityAfterTokenIssuanceCannotWrite(string inactiveEntity)
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync($"inactive-{inactiveEntity}", $"CODE-{inactiveEntity}");
        var token = CreateToken(identity);
        await SetActiveAsync(identity, inactiveEntity, active: false);
        using var client = factory.CreateClient();

        var response = await SendAsync(client, token, ValidPayload($"inactive-{inactiveEntity}"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        await AssertGenericProblemAsync(response, 401, "The student session is invalid.", identity);
        Assert.Equal(0, await AttemptCountAsync());
    }

    [Fact]
    public async Task RequiredAndOversizedStringsAreRejectedWithoutWrites()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("string-validation", "STRING-CODE");
        using var client = factory.CreateClient();

        var required = await SendAsync(client, CreateToken(identity), ValidPayload("unused") with
        {
            EventId = " ",
            TestId = null,
            Topic = "\t",
            SchemaVersion = ""
        });
        var oversized = await SendAsync(client, CreateToken(identity), ValidPayload(new string('e', 129)) with
        {
            TestId = new string('t', 129),
            Topic = new string('o', 201),
            SchemaVersion = new string('s', 65)
        });

        await AssertValidationAsync(required, "eventId", "testId", "topic", "schemaVersion");
        await AssertValidationAsync(oversized, "eventId", "testId", "topic", "schemaVersion");
        Assert.Equal(0, await AttemptCountAsync());
    }

    [Fact]
    public async Task TaskAndCountRangesCorrectTotalAndFloorPercentAreValidatedWithoutWrites()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("numeric-validation", "NUMERIC-CODE");
        var token = CreateToken(identity);
        using var client = factory.CreateClient();

        var missing = await SendAsync(client, token, ValidPayload("numeric-missing") with
        {
            TaskNumber = null,
            Correct = null,
            Total = null,
            Percent = null
        });
        var lowerRanges = await SendAsync(client, token, ValidPayload("numeric-lower-ranges") with
        {
            TaskNumber = 0,
            Correct = -1,
            Total = 0,
            Percent = -1
        });
        var upperRanges = await SendAsync(client, token, ValidPayload("numeric-upper-ranges") with
        {
            TaskNumber = 1001,
            Correct = 10001,
            Total = 10001,
            Percent = 101
        });
        var correctAboveTotal = await SendAsync(client, token, ValidPayload("numeric-above") with
        {
            Correct = 4,
            Total = 3,
            Percent = 100
        });
        var mismatch = await SendAsync(client, token, ValidPayload("numeric-mismatch") with
        {
            Correct = 2,
            Total = 3,
            Percent = 67
        });

        await AssertValidationAsync(missing, "taskNumber", "correct", "total", "percent");
        await AssertValidationAsync(lowerRanges, "taskNumber", "correct", "total", "percent");
        await AssertValidationAsync(upperRanges, "taskNumber", "correct", "total", "percent");
        await AssertValidationAsync(correctAboveTotal, "correct");
        await AssertValidationAsync(mismatch, "percent");

        var floorRule = await SendAsync(client, token, ValidPayload("numeric-floor") with
        {
            Correct = 2,
            Total = 3,
            Percent = 66
        });
        Assert.Equal(HttpStatusCode.Created, floorRule.StatusCode);
        Assert.Equal(1, await AttemptCountAsync());
    }

    [Fact]
    public async Task TimestampAndDurationRulesAreValidatedWithoutWrites()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("time-validation", "TIME-CODE");
        var token = CreateToken(identity);
        using var client = factory.CreateClient();
        var now = DateTimeOffset.UtcNow;

        var missing = await SendAsync(client, token, ValidPayload("time-missing") with
        {
            StartedAt = null,
            CompletedAt = null,
            DurationSeconds = null
        });
        var reversed = await SendAsync(client, token, ValidPayload("time-reversed") with
        {
            StartedAt = now.AddMinutes(-1),
            CompletedAt = now.AddMinutes(-2),
            DurationSeconds = 0
        });
        var future = await SendAsync(client, token, ValidPayload("time-future") with
        {
            StartedAt = now.AddMinutes(8),
            CompletedAt = now.AddMinutes(10),
            DurationSeconds = 120
        });
        var mismatch = await SendAsync(client, token, ValidPayload("time-mismatch") with
        {
            StartedAt = now.AddMinutes(-2),
            CompletedAt = now.AddMinutes(-1),
            DurationSeconds = 59
        });
        var durationRange = await SendAsync(client, token, ValidPayload("time-range") with
        {
            DurationSeconds = 86_401
        });
        var negativeDuration = await SendAsync(client, token, ValidPayload("time-negative") with
        {
            DurationSeconds = -1
        });
        var elapsedMaximum = await SendAsync(client, token, ValidPayload("time-elapsed-max") with
        {
            StartedAt = now.AddDays(-2),
            CompletedAt = now.AddMinutes(-1),
            DurationSeconds = 86_400
        });

        await AssertValidationAsync(missing, "startedAt", "completedAt", "durationSeconds");
        await AssertValidationAsync(reversed, "completedAt");
        await AssertValidationAsync(future, "completedAt");
        await AssertValidationAsync(mismatch, "durationSeconds");
        await AssertValidationAsync(durationRange, "durationSeconds");
        await AssertValidationAsync(negativeDuration, "durationSeconds");
        await AssertValidationAsync(elapsedMaximum, "durationSeconds");
        Assert.Equal(0, await AttemptCountAsync());
    }

    [Fact]
    public async Task ExactReplayIsIdempotentAndChangedReplayConflictsWithoutLeakingStudentData()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("replay-school", "REPLAY-CODE");
        using var client = factory.CreateClient();
        var token = CreateToken(identity);
        var payload = ValidPayload("replay-event");

        var created = await SendAsync(client, token, payload);
        var first = await ReadAttemptResponseAsync(created);
        var replay = await SendAsync(client, token, payload);
        var duplicate = await ReadAttemptResponseAsync(replay);
        var conflict = await SendAsync(client, token, payload with { Topic = "Different synthetic topic" });

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal("application/json", replay.Content.Headers.ContentType?.MediaType);
        Assert.False(first.Duplicate);
        Assert.True(duplicate.Duplicate);
        Assert.Equal(first.AttemptId, duplicate.AttemptId);
        Assert.Equal(first.CreatedAt, duplicate.CreatedAt);
        Assert.Equal(first.MonthlyBest, duplicate.MonthlyBest);
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        Assert.Equal("application/problem+json", conflict.Content.Headers.ContentType?.MediaType);
        await AssertGenericProblemAsync(
            conflict,
            409,
            "The event ID is already associated with a different test attempt.",
            identity);
        Assert.Equal(1, await AttemptCountAsync());
    }

    [Fact]
    public async Task ReplayPreservesHistoricalProgramAfterMembershipProgramReassignment()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("program-reassignment", "PROGRAM-REASSIGNMENT");
        using var client = factory.CreateClient();
        var token = CreateToken(identity);
        var originalPayload = ValidPayload("program-history-original");

        var createdResponse = await SendAsync(client, token, originalPayload);
        Assert.Equal(HttpStatusCode.Created, createdResponse.StatusCode);
        var created = await ReadAttemptResponseAsync(createdResponse);
        var currentProgramId = await ReassignMembershipProgramAsync(identity);

        var replayResponse = await SendAsync(client, token, originalPayload);
        var replay = await ReadAttemptResponseAsync(replayResponse);

        Assert.Equal(HttpStatusCode.OK, replayResponse.StatusCode);
        Assert.True(replay.Duplicate);
        Assert.Equal(created.AttemptId, replay.AttemptId);
        Assert.Equal(created.CreatedAt, replay.CreatedAt);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var stored = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().TestAttempts
                .AsNoTracking().SingleAsync();
            Assert.Equal(identity.ProgramId, stored.ProgramId);
        }

        var newResponse = await SendAsync(client, token, ValidPayload("program-history-new"));
        Assert.Equal(HttpStatusCode.Created, newResponse.StatusCode);
        await using var verificationScope = factory.Services.CreateAsyncScope();
        var attempts = await verificationScope.ServiceProvider.GetRequiredService<PlatformDbContext>().TestAttempts
            .AsNoTracking().OrderBy(attempt => attempt.EventId).ToListAsync();
        Assert.Collection(
            attempts,
            current =>
            {
                Assert.Equal("program-history-new", current.EventId);
                Assert.Equal(currentProgramId, current.ProgramId);
            },
            historical =>
            {
                Assert.Equal("program-history-original", historical.EventId);
                Assert.Equal(identity.ProgramId, historical.ProgramId);
            });
    }

    [Fact]
    public async Task DistinctEventsPreserveCompleteImmutableHistory()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("history-school", "HISTORY-CODE");
        using var client = factory.CreateClient();
        var token = CreateToken(identity);
        var firstPayload = ValidPayload("history-1") with { Topic = "First topic", TaskNumber = 1 };
        var secondPayload = ValidPayload("history-2") with
        {
            Topic = "Second topic",
            TaskNumber = 2,
            Correct = 8,
            Total = 10,
            Percent = 80
        };

        Assert.Equal(HttpStatusCode.Created, (await SendAsync(client, token, firstPayload)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await SendAsync(client, token, secondPayload)).StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var attempts = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().TestAttempts
            .AsNoTracking().OrderBy(attempt => attempt.EventId).ToListAsync();
        Assert.Collection(
            attempts,
            first =>
            {
                Assert.Equal("history-1", first.EventId);
                Assert.Equal("First topic", first.Topic);
                Assert.Equal(1, first.TaskNumber);
                Assert.Equal(identity.MembershipId, first.MembershipId);
            },
            second =>
            {
                Assert.Equal("history-2", second.EventId);
                Assert.Equal("Second topic", second.Topic);
                Assert.Equal(2, second.TaskNumber);
                Assert.Equal(80, second.Percent);
                Assert.Equal(identity.MembershipId, second.MembershipId);
            });
    }

    [Fact]
    public async Task ConcurrentIdenticalRequestsCreateOneRowAndReturnOnlyDuplicatesAfterWinner()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("concurrent-same", "CONCURRENT-SAME");
        using var client = factory.CreateClient();
        var token = CreateToken(identity);
        var payload = ValidPayload("concurrent-same-event");

        var responses = await Task.WhenAll(Enumerable.Range(0, 12)
            .Select(_ => SendAsync(client, token, payload)));

        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Created);
        Assert.Equal(11, responses.Count(response => response.StatusCode == HttpStatusCode.OK));
        var bodies = await Task.WhenAll(responses.Select(ReadAttemptResponseAsync));
        Assert.Single(bodies.Select(body => body.AttemptId).Distinct());
        Assert.Single(bodies.Select(body => body.CreatedAt).Distinct());
        Assert.Single(bodies, body => !body.Duplicate);
        Assert.Equal(11, bodies.Count(body => body.Duplicate));
        Assert.Equal(1, await AttemptCountAsync());
    }

    [Fact]
    public async Task ConcurrentDifferentRequestsForOneEventStoreOneWinnerAndConflictAllMismatches()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("concurrent-different", "CONCURRENT-DIFFERENT");
        using var client = factory.CreateClient();
        var token = CreateToken(identity);
        var payloads = Enumerable.Range(0, 10)
            .Select(index => ValidPayload("concurrent-different-event") with { Topic = $"Synthetic topic {index}" })
            .ToArray();

        var responses = await Task.WhenAll(payloads.Select(payload => SendAsync(client, token, payload)));

        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Created);
        Assert.Equal(9, responses.Count(response => response.StatusCode == HttpStatusCode.Conflict));
        Assert.All(responses.Where(response => response.StatusCode == HttpStatusCode.Conflict), response =>
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType));
        await using var scope = factory.Services.CreateAsyncScope();
        var stored = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().TestAttempts
            .AsNoTracking().SingleAsync();
        Assert.Contains(stored.Topic, payloads.Select(payload => payload.Topic));
    }

    [Fact]
    public async Task MonthlyBestRanksPercentDurationCompletionAndIdDeterministically()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("monthly-ranking", "MONTHLY-RANKING");
        using var client = factory.CreateClient();
        var token = CreateToken(identity);
        var completed = new DateTimeOffset(2026, 8, 15, 9, 0, 0, TimeSpan.Zero);

        var low = await PostCreatedAsync(client, token, ScoredPayload("rank-low", 70, 7, 10, 90, completed.AddMinutes(-3)));
        Assert.Equal(low.AttemptId, low.MonthlyBest.AttemptId);

        var highSlow = await PostCreatedAsync(client, token, ScoredPayload("rank-high-slow", 80, 8, 10, 120, completed.AddMinutes(-2)));
        Assert.Equal(highSlow.AttemptId, highSlow.MonthlyBest.AttemptId);

        var highFastLate = await PostCreatedAsync(client, token, ScoredPayload("rank-high-fast-late", 80, 8, 10, 60, completed));
        Assert.Equal(highFastLate.AttemptId, highFastLate.MonthlyBest.AttemptId);

        var highFastEarly = await PostCreatedAsync(client, token, ScoredPayload("rank-high-fast-early", 80, 8, 10, 60, completed.AddMinutes(-1)));
        Assert.Equal(highFastEarly.AttemptId, highFastEarly.MonthlyBest.AttemptId);

        var tiedOne = await PostCreatedAsync(client, token, ScoredPayload("rank-tie-1", 90, 9, 10, 30, completed.AddMinutes(1)));
        var tiedTwo = await PostCreatedAsync(client, token, ScoredPayload("rank-tie-2", 90, 9, 10, 30, completed.AddMinutes(1)));
        await using var scope = factory.Services.CreateAsyncScope();
        var expectedIdWinner = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().TestAttempts
            .Where(attempt => attempt.EventId == "rank-tie-1" || attempt.EventId == "rank-tie-2")
            .OrderBy(attempt => attempt.Id)
            .Select(attempt => attempt.Id)
            .FirstAsync();
        Assert.Equal(expectedIdWinner, tiedTwo.MonthlyBest.AttemptId);

        var replay = await SendAsync(client, token, ValidPayload("rank-tie-1") with
        {
            Correct = 9,
            Total = 10,
            Percent = 90,
            DurationSeconds = 30,
            StartedAt = completed.AddMinutes(1).AddSeconds(-30),
            CompletedAt = completed.AddMinutes(1)
        });
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal(expectedIdWinner, (await ReadAttemptResponseAsync(replay)).MonthlyBest.AttemptId);
        Assert.Contains(expectedIdWinner, new[] { tiedOne.AttemptId, tiedTwo.AttemptId });
    }

    [Fact]
    public async Task MonthlyBestIsIsolatedByTestMembershipAndWorkspace()
    {
        await ResetDatabaseAsync();
        var primary = await SeedIdentityAsync("monthly-isolation", "MONTHLY-PRIMARY");
        var sibling = await AddIdentityToWorkspaceAsync(primary.WorkspaceId, "MONTHLY-SIBLING");
        var otherWorkspace = await SeedIdentityAsync("monthly-other", "MONTHLY-OTHER");
        using var client = factory.CreateClient();
        var completed = new DateTimeOffset(2026, 7, 10, 10, 0, 0, TimeSpan.Zero);

        var primaryBest = await PostCreatedAsync(client, CreateToken(primary),
            ScoredPayload("isolation-primary", 80, 8, 10, 60, completed));
        var otherTest = await PostCreatedAsync(client, CreateToken(primary),
            ScoredPayload("isolation-test", 100, 10, 10, 30, completed) with { TestId = "other-test" });
        var siblingBest = await PostCreatedAsync(client, CreateToken(sibling),
            ScoredPayload("isolation-sibling", 100, 10, 10, 30, completed));
        var workspaceBest = await PostCreatedAsync(client, CreateToken(otherWorkspace),
            ScoredPayload("isolation-workspace", 100, 10, 10, 30, completed));
        var primaryFollowup = await PostCreatedAsync(client, CreateToken(primary),
            ScoredPayload("isolation-followup", 70, 7, 10, 40, completed.AddMinutes(1)));

        Assert.Equal(otherTest.AttemptId, otherTest.MonthlyBest.AttemptId);
        Assert.Equal(siblingBest.AttemptId, siblingBest.MonthlyBest.AttemptId);
        Assert.Equal(workspaceBest.AttemptId, workspaceBest.MonthlyBest.AttemptId);
        Assert.Equal(primaryBest.AttemptId, primaryFollowup.MonthlyBest.AttemptId);
    }

    [Fact]
    public async Task MonthlyBestUsesEuropeMoscowCalendarMonthBoundary()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("moscow-boundary", "MOSCOW-BOUNDARY");
        using var client = factory.CreateClient();
        var token = CreateToken(identity);
        var marchUtc = new DateTimeOffset(2026, 3, 31, 20, 59, 59, TimeSpan.Zero);
        var aprilUtc = new DateTimeOffset(2026, 3, 31, 21, 0, 0, TimeSpan.Zero);

        var march = await PostCreatedAsync(client, token, ScoredPayload("moscow-march", 100, 10, 10, 60, marchUtc));
        var april = await PostCreatedAsync(client, token, ScoredPayload("moscow-april", 50, 5, 10, 60, aprilUtc));

        Assert.Equal(march.AttemptId, march.MonthlyBest.AttemptId);
        Assert.Equal(april.AttemptId, april.MonthlyBest.AttemptId);
        await using var scope = factory.Services.CreateAsyncScope();
        var monthKeys = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().TestAttempts
            .AsNoTracking().OrderBy(attempt => attempt.EventId)
            .Select(attempt => new { attempt.EventId, attempt.MoscowMonthKey })
            .ToListAsync();
        Assert.Equal("2026-04", monthKeys.Single(attempt => attempt.EventId == "moscow-april").MoscowMonthKey);
        Assert.Equal("2026-03", monthKeys.Single(attempt => attempt.EventId == "moscow-march").MoscowMonthKey);
    }

    [Fact]
    public async Task DatabaseRejectsMoscowMonthKeyThatDisagreesWithCompletionInstant()
    {
        await ResetDatabaseAsync();
        var identity = await SeedIdentityAsync("month-constraint", "MONTH-CONSTRAINT");
        var completedAt = new DateTimeOffset(2026, 3, 31, 21, 0, 0, TimeSpan.Zero);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            db.TestAttempts.Add(new TestAttempt
            {
                Id = Guid.NewGuid(),
                WorkspaceId = identity.WorkspaceId,
                MembershipId = identity.MembershipId,
                StudentId = identity.StudentId,
                ProgramId = identity.ProgramId,
                EventId = "invalid-month-key",
                TestId = "synthetic-test",
                Topic = "Synthetic topic",
                TaskNumber = 1,
                Correct = 1,
                Total = 1,
                Percent = 100,
                StartedAt = completedAt.AddSeconds(-60),
                CompletedAt = completedAt,
                DurationSeconds = 60,
                SchemaVersion = "1.0",
                MoscowMonthKey = "2026-03",
                CreatedAt = DateTimeOffset.UtcNow
            });

            var exception = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            var postgres = Assert.IsType<PostgresException>(exception.InnerException);
            Assert.Equal(PostgresErrorCodes.CheckViolation, postgres.SqlState);
            Assert.Equal("CK_TestAttempts_MoscowMonthKey", postgres.ConstraintName);
        }

        await using var verificationScope = factory.Services.CreateAsyncScope();
        var verificationDb = verificationScope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Equal(0, await verificationDb.TestAttempts.CountAsync());
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
        var workspace = new Workspace { Id = Guid.NewGuid(), Slug = workspaceSlug };
        db.Add(workspace);
        return await AddIdentityAsync(db, scope.ServiceProvider.GetRequiredService<IStudentCodeHasher>(), workspace, code);
    }

    private async Task<SeededIdentity> AddIdentityToWorkspaceAsync(Guid workspaceId, string code)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var workspace = await db.Workspaces.SingleAsync(value => value.Id == workspaceId);
        return await AddIdentityAsync(db, scope.ServiceProvider.GetRequiredService<IStudentCodeHasher>(), workspace, code);
    }

    private static async Task<SeededIdentity> AddIdentityAsync(
        PlatformDbContext db,
        IStudentCodeHasher hasher,
        Workspace workspace,
        string code)
    {
        Assert.True(hasher.TryNormalizeWorkspace(workspace.Slug, out var normalizedWorkspace));
        Assert.True(hasher.TryNormalizeCode(code, out var normalizedCode));
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var program = new LearningProgram
        {
            Id = Guid.NewGuid(),
            Workspace = workspace,
            WorkspaceId = workspace.Id,
            Code = $"PROGRAM_{suffix}",
            DisplayName = $"Synthetic program {suffix}"
        };
        var student = new Student { Id = Guid.NewGuid(), DisplayName = $"Synthetic student {suffix}" };
        var membership = new WorkspaceStudentMembership
        {
            Id = Guid.NewGuid(),
            Workspace = workspace,
            WorkspaceId = workspace.Id,
            Student = student,
            StudentId = student.Id,
            Program = program,
            ProgramId = program.Id,
            CodeHash = hasher.Hash(normalizedWorkspace, normalizedCode),
            ImportSource = "test-attempt-fixture",
            ImportExternalId = suffix
        };
        db.Add(membership);
        await db.SaveChangesAsync();
        return new(workspace.Id, membership.Id, student.Id, program.Id);
    }

    private async Task SetActiveAsync(SeededIdentity identity, string entity, bool active)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        _ = entity switch
        {
            "workspace" => await db.Workspaces.Where(value => value.Id == identity.WorkspaceId)
                .ExecuteUpdateAsync(setters => setters.SetProperty(value => value.IsActive, active)),
            "student" => await db.Students.Where(value => value.Id == identity.StudentId)
                .ExecuteUpdateAsync(setters => setters.SetProperty(value => value.IsActive, active)),
            "membership" => await db.WorkspaceStudentMemberships.Where(value => value.Id == identity.MembershipId)
                .ExecuteUpdateAsync(setters => setters.SetProperty(value => value.IsActive, active)),
            "program" => await db.Programs.Where(value => value.Id == identity.ProgramId)
                .ExecuteUpdateAsync(setters => setters.SetProperty(value => value.IsActive, active)),
            _ => throw new ArgumentOutOfRangeException(nameof(entity), entity, null)
        };
    }

    private async Task<Guid> ReassignMembershipProgramAsync(SeededIdentity identity)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var programId = Guid.NewGuid();
        db.Programs.Add(new LearningProgram
        {
            Id = programId,
            WorkspaceId = identity.WorkspaceId,
            Code = $"REASSIGNED_{Guid.NewGuid():N}",
            DisplayName = "Synthetic reassigned program"
        });
        await db.SaveChangesAsync();
        var updated = await db.WorkspaceStudentMemberships
            .Where(membership => membership.Id == identity.MembershipId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(membership => membership.ProgramId, programId));
        Assert.Equal(1, updated);
        return programId;
    }

    private async Task<int> AttemptCountAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().TestAttempts.CountAsync();
    }

    private static string CreateToken(SeededIdentity identity, string role = "student") => CreateToken(
        [
            new Claim(JwtRegisteredClaimNames.Sub, identity.StudentId.ToString()),
            new Claim("workspace_id", identity.WorkspaceId.ToString()),
            new Claim("membership_id", identity.MembershipId.ToString())
        ],
        role);

    private static string CreateToken(IEnumerable<Claim> identityClaims, string role)
    {
        var now = DateTime.UtcNow;
        var claims = identityClaims.Append(new Claim("role", role));
        var token = new JwtSecurityToken(
            issuer: ApiFactory.Issuer,
            audience: ApiFactory.Audience,
            claims: claims,
            notBefore: now.AddMinutes(-1),
            expires: now.AddMinutes(5),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Convert.FromBase64String(ApiFactory.SigningKey)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static async Task<HttpResponseMessage> SendAsync(HttpClient client, string token, object body)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/test-attempts")
        {
            Content = JsonContent.Create(body, options: JsonOptions)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await client.SendAsync(request);
    }

    private static async Task<AttemptResponse> PostCreatedAsync(HttpClient client, string token, AttemptPayload payload)
    {
        var response = await SendAsync(client, token, payload);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await ReadAttemptResponseAsync(response);
    }

    private static async Task<AttemptResponse> ReadAttemptResponseAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadFromJsonAsync<AttemptResponse>(JsonOptions);
        return Assert.IsType<AttemptResponse>(body);
    }

    private static async Task AssertValidationAsync(HttpResponseMessage response, params string[] fields)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(400, body.RootElement.GetProperty("status").GetInt32());
        var errors = body.RootElement.GetProperty("errors");
        foreach (var field in fields)
        {
            Assert.True(errors.TryGetProperty(field, out var messages), $"Expected a validation error for '{field}'.");
            Assert.NotEqual(0, messages.GetArrayLength());
        }
    }

    private static async Task AssertGenericProblemAsync(
        HttpResponseMessage response,
        int status,
        string title,
        params SeededIdentity[] identities)
    {
        var json = await response.Content.ReadAsStringAsync();
        using var body = JsonDocument.Parse(json);
        Assert.Equal(status, body.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(title, body.RootElement.GetProperty("title").GetString());
        foreach (var identity in identities)
        {
            Assert.DoesNotContain(identity.StudentId.ToString(), json, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(identity.MembershipId.ToString(), json, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(identity.WorkspaceId.ToString(), json, StringComparison.OrdinalIgnoreCase);
        }
    }

    private static AttemptPayload ValidPayload(string eventId)
    {
        var completed = DateTimeOffset.UtcNow.AddMinutes(-1);
        return new(
            eventId,
            "synthetic-test",
            "Synthetic topic",
            3,
            7,
            10,
            70,
            completed.AddSeconds(-60),
            completed,
            60,
            "1.0");
    }

    private static AttemptPayload ScoredPayload(
        string eventId,
        int percent,
        int correct,
        int total,
        int durationSeconds,
        DateTimeOffset completedAt) =>
        ValidPayload(eventId) with
        {
            Correct = correct,
            Total = total,
            Percent = percent,
            DurationSeconds = durationSeconds,
            StartedAt = completedAt.AddSeconds(-durationSeconds),
            CompletedAt = completedAt
        };

    private sealed record SeededIdentity(Guid WorkspaceId, Guid MembershipId, Guid StudentId, Guid ProgramId);

    private sealed record AttemptPayload(
        string? EventId,
        string? TestId,
        string? Topic,
        int? TaskNumber,
        int? Correct,
        int? Total,
        int? Percent,
        DateTimeOffset? StartedAt,
        DateTimeOffset? CompletedAt,
        int? DurationSeconds,
        string? SchemaVersion);

    private sealed record AttemptResponse(
        Guid AttemptId,
        string EventId,
        bool Duplicate,
        DateTimeOffset CreatedAt,
        MonthlyBest MonthlyBest);

    private sealed record MonthlyBest(Guid AttemptId, int Percent, int DurationSeconds, DateTimeOffset CompletedAt);
}
