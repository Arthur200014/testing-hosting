using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Homework;
using TestingHosting.Platform.Lessons;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.TestAttempts;

namespace TestingHosting.Platform.Students;

public sealed record FeedbackNativeWork(Guid Id, Guid MembershipId, string Title, DateTimeOffset AssignedAt,
    DateTimeOffset DeadlineAt, DateTimeOffset? SubmittedAt, int? ScorePercent, string? TeacherFeedback);
public sealed record FeedbackReportData(IReadOnlyList<TeacherLessonView> Lessons,
    IReadOnlyList<TeacherHomeworkAssignmentView> Assignments, IReadOnlyList<FeedbackNativeWork> NativeAssignments,
    IReadOnlyList<TeacherTestResultView> Tests, IReadOnlyList<TeacherLiveTestAttemptView> LiveTests,
    IReadOnlyList<TeacherMockResultView> Mocks);
public sealed record FeedbackInput(DateTimeOffset GeneratedAt, Guid MembershipId, string StudentName,
    string ProgramName, FeedbackReportData Data);
public sealed record FeedbackDraftView(string Title, string Body, int Revision, DateTimeOffset UpdatedAt, FeedbackInput Snapshot);
public sealed record FeedbackEditorView(FeedbackInput Current, FeedbackDraftView? Draft);
public sealed record SaveFeedbackRequest(Guid RequestId, int ExpectedRevision, DateTimeOffset GeneratedAt, string? Title, string? Body);

// Intentionally unmapped: this single draft table is migration-managed, queried with parameterized SQL.
// It does not alter EF's existing domain model or the historical import schema.
public sealed class FeedbackDraftRow
{
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string SnapshotJson { get; set; } = "";
    public int Revision { get; set; }
    public Guid RequestId { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class PupilFeedbackService(PlatformDbContext db, TeacherHistoryReader lessons,
    TeacherHomeworkReader homework, TeacherResultsReader results, TimeProvider clock)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static DateOnly Day(DateTimeOffset at) => DateOnly.FromDateTime(at.ToOffset(TimeSpan.FromHours(3)).DateTime);
    private async Task<FeedbackDraftRow?> DraftAsync(Guid workspace, Guid member, CancellationToken ct) =>
        await db.Database.SqlQuery<FeedbackDraftRow>($"""
            SELECT "Title", "Body", "Snapshot"::text AS "SnapshotJson", "Revision", "RequestId", "UpdatedAt"
            FROM platform."PupilFeedbackDrafts" WHERE "WorkspaceId"={workspace} AND "MembershipId"={member}
            """).SingleOrDefaultAsync(ct);
    private static FeedbackDraftView View(FeedbackDraftRow row) =>
        new(row.Title, row.Body, row.Revision, row.UpdatedAt, JsonSerializer.Deserialize<FeedbackInput>(row.SnapshotJson, Json)!);

    private async Task<FeedbackInput?> InputAsync(Guid workspace, Guid member, DateTimeOffset at, CancellationToken ct)
    {
        var identity = await db.WorkspaceStudentMemberships.AsNoTracking().Where(x => x.WorkspaceId == workspace && x.Id == member && x.IsActive)
            .Select(x => new {x.StudentId, x.ProgramId, Name=x.Student.DisplayName, Program=x.Program.DisplayName}).SingleOrDefaultAsync(ct);
        if (identity is null) return null;
        var recent = (await lessons.ListLessonsAsync(workspace, ct, member)).Where(x => x.LessonAt <= at)
            .OrderByDescending(x => x.LessonAt).ThenByDescending(x => x.Id).Take(8).ToArray();
        if (recent.Length == 0) return new(at, member, identity.Name, identity.Program, new(recent, [], [], [], [], []));
        var first = Day(recent.Min(x => x.LessonAt));
        var through = Day(at);
        bool InPeriod(DateTimeOffset value) => Day(value) >= first && Day(value) <= through;
        var assigned = (await homework.AssignmentsAsync(workspace, member, ct)).Where(x => InPeriod(x.AssignedAt)).ToArray();
        var from = PupilHistoryReader.MoscowStart(first);
        var until = PupilHistoryReader.MoscowStart(through.AddDays(1));
        var native = await db.NativeHomeworkAssignments.AsNoTracking().Where(x => x.WorkspaceId == workspace && x.MembershipId == member &&
            x.StudentId == identity.StudentId && x.ProgramId == identity.ProgramId && x.AssignedAt >= from && x.AssignedAt < until)
            .OrderByDescending(x => x.AssignedAt).ThenBy(x => x.Id).Select(x => new FeedbackNativeWork(x.Id, x.MembershipId,
                db.NativeHomeworkTasks.Where(t => t.WorkspaceId == workspace && t.Id == x.TaskId).Select(t => t.Title).First(),
                x.AssignedAt, x.DeadlineAt, x.SubmittedAt, x.ScorePercent, x.TeacherFeedback)).ToArrayAsync(ct);
        var tests = (await results.TestsAsync(workspace, member, ct)).Where(x => x.TestDate >= first && x.TestDate <= through).ToArray();
        var live = (await results.LiveTestsAsync(workspace, member, ct)).Where(x => InPeriod(x.CompletedAt)).ToArray();
        var mocks = (await results.MocksAsync(workspace, member, ct)).Where(x => x.MockDate >= first && x.MockDate <= through).ToArray();
        return new(at, member, identity.Name, identity.Program, new(recent, assigned, native, tests, live, mocks));
    }

    public async Task<FeedbackEditorView?> ReadAsync(Guid workspace, Guid member, CancellationToken ct)
    {
        var input = await InputAsync(workspace, member, clock.GetUtcNow(), ct);
        if (input is null) return null;
        var draft = await DraftAsync(workspace, member, ct);
        return new(input, draft is null ? null : View(draft));
    }

    public async Task<(int Status, object? Value)> SaveAsync(Guid workspace, Guid member, SaveFeedbackRequest request, CancellationToken ct)
    {
        var title = request.Title?.Trim() ?? "";
        var body = request.Body?.Trim() ?? "";
        if (request.RequestId == Guid.Empty || request.ExpectedRevision < 0 || title.Length is < 1 or > 200 || body.Length is < 1 or > 20000)
            return (400, "Fill title (1–200) and report text (1–20000).");
        var now = clock.GetUtcNow();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var key = "pupil-feedback:" + workspace.ToString("N") + ":" + member.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))", ct);
        var identity = await db.WorkspaceStudentMemberships.AsNoTracking().Where(x => x.WorkspaceId == workspace && x.Id == member && x.IsActive)
            .Select(x => new { x.StudentId, x.ProgramId }).SingleOrDefaultAsync(ct);
        if (identity is null) return (404, null);
        var existing = await DraftAsync(workspace, member, ct);
        if (existing?.RequestId == request.RequestId)
            return existing.Title == title && existing.Body == body && View(existing).Snapshot.GeneratedAt == request.GeneratedAt
                ? (200, View(existing)) : (409, "Request ID already used for another report.");
        if ((existing?.Revision ?? 0) != request.ExpectedRevision) return (409, "Report changed in another window. Reload before editing.");
        FeedbackInput? input;
        if (existing is not null && View(existing).Snapshot.GeneratedAt == request.GeneratedAt) input = View(existing).Snapshot;
        else
        {
            if (request.GeneratedAt > now || request.GeneratedAt < now.AddDays(-1)) return (400, "Generate a fresh report before saving.");
            input = await InputAsync(workspace, member, request.GeneratedAt.ToUniversalTime(), ct);
        }
        if (input is null) return (404, null);
        if (input.Data.Lessons.Count == 0) return (409, "No lessons for this pupil yet.");
        var snapshot = JsonSerializer.Serialize(input, Json);
        if (snapshot.Length > 1000000) return (400, "Report source data exceeds the draft size limit.");
        var revision = (existing?.Revision ?? 0) + 1;
        if (existing is null)
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO platform."PupilFeedbackDrafts" ("WorkspaceId","MembershipId","StudentId","ProgramId","Title","Body","Snapshot","Revision","RequestId","UpdatedAt")
                VALUES ({workspace},{member},{identity.StudentId},{identity.ProgramId},{title},{body},CAST({snapshot} AS jsonb),{revision},{request.RequestId},{now})
                """, ct);
        else
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE platform."PupilFeedbackDrafts" SET "Title"={title},"Body"={body},"Snapshot"=CAST({snapshot} AS jsonb),
                    "Revision"={revision},"RequestId"={request.RequestId},"UpdatedAt"={now}
                WHERE "WorkspaceId"={workspace} AND "MembershipId"={member} AND "Revision"={request.ExpectedRevision}
                """, ct);
        await tx.CommitAsync(ct);
        return (201, new FeedbackDraftView(title, body, revision, now, input));
    }
}
