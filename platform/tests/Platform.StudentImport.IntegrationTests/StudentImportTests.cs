using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.StudentImport;
using TestingHosting.Platform.StudentSessions;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.StudentImport.IntegrationTests;

public sealed class StudentImportTests
{
    private static readonly byte[] Pepper = Enumerable.Repeat((byte)0x53, 32).ToArray();

    [Fact]
    public async Task DefaultDryRunPredictsChangesAndLeavesDatabaseCompletelyUnchanged()
    {
        await ResetDatabaseAsync();
        using var input = ImportInput.Create();

        var report = await CreateRunner().RunAsync(input.WorkbookPath, input.MapPath, "synthetic-school", apply: false);

        Assert.True(report.CanApply);
        Assert.Equal("dry-run", report.Mode);
        Assert.Equal(1, report.WorkspaceCreateCount);
        Assert.Equal(1, report.ProgramCreateCount);
        Assert.Equal(1, report.StudentCreateCount);
        await using var db = CreateDbContext();
        Assert.Equal(0, await db.Workspaces.CountAsync());
        Assert.Equal(0, await db.Programs.CountAsync());
        Assert.Equal(0, await db.Students.CountAsync());
        Assert.Equal(0, await db.WorkspaceStudentMemberships.CountAsync());
        Assert.Equal(0, await db.StudentImportBatches.CountAsync());
    }

    [Fact]
    public async Task ApplyCreatesMappedEntitiesStoresOnlyHmacAndWorksWithStudentSessionExchange()
    {
        await ResetDatabaseAsync();
        using var input = ImportInput.Create();
        var hasher = new StudentCodeHasher(Pepper);

        var report = await CreateRunner(hasher).RunAsync(input.WorkbookPath, input.MapPath, "synthetic-school", apply: true);

        Assert.True(report.CanApply);
        Assert.Equal("apply", report.Mode);
        await using var db = CreateDbContext();
        var membership = await db.WorkspaceStudentMemberships
            .Include(item => item.Student)
            .Include(item => item.Program)
            .Include(item => item.Workspace)
            .SingleAsync();
        Assert.Equal(32, membership.CodeHash.Length);
        Assert.Equal(StudentImportService.ImportSource, membership.ImportSource);
        Assert.Equal("SYNTHETIC-001", membership.ImportExternalId);
        Assert.Equal("SYNTHETIC EGE", membership.Program.DisplayName);
        Assert.True(membership.Student.IsActive);
        Assert.True(membership.IsActive);
        Assert.Single(await db.StudentImportBatches.ToListAsync());

        var identity = await new StudentSessionService(db, hasher)
            .ExchangeAsync("synthetic-school", " synthetic-code-001 ", CancellationToken.None);
        Assert.NotNull(identity);
        Assert.Equal(membership.StudentId, identity.StudentId);
        Assert.Equal("EGE_MATH", identity.ProgramId);
    }

    [Fact]
    public async Task ExactRepeatIsIdempotentAndDoesNotCreateAnotherBatch()
    {
        await ResetDatabaseAsync();
        using var input = ImportInput.Create();
        var runner = CreateRunner();

        var first = await runner.RunAsync(input.WorkbookPath, input.MapPath, "synthetic-school", apply: true);
        var second = await runner.RunAsync(input.WorkbookPath, input.MapPath, "synthetic-school", apply: true);

        Assert.True(first.CanApply);
        Assert.True(second.CanApply);
        Assert.True(second.AlreadyApplied);
        Assert.Equal(0, second.StudentCreateCount);
        Assert.Equal(1, second.UnchangedStudentCount);
        await using var db = CreateDbContext();
        Assert.Equal(1, await db.Students.CountAsync());
        Assert.Equal(1, await db.WorkspaceStudentMemberships.CountAsync());
        Assert.Equal(1, await db.StudentImportBatches.CountAsync());
    }

    [Fact]
    public async Task ConcurrentDuplicateApplyConvergesWithoutDuplicateData()
    {
        await ResetDatabaseAsync();
        using var input = ImportInput.Create();

        var reports = await Task.WhenAll(
            CreateRunner().RunAsync(input.WorkbookPath, input.MapPath, "synthetic-school", apply: true),
            CreateRunner().RunAsync(input.WorkbookPath, input.MapPath, "synthetic-school", apply: true));

        Assert.All(reports, report => Assert.True(report.CanApply));
        Assert.Contains(reports, report => report.StudentCreateCount == 1);
        Assert.Contains(reports, report => report.AlreadyApplied);
        await using var db = CreateDbContext();
        Assert.Equal(1, await db.Workspaces.CountAsync());
        Assert.Equal(1, await db.Programs.CountAsync());
        Assert.Equal(1, await db.Students.CountAsync());
        Assert.Equal(1, await db.WorkspaceStudentMemberships.CountAsync());
        Assert.Equal(1, await db.StudentImportBatches.CountAsync());
    }

    [Fact]
    public async Task MissingSnapshotRecordRemainsActiveAndIsNotUpdated()
    {
        await ResetDatabaseAsync();
        using var initial = ImportInput.Create(
            new SyntheticStudent("SYNTHETIC-001", "Synthetic Alpha", true, "CODE-A", "legacy-ege"),
            new SyntheticStudent("SYNTHETIC-002", "Synthetic Beta", true, "CODE-B", "legacy-ege"));
        var runner = CreateRunner();
        var first = await runner.RunAsync(initial.WorkbookPath, initial.MapPath, "synthetic-school", apply: true);
        Assert.True(first.CanApply);
        using var next = ImportInput.Create(
            new SyntheticStudent("SYNTHETIC-001", "Synthetic Alpha", true, "CODE-A", "legacy-ege"));

        var second = await runner.RunAsync(next.WorkbookPath, next.MapPath, "synthetic-school", apply: true);

        Assert.True(second.CanApply);
        Assert.Equal(1, second.UnchangedStudentCount);
        await using var db = CreateDbContext();
        Assert.Equal(2, await db.Students.CountAsync(item => item.IsActive));
        Assert.Equal(2, await db.WorkspaceStudentMemberships.CountAsync(item => item.IsActive));
        Assert.Equal(2, await db.StudentImportBatches.CountAsync());
    }

    [Fact]
    public async Task DuplicateNormalizedExternalIdBlocksAllWrites()
    {
        await ResetDatabaseAsync();
        using var input = ImportInput.Create(
            new SyntheticStudent("synthetic-001", "Synthetic Alpha", true, "CODE-A", "legacy-ege"),
            new SyntheticStudent("ＳＹＮＴＨＥＴＩＣ－００１", "Synthetic Beta", true, "CODE-B", "legacy-ege"));

        var report = await CreateRunner().RunAsync(input.WorkbookPath, input.MapPath, "synthetic-school", apply: true);

        Assert.False(report.CanApply);
        Assert.Contains(report.Diagnostics, item => item.Field == "studentId" && item.Category == "duplicate_normalized_value");
        await AssertDatabaseEmptyAsync();
    }

    [Fact]
    public async Task DuplicateNormalizedInviteCodeBlocksAllWrites()
    {
        await ResetDatabaseAsync();
        using var input = ImportInput.Create(
            new SyntheticStudent("SYNTHETIC-001", "Synthetic Alpha", true, "code-a", "legacy-ege"),
            new SyntheticStudent("SYNTHETIC-002", "Synthetic Beta", true, "ＣＯＤＥ－Ａ", "legacy-ege"));

        var report = await CreateRunner().RunAsync(input.WorkbookPath, input.MapPath, "synthetic-school", apply: true);

        Assert.False(report.CanApply);
        Assert.Contains(report.Diagnostics, item => item.Field == "inviteCode" && item.Category == "duplicate_normalized_value");
        await AssertDatabaseEmptyAsync();
    }

    [Fact]
    public async Task UnknownProgramBlocksAllWritesWithoutReportingSourceIdentifier()
    {
        await ResetDatabaseAsync();
        using var input = ImportInput.Create(
            students: [new SyntheticStudent("SYNTHETIC-001", "Synthetic Alpha", true, "CODE-A", "unmapped-program")]);

        var report = await CreateRunner().RunAsync(input.WorkbookPath, input.MapPath, "synthetic-school", apply: true);
        var serialized = JsonSerializer.Serialize(report);

        Assert.False(report.CanApply);
        Assert.Contains(report.Diagnostics, item => item.Field == "programId" && item.Category == "unknown_program");
        Assert.DoesNotContain("unmapped-program", serialized, StringComparison.OrdinalIgnoreCase);
        await AssertDatabaseEmptyAsync();
    }

    [Fact]
    public async Task MalformedHeaderBlocksAllWrites()
    {
        await ResetDatabaseAsync();
        using var input = ImportInput.Create(mutateWorkbook: worksheet => worksheet.Cell(1, 1).Value = "StudentId");

        var report = await CreateRunner().RunAsync(input.WorkbookPath, input.MapPath, "synthetic-school", apply: true);

        Assert.False(report.CanApply);
        Assert.Contains(report.Diagnostics, item => item.Category == "invalid_header");
        await AssertDatabaseEmptyAsync();
    }

    [Fact]
    public async Task MalformedCellTypeBlocksAllWrites()
    {
        await ResetDatabaseAsync();
        using var input = ImportInput.Create(mutateWorkbook: worksheet => worksheet.Cell(2, 6).Value = "TRUE");

        var report = await CreateRunner().RunAsync(input.WorkbookPath, input.MapPath, "synthetic-school", apply: true);

        Assert.False(report.CanApply);
        Assert.Contains(report.Diagnostics, item => item.Field == "active" && item.Category == "invalid_type");
        await AssertDatabaseEmptyAsync();
    }

    [Fact]
    public async Task ExistingDivergenceIsAConflictAndNeverAnUpdate()
    {
        await ResetDatabaseAsync();
        using var original = ImportInput.Create();
        var runner = CreateRunner();
        await runner.RunAsync(original.WorkbookPath, original.MapPath, "synthetic-school", apply: true);
        using var divergent = ImportInput.Create(
            new SyntheticStudent("SYNTHETIC-001", "Synthetic Divergent", true, "SYNTHETIC-CODE-001", "legacy-ege"));

        var report = await runner.RunAsync(divergent.WorkbookPath, divergent.MapPath, "synthetic-school", apply: true);

        Assert.False(report.CanApply);
        Assert.Contains(report.Diagnostics, item => item.Field == "student" && item.Category == "existing_conflict");
        await using var db = CreateDbContext();
        Assert.Equal("Synthetic Alpha", (await db.Students.SingleAsync()).DisplayName);
        Assert.Equal(1, await db.StudentImportBatches.CountAsync());
    }

    [Fact]
    public async Task DatabaseFailureRollsBackWorkspaceProgramsStudentsMembershipAndBatch()
    {
        await ResetDatabaseAsync();
        await using (var db = CreateDbContext())
        {
            await db.Database.ExecuteSqlRawAsync(
                "CREATE OR REPLACE FUNCTION platform.reject_test_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic rejection'; END $$; " +
                "CREATE TRIGGER reject_test_import BEFORE INSERT ON platform.\"StudentImportBatches\" FOR EACH ROW EXECUTE FUNCTION platform.reject_test_import();");
        }

        try
        {
            using var input = ImportInput.Create();
            await Assert.ThrowsAnyAsync<Exception>(() =>
                CreateRunner().RunAsync(input.WorkbookPath, input.MapPath, "synthetic-school", apply: true));
            await AssertDatabaseEmptyAsync();
        }
        finally
        {
            await using var db = CreateDbContext();
            await db.Database.ExecuteSqlRawAsync(
                "DROP TRIGGER IF EXISTS reject_test_import ON platform.\"StudentImportBatches\"; " +
                "DROP FUNCTION IF EXISTS platform.reject_test_import();");
        }
    }

    [Fact]
    public async Task BatchContainsOnlySafeMetadataAndNoSourceValues()
    {
        await ResetDatabaseAsync();
        using var input = ImportInput.Create();
        await CreateRunner().RunAsync(input.WorkbookPath, input.MapPath, "synthetic-school", apply: true);

        await using var db = CreateDbContext();
        var batch = await db.StudentImportBatches.AsNoTracking().SingleAsync();
        var serialized = JsonSerializer.Serialize(batch, new JsonSerializerOptions { ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles });
        Assert.DoesNotContain("Synthetic Alpha", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("SYNTHETIC-CODE-001", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("legacy-ege", serialized, StringComparison.Ordinal);
        Assert.Equal(64, batch.WorkbookDigest.Length);
        Assert.Equal(64, batch.ProgramMapDigest.Length);
        Assert.Equal("applied", batch.Status);
        Assert.DoesNotContain(
            typeof(StudentImportBatch).GetProperties(),
            property => property.Name.Contains("Name", StringComparison.OrdinalIgnoreCase) ||
                property.Name.Contains("Code", StringComparison.OrdinalIgnoreCase) ||
                property.Name.Contains("ExternalId", StringComparison.OrdinalIgnoreCase));
    }

    private static StudentImportRunner CreateRunner(IStudentCodeHasher? hasher = null)
    {
        hasher ??= new StudentCodeHasher(Pepper);
        return new StudentImportRunner(CreateDbContext, hasher);
    }

    private static PlatformDbContext CreateDbContext()
    {
        var connectionString = Environment.GetEnvironmentVariable("TEST_DATABASE_CONNECTION_STRING")
            ?? throw new InvalidOperationException("TEST_DATABASE_CONNECTION_STRING is required.");
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseNpgsql(connectionString, postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "public"))
            .Options;
        return new PlatformDbContext(options);
    }

    private static async Task ResetDatabaseAsync()
    {
        await using var db = CreateDbContext();
        await db.Database.MigrateAsync();
        await db.Database.ExecuteSqlRawAsync(
            "TRUNCATE TABLE platform.\"StudentImportBatches\", platform.\"WorkspaceStudentMemberships\", " +
            "platform.\"WorkspaceMemberships\", platform.\"Students\", platform.\"TeacherUsers\", " +
            "platform.\"Workspaces\", platform.\"Programs\" CASCADE;");
    }

    private static async Task AssertDatabaseEmptyAsync()
    {
        await using var db = CreateDbContext();
        Assert.Equal(0, await db.Workspaces.CountAsync());
        Assert.Equal(0, await db.Programs.CountAsync());
        Assert.Equal(0, await db.Students.CountAsync());
        Assert.Equal(0, await db.WorkspaceStudentMemberships.CountAsync());
        Assert.Equal(0, await db.StudentImportBatches.CountAsync());
    }

    private sealed record SyntheticStudent(string ExternalId, string Name, bool Active, string Code, string ProgramSourceId);

    private sealed class ImportInput : IDisposable
    {
        private ImportInput(string directory, string workbookPath, string mapPath)
        {
            Directory = directory;
            WorkbookPath = workbookPath;
            MapPath = mapPath;
        }

        public string Directory { get; }
        public string WorkbookPath { get; }
        public string MapPath { get; }

        public static ImportInput Create(params SyntheticStudent[] students) => Create(students, null);

        public static ImportInput Create(Action<IXLWorksheet> mutateWorkbook) => Create([], mutateWorkbook);

        public static ImportInput Create(
            IReadOnlyList<SyntheticStudent>? students = null,
            Action<IXLWorksheet>? mutateWorkbook = null)
        {
            students = students is { Count: > 0 }
                ? students
                : [new SyntheticStudent("SYNTHETIC-001", "Synthetic Alpha", true, "SYNTHETIC-CODE-001", "legacy-ege")];
            var directory = Path.Combine(Path.GetTempPath(), "platform-student-import-tests", Guid.NewGuid().ToString("N"));
            System.IO.Directory.CreateDirectory(directory);
            var workbookPath = Path.Combine(directory, "students.xlsx");
            var mapPath = Path.Combine(directory, "program-map.json");

            using (var workbook = new XLWorkbook())
            {
                var worksheet = workbook.AddWorksheet(StudentWorkbookParser.SheetName);
                for (var column = 0; column < StudentWorkbookParser.RequiredHeaders.Length; column++)
                {
                    worksheet.Cell(1, column + 1).Value = StudentWorkbookParser.RequiredHeaders[column];
                }

                for (var index = 0; index < students.Count; index++)
                {
                    var row = index + 2;
                    var student = students[index];
                    worksheet.Cell(row, 1).Value = student.ExternalId;
                    worksheet.Cell(row, 2).Value = student.Name;
                    worksheet.Cell(row, 3).Value = 11;
                    worksheet.Cell(row, 4).Value = "Synthetic Group";
                    worksheet.Cell(row, 5).Value = 80;
                    worksheet.Cell(row, 6).Value = student.Active;
                    worksheet.Cell(row, 7).Value = new DateTime(2026, 1, 1);
                    worksheet.Cell(row, 8).Value = student.Code;
                    worksheet.Cell(row, 9).Value = "Synthetic note";
                    worksheet.Cell(row, 10).Value = "Synthetic parent";
                    worksheet.Cell(row, 11).Value = student.ProgramSourceId;
                    worksheet.Cell(row, 12).Value = 11;
                }

                mutateWorkbook?.Invoke(worksheet);
                workbook.SaveAs(workbookPath);
            }

            File.WriteAllText(mapPath, JsonSerializer.Serialize(new
            {
                programs = new[]
                {
                    new { sourceId = "legacy-ege", code = "EGE_MATH", displayName = "SYNTHETIC EGE" }
                }
            }));
            return new ImportInput(directory, workbookPath, mapPath);
        }

        public void Dispose() => System.IO.Directory.Delete(Directory, recursive: true);
    }
}
