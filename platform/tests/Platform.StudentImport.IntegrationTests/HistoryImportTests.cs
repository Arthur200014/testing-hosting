using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingHosting.Platform.HistoryImport;
using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.StudentImport;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.StudentImport.IntegrationTests;

public sealed class HistoryImportTests
{
    [Fact]
    public void MigrationSnapshotMatchesCurrentEfModel()
    {
        using var db = Connect();
        var migrations = db.GetService<IMigrationsAssembly>();
        var differ = db.GetService<IMigrationsModelDiffer>();
        var snapshot = db.GetService<IModelRuntimeInitializer>().Initialize(
            migrations.ModelSnapshot!.Model, designTime: true);
        var source = snapshot.GetRelationalModel();
        var current = db.GetService<IDesignTimeModel>().Model.GetRelationalModel();
        var differences = differ.GetDifferences(source, current);
        Assert.True(differences.Count == 0, string.Join("; ", differences.Select(item =>
            item.GetType().Name + "(" + string.Join(",", item.GetType().GetProperties()
                .Where(p => p.Name is "Name" or "Table" or "Column")
                .Select(p => p.Name + "=" + p.GetValue(item))) + ")")));
    }

    [Fact]
    public async Task PairedLessonIsSingleLessonWithIndependentAttendanceAndRepeatIsIdempotent()
    {
        await using (var db = Connect())
        {
            await db.Database.MigrateAsync();
            await db.Database.ExecuteSqlRawAsync(
                "TRUNCATE TABLE platform.\"WorkspaceStudentMemberships\", platform.\"Workspaces\", " +
                "platform.\"Programs\", platform.\"Students\" CASCADE;");
            var workspace = new Workspace { Id = Guid.NewGuid(), Slug = "synthetic-school" };
            var program = new LearningProgram
            {
                Id = Guid.NewGuid(), Workspace = workspace, Code = "EGE_MATH",
                DisplayName = "Synthetic mathematics"
            };
            db.Workspaces.Add(workspace);
            db.Programs.Add(program);
            for (var i = 1; i <= 2; i++)
            {
                var student = new Student { Id = Guid.NewGuid(), DisplayName = "Synthetic " + i };
                db.Students.Add(student);
                db.WorkspaceStudentMemberships.Add(new WorkspaceStudentMembership
                {
                    Id = Guid.NewGuid(), Workspace = workspace, Program = program, Student = student,
                    CodeHash = Enumerable.Repeat((byte)i, 32).ToArray(),
                    ImportSource = StudentImportService.ImportSource,
                    ImportExternalId = StudentWorkbookParser.NormalizeExternalId("syn-" + i)
                });
            }
            await db.SaveChangesAsync();
        }
        using var source = Source.Create();
        var importer = new HistoryImportService(Connect);

        var preview = await importer.ImportAsync(source.WorkbookPath, source.MapPath, "synthetic-school", false);
        Assert.True(preview.CanApply);
        Assert.True(preview.Skipped.Count == 0, JsonSerializer.Serialize(preview.Skipped));
        Assert.Equal(1, preview.LessonsCreated);
        Assert.Equal(2, preview.ParticipantsCreated);
        Assert.Equal(2, preview.SubscriptionsCreated);
        Assert.Empty(preview.Conflicts);
        await using (var db = Connect())
            Assert.Empty(await db.Lessons.ToListAsync());

        var first = await importer.ImportAsync(source.WorkbookPath, source.MapPath, "synthetic-school", true);
        Assert.True(first.CanApply);
        Assert.Equal(1, first.LessonsCreated);
        Assert.Equal(2, first.ParticipantsCreated);
        Assert.Equal(2, first.SubscriptionsCreated);

        var again = await importer.ImportAsync(source.WorkbookPath, source.MapPath, "synthetic-school", true);
        Assert.True(again.CanApply);
        Assert.Equal(0, again.LessonsCreated);
        Assert.Equal(0, again.ParticipantsCreated);
        Assert.Equal(0, again.SubscriptionsCreated);
        Assert.Equal(1, again.LessonsUnchanged);
        Assert.Equal(2, again.ParticipantsUnchanged);
        Assert.Equal(2, again.SubscriptionsUnchanged);

        await using (var db = Connect())
        {
            Assert.Single(await db.Lessons.ToListAsync());
            var students = await db.LessonParticipants.OrderBy(x => x.AttendanceStatus).ToListAsync();
            Assert.Equal(2, students.Count);
            Assert.Equal(2, students.Select(x => x.StudentId).Distinct().Count());
            Assert.Contains(students, x => x.AttendanceStatus == "Absent");
            Assert.Contains(students, x => x.AttendanceStatus == "Present");
            var snapshots = await db.SubscriptionSnapshots.OrderBy(x => x.PackageSize).ToListAsync();
            Assert.Equal(2, snapshots.Count);
            Assert.Null(snapshots[0].ResetAt);
            Assert.Null(snapshots[0].LessonPrice);
        }
    }

    private static PlatformDbContext Connect()
    {
        var connectionString = Environment.GetEnvironmentVariable("TEST_DATABASE_CONNECTION_STRING")
            ?? throw new InvalidOperationException("TEST_DATABASE_CONNECTION_STRING is required.");
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseNpgsql(connectionString,
                pg => pg.MigrationsHistoryTable("__EFMigrationsHistory", "public")).Options;
        return new PlatformDbContext(options);
    }

    private sealed class Source : IDisposable
    {
        private Source(string directory) { Directory = directory; }
        public string Directory { get; }
        public string WorkbookPath => Path.Combine(Directory, "history.xlsx");
        public string MapPath => Path.Combine(Directory, "program-map.json");

        public static Source Create()
        {
            var directory = Path.Combine(Path.GetTempPath(), "tas-history-test", Guid.NewGuid().ToString("N"));
            System.IO.Directory.CreateDirectory(directory);
            var fixture = new Source(directory);
            using (var book = new XLWorkbook())
            {
                var lessons = book.AddWorksheet("Занятия");
                var headers = new[] { "lessonId", "studentId", "studentName", "lessonAt",
                    "durationMinutes", "taskNumbers", "topicComment", "attendanceStatus", "createdAt", "programId" };
                for (var c = 0; c < headers.Length; c++) lessons.Cell(1, c + 1).Value = headers[c];
                for (var i = 0; i < 2; i++)
                {
                    var r = i + 2;
                    lessons.Cell(r, 1).Value = "lesson-paired-1";
                    lessons.Cell(r, 2).Value = "syn-" + (i + 1);
                    lessons.Cell(r, 3).Value = "Synthetic " + (i + 1);
                    lessons.Cell(r, 4).Value = new DateTime(2026, 11, 11, 18, 0, 0);
                    lessons.Cell(r, 5).Value = 60;
                    lessons.Cell(r, 6).Value = "1, 2";
                    lessons.Cell(r, 8).Value = i == 0 ? "Present" : "Absent";
                    lessons.Cell(r, 9).Value = new DateTime(2026, 11, 11, 20, 0, 0);
                    lessons.Cell(r, 10).Value = "legacy-ege";
                }
                var subs = book.AddWorksheet("Абонементы");
                var sHeaders = new[] { "studentId", "studentName", "packageSize", "resetAt",
                    "updatedAt", "programId", "lessonPrice", "baseLessonCount" };
                for (var c = 0; c < sHeaders.Length; c++) subs.Cell(1, c + 1).Value = sHeaders[c];
                for (var i = 0; i < 2; i++)
                {
                    var r = i + 2;
                    subs.Cell(r, 1).Value = "syn-" + (i + 1);
                    subs.Cell(r, 2).Value = "Synthetic " + (i + 1);
                    subs.Cell(r, 3).Value = i == 0 ? 4 : 8;
                    if (i == 1) subs.Cell(r, 4).Value = new DateTime(2026, 11, 1);
                    subs.Cell(r, 5).Value = new DateTime(2026, 11, 11);
                    subs.Cell(r, 6).Value = "legacy-ege";
                    if (i == 1) subs.Cell(r, 7).Value = 900;
                    if (i == 1) subs.Cell(r, 8).Value = 8;
                }
                book.SaveAs(fixture.WorkbookPath);
            }
            File.WriteAllText(fixture.MapPath, JsonSerializer.Serialize(new
            {
                programs = new[] { new
                {
                    sourceId = "legacy-ege", code = "EGE_MATH", displayName = "Synthetic mathematics"
                } }
            }));
            return fixture;
        }

        public void Dispose() => System.IO.Directory.Delete(Directory, recursive: true);
    }
}
