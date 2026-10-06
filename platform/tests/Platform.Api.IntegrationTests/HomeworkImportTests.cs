using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TestingHosting.Platform.HomeworkImport;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.StudentImport;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.IntegrationTests;

public sealed class HomeworkImportTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task DryRunDoesNotWriteAndApplyIsRepeatableWithReconciliation()
    {
        await ResetDatabaseAsync();
        var identity = await SeedImportedStudentAsync("homework-import", "student-legacy-1");
        var parsed = Workbook(identity.ProgramSourceId, identity.StudentExternalId);
        var programMap = ProgramMap(identity.ProgramSourceId, identity.ProgramCode);
        var service = CreateService();

        var dryRun = await service.ExecuteAsync(parsed, programMap, identity.WorkspaceSlug, apply: false);

        Assert.True(dryRun.CanApply);
        Assert.Equal(1, dryRun.CatalogCreateCount);
        Assert.Equal(1, dryRun.AssignmentCreateCount);
        Assert.Equal(1, dryRun.SubmissionCreateCount);
        await AssertCountsAsync(0, 0, 0);
        await AssertBatchCountAsync(0);

        var applied = await service.ExecuteAsync(parsed, programMap, identity.WorkspaceSlug, apply: true);
        Assert.True(applied.CanApply);
        Assert.Equal(1, applied.CatalogCreateCount);
        Assert.Equal(1, applied.AssignmentCreateCount);
        Assert.Equal(1, applied.SubmissionCreateCount);
        await AssertCountsAsync(1, 1, 1);
        await AssertBatchCountAsync(1);

        var repeated = await service.ExecuteAsync(parsed, programMap, identity.WorkspaceSlug, apply: true);
        Assert.True(repeated.CanApply);
        Assert.Equal(0, repeated.CatalogCreateCount);
        Assert.Equal(1, repeated.CatalogUnchangedCount);
        Assert.Equal(0, repeated.AssignmentCreateCount);
        Assert.Equal(1, repeated.AssignmentUnchangedCount);
        Assert.Equal(0, repeated.SubmissionCreateCount);
        Assert.Equal(1, repeated.SubmissionUnchangedCount);
        await AssertCountsAsync(1, 1, 1);
        await AssertBatchCountAsync(1);

        await using var scope = factory.Services.CreateAsyncScope();
        var batch = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>()
            .HomeworkImportBatches.AsNoTracking().SingleAsync();
        Assert.Equal("applied", batch.Status);
        Assert.Equal(1, batch.CatalogRowCount);
        Assert.Equal(1, batch.AssignmentRowCount);
        Assert.Equal(1, batch.SubmissionRowCount);
    }

    [Fact]
    public async Task UnknownStudentBlocksWholeApplyWithoutPartialWrites()
    {
        await ResetDatabaseAsync();
        var identity = await SeedImportedStudentAsync("homework-import-invalid", "known-student");
        var parsed = Workbook(identity.ProgramSourceId, "missing-student");
        var service = CreateService();

        var report = await service.ExecuteAsync(
            parsed,
            ProgramMap(identity.ProgramSourceId, identity.ProgramCode),
            identity.WorkspaceSlug,
            apply: true);

        Assert.False(report.CanApply);
        Assert.Contains(report.Diagnostics, x => x.Field == "studentId" && x.Category == "unknown_student");
        await AssertCountsAsync(0, 0, 0);
    }

    [Fact]
    public async Task ExistingAssignmentConflictBlocksApplyAndPreservesDatabase()
    {
        await ResetDatabaseAsync();
        var identity = await SeedImportedStudentAsync("homework-import-conflict", "student-conflict");
        var service = CreateService();
        var parsed = Workbook(identity.ProgramSourceId, identity.StudentExternalId);
        var map = ProgramMap(identity.ProgramSourceId, identity.ProgramCode);
        Assert.True((await service.ExecuteAsync(parsed, map, identity.WorkspaceSlug, apply: true)).CanApply);

        var changedAssignment = parsed.Assignments[0] with { Name = "Changed source snapshot" };
        var changed = parsed with { Assignments = [changedAssignment] };
        var report = await service.ExecuteAsync(changed, map, identity.WorkspaceSlug, apply: true);

        Assert.False(report.CanApply);
        Assert.Contains(report.Diagnostics, x => x.Field == "assignmentRecordId" && x.Category == "existing_conflict");
        await AssertCountsAsync(1, 1, 1);
    }

    [Fact]
    public async Task JournalReplayRejectsDatabaseDrift()
    {
        await ResetDatabaseAsync();
        var identity = await SeedImportedStudentAsync("homework-import-drift", "student-drift");
        var workbook = Workbook(identity.ProgramSourceId, identity.StudentExternalId);
        var map = ProgramMap(identity.ProgramSourceId, identity.ProgramCode);
        var service = CreateService();
        Assert.True((await service.ExecuteAsync(workbook, map, identity.WorkspaceSlug, apply: true)).CanApply);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.HomeworkSubmissions.ExecuteDeleteAsync();
        }

        var replay = await service.ExecuteAsync(workbook, map, identity.WorkspaceSlug, apply: true);

        Assert.False(replay.CanApply);
        Assert.Contains(replay.Diagnostics, x => x.Field == "importBatch" && x.Category == "existing_state_conflict");
        await AssertCountsAsync(1, 1, 0);
        await AssertBatchCountAsync(1);
    }

    [Fact]
    public async Task JournalFailureRollsBackImportedRowsAndBatch()
    {
        await ResetDatabaseAsync();
        var identity = await SeedImportedStudentAsync("homework-import-rollback", "student-rollback");
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.Database.ExecuteSqlRawAsync("""
                CREATE OR REPLACE FUNCTION platform.reject_homework_import_batch() RETURNS trigger
                LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic journal failure'; END; $$;
                CREATE TRIGGER reject_homework_import_batch
                BEFORE INSERT ON platform."HomeworkImportBatches"
                FOR EACH ROW EXECUTE FUNCTION platform.reject_homework_import_batch();
                """);
        }

        try
        {
            await Assert.ThrowsAsync<DbUpdateException>(() => CreateService().ExecuteAsync(
                Workbook(identity.ProgramSourceId, identity.StudentExternalId),
                ProgramMap(identity.ProgramSourceId, identity.ProgramCode),
                identity.WorkspaceSlug,
                apply: true));
            await AssertCountsAsync(0, 0, 0);
            await AssertBatchCountAsync(0);
        }
        finally
        {
            await using var scope = factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.Database.ExecuteSqlRawAsync("""
                DROP TRIGGER IF EXISTS reject_homework_import_batch ON platform."HomeworkImportBatches";
                DROP FUNCTION IF EXISTS platform.reject_homework_import_batch();
                """);
        }
    }

    [Fact]
    public void XlsxParserUsesMoscowForNaiveDatesAndReportsMalformedDuplicateEssentials()
    {
        var path = Path.Combine(Path.GetTempPath(), $"homework-{Guid.NewGuid():N}.xlsx");
        try
        {
            using (var workbook = new XLWorkbook())
            {
                var catalog = workbook.AddWorksheet("ДЗ_Каталог");
                WriteRow(catalog, 1, "homeworkId", "taskNumber", "name", "url", "active", "order", "createdAt", "programId");
                WriteRow(catalog, 2, "hw-parser", 6, "Parser homework", "https://tests.invalid/parser", true, 1,
                    "15.08.2026", "legacy-ege");

                var assignments = workbook.AddWorksheet("ДЗ_Назначения");
                WriteRow(assignments, 1, "assignmentRecordId", "studentId", "homeworkId", "taskNumber", "homeworkName",
                    "homeworkUrl", "assignedAt", "deadlineAt", "submittedAt", "status", "scorePercent",
                    "homeworkEventId", "lessonId", "schemaVersion", "programId");
                WriteRow(assignments, 2, "assignment-parser", "student-1", "hw-parser", 6, "Parser homework",
                    "https://tests.invalid/parser", "2026-10-01 12:00:00", "2026-10-02 12:00:00",
                    "2026-10-01T12:30:00+05:00", "submitted", 80, "parser-event-1", "lesson-1", "2", "legacy-ege");
                WriteRow(assignments, 3, "assignment-parser", "student-1", "hw-parser", 6, "Parser homework",
                    "https://tests.invalid/parser", "2026-10-01 12:00:00", "2026-10-02 12:00:00",
                    "", "assigned", "", "", "lesson-2", "2", "legacy-ege");
                WriteRow(assignments, 4, "assignment-bad", "", "hw-parser", 6, "Parser homework",
                    "https://tests.invalid/parser", "not-a-date", "2026-10-02 12:00:00",
                    "", "assigned", "", "", "lesson-3", "2", "legacy-ege");
                workbook.SaveAs(path);
            }

            var parsed = new HomeworkWorkbookParser().Parse(path);

            Assert.Equal(64, parsed.Digest.Length);
            Assert.Equal(new DateTimeOffset(2026, 8, 14, 21, 0, 0, TimeSpan.Zero), parsed.Catalog[0].CreatedAt);
            Assert.Equal(new DateTimeOffset(2026, 10, 1, 9, 0, 0, TimeSpan.Zero), parsed.Assignments[0].AssignedAt);
            Assert.Equal(new DateTimeOffset(2026, 10, 1, 7, 30, 0, TimeSpan.Zero), parsed.Assignments[0].SubmittedAt);
            Assert.Contains(parsed.Diagnostics, x => x.Field == "assignmentRecordId" && x.Category == "duplicate_key");
            Assert.Contains(parsed.Diagnostics, x => x.Field == "studentId" && x.Category == "required");
            Assert.Contains(parsed.Diagnostics, x => x.Field == "assignedAt" && x.Category == "invalid_datetime");
        }
        finally
        {
            File.Delete(path);
        }
    }

    private HomeworkImportService CreateService()
    {
        var connectionString = Environment.GetEnvironmentVariable("TEST_DATABASE_CONNECTION_STRING")
            ?? throw new InvalidOperationException("TEST_DATABASE_CONNECTION_STRING is required.");
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseNpgsql(connectionString, postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "public"))
            .Options;
        return new HomeworkImportService(() => new PlatformDbContext(options));
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

    private async Task<SeededImportIdentity> SeedImportedStudentAsync(string workspaceSlug, string studentExternalId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var workspace = new TestingHosting.Platform.IdentityAccess.Workspace { Id = Guid.NewGuid(), Slug = workspaceSlug };
        var programCode = $"EGE_{Guid.NewGuid():N}"[..12].ToUpperInvariant();
        var program = new LearningProgram
        {
            Id = Guid.NewGuid(), Workspace = workspace, WorkspaceId = workspace.Id,
            Code = programCode, DisplayName = "Synthetic EGE"
        };
        var student = new Student { Id = Guid.NewGuid(), DisplayName = "Synthetic Student" };
        var membership = new WorkspaceStudentMembership
        {
            Id = Guid.NewGuid(), Workspace = workspace, WorkspaceId = workspace.Id,
            Student = student, StudentId = student.Id, Program = program, ProgramId = program.Id,
            CodeHash = Enumerable.Repeat((byte)7, 32).ToArray(),
            ImportSource = StudentImportService.ImportSource,
            ImportExternalId = studentExternalId
        };
        db.Add(membership);
        await db.SaveChangesAsync();
        return new(workspaceSlug, "legacy-ege", programCode, studentExternalId);
    }

    private static ParsedHomeworkWorkbook Workbook(string programSourceId, string studentExternalId)
    {
        var assigned = new DateTimeOffset(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);
        var completed = assigned.AddHours(10);
        return new ParsedHomeworkWorkbook(
            new string('A', 64),
            [new HomeworkCatalogImportRow(2, "HW-EGE06-1", 6, "Synthetic homework", "https://tests.invalid/hw", true, 1, assigned.AddDays(-1), programSourceId)],
            [new HomeworkAssignmentImportRow(
                2, "assignment-legacy-1", studentExternalId, "HW-EGE06-1", 6,
                "Synthetic homework", "https://tests.invalid/hw", assigned, assigned.AddHours(24),
                completed, "submitted", 80, "legacy-event-1", "lesson-1", "2", programSourceId)],
            []);
    }

    private static ParsedProgramMap ProgramMap(string sourceId, string code) => new(
        new string('B', 64),
        new Dictionary<string, ProgramMapEntry>(StringComparer.Ordinal)
        {
            [sourceId] = new ProgramMapEntry(sourceId, code, "Synthetic EGE")
        },
        []);

    private async Task AssertCountsAsync(int catalog, int assignments, int submissions)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Equal(catalog, await db.HomeworkCatalogItems.CountAsync());
        Assert.Equal(assignments, await db.HomeworkAssignments.CountAsync());
        Assert.Equal(submissions, await db.HomeworkSubmissions.CountAsync());
    }

    private async Task AssertBatchCountAsync(int batches)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Equal(batches, await db.HomeworkImportBatches.CountAsync());
    }

    private static void WriteRow(IXLWorksheet sheet, int rowNumber, params object[] values)
    {
        for (var column = 0; column < values.Length; column++)
        {
            var cell = sheet.Cell(rowNumber, column + 1);
            switch (values[column])
            {
                case string text:
                    cell.Value = text;
                    break;
                case int number:
                    cell.Value = number;
                    break;
                case bool flag:
                    cell.Value = flag;
                    break;
                case DateTime timestamp:
                    cell.Value = timestamp;
                    break;
                default:
                    throw new ArgumentException("Unsupported synthetic cell value.");
            }
        }
    }

    private sealed record SeededImportIdentity(
        string WorkspaceSlug,
        string ProgramSourceId,
        string ProgramCode,
        string StudentExternalId);
}
