using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.HistoryImport;
using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.StudentImport;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.StudentImport.IntegrationTests;

public sealed class MockHistoryImportTests
{
    [Fact]
    public async Task IndependentMockRecordsPreserveMissingValuesAndReplaySafely()
    {
        await using (var db = Connect())
        {
            await db.Database.MigrateAsync();
            await db.Database.ExecuteSqlRawAsync(
                "TRUNCATE TABLE platform.\"WorkspaceStudentMemberships\", platform.\"Workspaces\", " +
                "platform.\"Programs\", platform.\"Students\" CASCADE;");
            var workspace = new Workspace { Id = Guid.NewGuid(), Slug = "history-mocks" };
            var current = new LearningProgram { Id = Guid.NewGuid(), Workspace = workspace,
                Code = "EGE_MATH", DisplayName = "Synthetic EGE mathematics" };
            var historical = new LearningProgram { Id = Guid.NewGuid(), Workspace = workspace,
                Code = "OGE_MATH", DisplayName = "Synthetic OGE mathematics" };
            var student = new Student { Id = Guid.NewGuid(), DisplayName = "Synthetic" };
            db.Workspaces.Add(workspace);
            db.Programs.AddRange(current, historical);
            db.Students.Add(student);
            db.WorkspaceStudentMemberships.Add(new WorkspaceStudentMembership
            {
                Id = Guid.NewGuid(), Workspace = workspace, Program = current, Student = student,
                CodeHash = Enumerable.Repeat((byte)42, 32).ToArray(),
                ImportSource = StudentImportService.ImportSource,
                ImportExternalId = StudentWorkbookParser.NormalizeExternalId("synthetic-1")
            });
            await db.SaveChangesAsync();
        }

        using var source = Source.Create();
        var importer = new MockHistoryImportService(Connect);
        var preview = await importer.ImportAsync(source.WorkbookPath, source.MapPath, "history-mocks", false);
        Assert.True(preview.CanApply, JsonSerializer.Serialize(preview));
        Assert.Equal((1, 2, 1, 1), (preview.ResultsCreated, preview.TasksCreated,
            preview.SessionsCreated, preview.VariantsCreated));
        Assert.Single(preview.Skipped);
        Assert.Equal("student_not_imported", preview.Skipped[0].Reason);
        await using (var db = Connect()) Assert.Empty(await db.HistoricalMockResults.ToListAsync());

        var applied = await importer.ImportAsync(source.WorkbookPath, source.MapPath, "history-mocks", true);
        Assert.True(applied.CanApply);
        var replay = await importer.ImportAsync(source.WorkbookPath, source.MapPath, "history-mocks", true);
        Assert.True(replay.CanApply, JsonSerializer.Serialize(replay));
        Assert.Equal((0, 0, 0, 0), (replay.ResultsCreated, replay.TasksCreated,
            replay.SessionsCreated, replay.VariantsCreated));
        Assert.Equal((1, 2, 1, 1), (replay.ResultsUnchanged, replay.TasksUnchanged,
            replay.SessionsUnchanged, replay.VariantsUnchanged));

        using (var book = new XLWorkbook(source.WorkbookPath))
        {
            book.Worksheet("Пробники").Cell(2, 7).Value = 19;
            book.Worksheet("Пробник_Конфигурации").Cell(3, 1).Value = "new-mock";
            book.Worksheet("Пробник_Конфигурации").Cell(3, 2).Value = "New variant";
            book.Worksheet("Пробник_Конфигурации").Cell(3, 3).Value = 3600;
            book.Worksheet("Пробник_Конфигурации").Cell(3, 4).Value = 1;
            book.Worksheet("Пробник_Конфигурации").Cell(3, 5).Value = "{}";
            book.Worksheet("Пробник_Конфигурации").Cell(3, 6).Value = "2026-07-02T18:00:00Z";
            book.Worksheet("Пробник_Конфигурации").Cell(3, 7).Value = "1";
            book.Worksheet("Пробник_Конфигурации").Cell(3, 8).Value = "EGE_MATH";
            book.Save();
        }
        var conflict = await importer.ImportAsync(source.WorkbookPath, source.MapPath, "history-mocks", true);
        Assert.False(conflict.CanApply);
        Assert.Contains(conflict.Conflicts, x => x.Reason == "event_conflict");

        await using (var db = Connect())
        {
            var result = Assert.Single(await db.HistoricalMockResults.ToListAsync());
            Assert.Null(result.Score);
            Assert.Null(result.GradeMark);
            Assert.Equal(18, result.PrimaryScore);
            Assert.Equal(new DateOnly(2026, 7, 2), result.MockDate);
            Assert.Equal(new DateTimeOffset(2026, 7, 2, 18, 0, 0, TimeSpan.Zero), result.ServerSubmittedAt);
            var tasks = await db.HistoricalMockTaskResults.OrderBy(x => x.TaskNumber).ToListAsync();
            Assert.Equal(2, tasks.Count);
            Assert.Equal("orphan-event", tasks[1].EventId);
            Assert.Null(tasks[1].EarnedPoints);
            Assert.Null(tasks[1].MaxPoints);
            var session = Assert.Single(await db.HistoricalMockSessions.ToListAsync());
            Assert.Null(session.GradeMark);
            Assert.Null(session.MaxPrimaryScore);
            Assert.Equal("{\"answer\":1}", session.AnswersJson);
            Assert.Equal(result.ProgramId, tasks[0].ProgramId);
            Assert.Equal(result.ProgramId, session.ProgramId);
            Assert.NotEqual(result.ProgramId, (await db.WorkspaceStudentMemberships.SingleAsync()).ProgramId);
            Assert.Single(await db.HistoricalMockVariants.ToListAsync());
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
        public string WorkbookPath => Path.Combine(Directory, "mocks.xlsx");
        public string MapPath => Path.Combine(Directory, "program-map.json");

        public static Source Create()
        {
            var source = new Source(Path.Combine(Path.GetTempPath(), "tas-mocks", Guid.NewGuid().ToString("N")));
            System.IO.Directory.CreateDirectory(source.Directory);
            using (var book = new XLWorkbook())
            {
                var results = Add(book, "Пробники", "eventId", "studentId", "mockId", "mockDate",
                    "variantName", "score", "primaryScore", "durationSeconds", "serverSubmittedAt",
                    "schemaVersion", "programId", "gradeMark", "maxPrimaryScore", "scorePercent");
                Set(results, 2, (1, "result-event"), (2, "synthetic-1"), (3, "mock-1"),
                    (4, "2026-07-02"), (5, "Variant A"), (7, 18), (8, 7200),
                    (9, "2026-07-02T21:00:00+03:00"), (10, "1"), (11, "OGE_MATH"), (13, 31), (14, 58));
                var tasks = Add(book, "Пробник_Задания", "eventId", "studentId", "mockId",
                    "mockDate", "taskNumber", "topicId", "topicName", "isCorrect", "answered",
                    "serverSubmittedAt", "schemaVersion", "programId", "earnedPoints", "maxPoints");
                Set(tasks, 2, (1, "result-event"), (2, "synthetic-1"), (3, "mock-1"),
                    (4, "2026-07-02"), (5, 1), (6, "topic-1"), (7, "Synthetic topic"),
                    (8, true), (9, true), (10, "2026-07-02T21:00:00+03:00"),
                    (11, "1"), (12, "OGE_MATH"), (13, 2), (14, 2));
                Set(tasks, 3, (1, "orphan-event"), (2, "synthetic-1"), (3, "mock-1"),
                    (4, "Thu Jul 02 2026 02:00:00 GMT+0500 (Yekaterinburg Standard Time)"),
                    (5, 2), (6, "topic-2"), (7, "Synthetic topic"),
                    (8, false), (9, false), (10, "2026-07-02T21:00:00+03:00"),
                    (11, "1"), (12, "OGE_MATH"));
                Set(tasks, 4, (1, "missing-event"), (2, "missing-student"), (3, "mock-1"),
                    (4, "2026-07-02"), (5, 3), (6, "topic-3"), (7, "Synthetic topic"),
                    (8, false), (9, false), (10, "2026-07-02T21:00:00+03:00"),
                    (11, "1"), (12, "OGE_MATH"));
                var sessions = Add(book, "Пробник_Сессии", "sessionId", "studentId", "mockId",
                    "startedAt", "deadlineAt", "answersJson", "status", "submittedAt", "primaryScore",
                    "testScore", "durationSeconds", "eventId", "schemaVersion", "mockConfigJson",
                    "programId", "gradeMark", "maxPrimaryScore", "scorePercent");
                Set(sessions, 2, (1, "session-1"), (2, "synthetic-1"), (3, "mock-1"),
                    (4, "2026-07-02T19:00:00+03:00"), (5, "2026-07-02T21:00:00+03:00"),
                    (6, "{\"answer\":1}"), (7, "SUBMITTED"), (8, "2026-07-02T21:00:00+03:00"),
                    (9, 18), (10, 58), (11, 7200), (12, "different-event"), (13, "1"),
                    (14, "{\"tasks\":[]}"), (15, "OGE_MATH"));
                var variants = Add(book, "Пробник_Конфигурации", "mockId", "variantName",
                    "durationSeconds", "taskCount", "configJson", "createdAt", "schemaVersion", "programId");
                Set(variants, 2, (1, "mock-1"), (2, "Variant A"), (3, 7200), (4, 2),
                    (5, "{\"tasks\":[]}"), (6, "2026-07-02T18:00:00Z"), (7, "1"), (8, "OGE_MATH"));
                book.SaveAs(source.WorkbookPath);
            }
            File.WriteAllText(source.MapPath, JsonSerializer.Serialize(new
            {
                programs = new[] {
                    new { sourceId = "EGE_MATH", code = "EGE_MATH", displayName = "Synthetic EGE mathematics" },
                    new { sourceId = "OGE_MATH", code = "OGE_MATH", displayName = "Synthetic OGE mathematics" }
                }
            }));
            return source;
        }

        private static IXLWorksheet Add(XLWorkbook book, string name, params string[] headers)
        {
            var sheet = book.AddWorksheet(name);
            for (var i = 0; i < headers.Length; i++) sheet.Cell(1, i + 1).Value = headers[i];
            return sheet;
        }
        private static void Set(IXLWorksheet sheet, int row, params (int Column, object Value)[] values)
        {
            foreach (var (column, value) in values)
            {
                var cell = sheet.Cell(row, column);
                switch (value)
                {
                    case string s: cell.Value = s; break;
                    case int n: cell.Value = n; break;
                    case bool b: cell.Value = b; break;
                }
            }
        }
        public void Dispose() => System.IO.Directory.Delete(Directory, recursive: true);
    }
}
