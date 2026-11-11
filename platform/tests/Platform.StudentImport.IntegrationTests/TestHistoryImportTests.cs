using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.HistoryImport;
using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.StudentImport;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.StudentImport.IntegrationTests;

public sealed class TestHistoryImportTests
{
    [Fact]
    public async Task MissingLegacyCountsStayNullAndReplayDoesNotDuplicate()
    {
        await using (var db = Connect())
        {
            await db.Database.MigrateAsync();
            await db.Database.ExecuteSqlRawAsync(
                "TRUNCATE TABLE platform.\"WorkspaceStudentMemberships\", platform.\"Workspaces\", " +
                "platform.\"Programs\", platform.\"Students\" CASCADE;");
            var workspace = new Workspace { Id = Guid.NewGuid(), Slug = "history-tests" };
            var program = new LearningProgram
            {
                Id = Guid.NewGuid(), Workspace = workspace, Code = "EGE_MATH",
                DisplayName = "Synthetic mathematics"
            };
            var student = new Student { Id = Guid.NewGuid(), DisplayName = "Synthetic" };
            db.Workspaces.Add(workspace);
            db.Programs.Add(program);
            db.Students.Add(student);
            db.WorkspaceStudentMemberships.Add(new WorkspaceStudentMembership
            {
                Id = Guid.NewGuid(), Workspace = workspace, Program = program, Student = student,
                CodeHash = Enumerable.Repeat((byte)41, 32).ToArray(),
                ImportSource = StudentImportService.ImportSource,
                ImportExternalId = StudentWorkbookParser.NormalizeExternalId("synthetic-1")
            });
            await db.SaveChangesAsync();
        }

        using var source = Source.Create();
        var importer = new TestHistoryImportService(Connect);
        var preview = await importer.ImportAsync(source.WorkbookPath, source.MapPath, "history-tests", false);
        Assert.True(preview.CanApply);
        Assert.Equal(1, preview.Created);
        Assert.Equal(0, preview.Unchanged);
        Assert.Single(preview.Skipped);
        Assert.Equal("student_not_imported", preview.Skipped[0].Reason);
        await using (var db = Connect()) Assert.Empty(await db.HistoricalTestResults.ToListAsync());

        var applied = await importer.ImportAsync(source.WorkbookPath, source.MapPath, "history-tests", true);
        Assert.True(applied.CanApply);
        Assert.Equal(1, applied.Created);
        var replay = await importer.ImportAsync(source.WorkbookPath, source.MapPath, "history-tests", true);
        Assert.True(replay.CanApply);
        Assert.Equal(0, replay.Created);
        Assert.Equal(1, replay.Unchanged);

        using (var book = new XLWorkbook(source.WorkbookPath))
        {
            book.Worksheet("Тесты").Cell(2, 10).Value = 73;
            book.Save();
        }
        var changed = await importer.ImportAsync(source.WorkbookPath, source.MapPath, "history-tests", true);
        Assert.False(changed.CanApply);
        Assert.Contains(changed.Conflicts, x => x.Reason == "event_conflict");

        await using (var db = Connect())
        {
            var result = Assert.Single(await db.HistoricalTestResults.ToListAsync());
            Assert.Equal(72, result.ScorePercent);
            Assert.Equal(new DateOnly(2026, 7, 2), result.TestDate);
            Assert.Equal(new DateTimeOffset(2026, 7, 2, 18, 0, 0, TimeSpan.Zero), result.ServerSubmittedAt);
            Assert.Null(result.CorrectCount);
            Assert.Null(result.TotalCount);
            Assert.Null(result.StartedAt);
            Assert.Null(result.FinishedAt);
        }
    }

    private static PlatformDbContext Connect()
    {
        var connection = Environment.GetEnvironmentVariable("TEST_DATABASE_CONNECTION_STRING")
            ?? throw new InvalidOperationException("TEST_DATABASE_CONNECTION_STRING is required.");
        return new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>()
            .UseNpgsql(connection, pg => pg.MigrationsHistoryTable("__EFMigrationsHistory", "public")).Options);
    }

    private sealed class Source : IDisposable
    {
        private Source(string directory) => Directory = directory;
        private string Directory { get; }
        public string WorkbookPath => Path.Combine(Directory, "synthetic-tests.xlsx");
        public string MapPath => Path.Combine(Directory, "map.json");

        public static Source Create()
        {
            var source = new Source(Path.Combine(Path.GetTempPath(), "tas-tests", Guid.NewGuid().ToString("N")));
            System.IO.Directory.CreateDirectory(source.Directory);
            using (var book = new XLWorkbook())
            {
                var sheet = book.AddWorksheet("Тесты");
                var headers = new[] { "eventId", "studentId", "testId", "testDate", "topicId",
                    "topicName", "taskNumber", "correctCount", "totalCount", "scorePercent",
                    "startedAt", "finishedAt", "durationSeconds", "serverSubmittedAt",
                    "schemaVersion", "programId" };
                for (var i = 0; i < headers.Length; i++) sheet.Cell(1, i + 1).Value = headers[i];
                for (var r = 2; r <= 3; r++)
                {
                    sheet.Cell(r, 1).Value = "synthetic-event-" + r;
                    sheet.Cell(r, 2).Value = r == 2 ? "synthetic-1" : "missing-2";
                    sheet.Cell(r, 3).Value = "synthetic-test";
                    sheet.Cell(r, 4).Value = "2026-07-02";
                    sheet.Cell(r, 5).Value = "topic-1";
                    sheet.Cell(r, 6).Value = "Synthetic topic";
                    sheet.Cell(r, 7).Value = 1;
                    sheet.Cell(r, 10).Value = 72;
                    sheet.Cell(r, 13).Value = 2280;
                    sheet.Cell(r, 14).Value = "2026-07-02T21:00:00.000+03:00";
                    sheet.Cell(r, 15).Value = 1;
                    sheet.Cell(r, 16).Value = "EGE_MATH";
                }
                book.SaveAs(source.WorkbookPath);
            }
            File.WriteAllText(source.MapPath, JsonSerializer.Serialize(new
            {
                programs = new[] { new
                {
                    sourceId = "EGE_MATH", code = "EGE_MATH", displayName = "Synthetic mathematics"
                } }
            }));
            return source;
        }

        public void Dispose() => System.IO.Directory.Delete(Directory, recursive: true);
    }
}
