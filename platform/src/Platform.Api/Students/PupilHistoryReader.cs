using System.Globalization;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Students;

public sealed record PupilHistoryRow(Guid Id, Guid MembershipId, Guid ProgramId, string Source,
    string Title, DateOnly Date, int? ScorePercent, object Details, object[]? Attempts = null);
public sealed record PupilHistoryPage(IReadOnlyList<PupilHistoryRow> Items, int Total, int Page, int PageSize);

public sealed class PupilHistoryReader(PlatformDbContext db)
{
    public static bool TryMonth(string? month, out DateOnly? start)
    {
        start = null;
        if (string.IsNullOrEmpty(month)) return true;
        if (month.Length != 7 || !DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed) || parsed.Year > 9998) return false;
        start = parsed;
        return true;
    }

    public static DateTimeOffset MoscowStart(DateOnly day) => new DateTimeOffset(day.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(3)).ToUniversalTime();
    private static DateOnly MoscowDay(DateTimeOffset value) => DateOnly.FromDateTime(value.ToOffset(TimeSpan.FromHours(3)).DateTime);

    private static async Task<PupilHistoryPage> PageAsync<T>(IQueryable<T> query, int page,
        Func<T, PupilHistoryRow> project, CancellationToken ct)
    {
        const int size = 20;
        var total = await query.CountAsync(ct);
        page = Math.Clamp(page, 0, Math.Max(0, (total - 1) / size));
        var rows = await query.Skip(page * size).Take(size).ToListAsync(ct);
        return new(rows.Select(project).ToArray(), total, page, size);
    }

    public async Task<PupilHistoryPage?> ReadAsync(Guid workspace, Guid membershipId, string source,
        int page, bool results, DateOnly? month, CancellationToken ct, string? mockId = null, DateOnly? mockDate = null)
    {
        var member = await db.WorkspaceStudentMemberships.AsNoTracking().Where(x =>
            x.WorkspaceId == workspace && x.Id == membershipId && x.IsActive)
            .Select(x => new { x.StudentId, x.ProgramId }).SingleOrDefaultAsync(ct);
        if (member is null) return null;
        var end = month?.AddMonths(1);
        var fromInstant = month.HasValue ? MoscowStart(month.Value) : (DateTimeOffset?)null;
        var untilInstant = end.HasValue ? MoscowStart(end.Value) : (DateTimeOffset?)null;
        PupilHistoryRow Row(Guid id, string title, DateOnly date, int? score, object details) =>
            new(id, membershipId, member.ProgramId, source, title, date, score, details);
        switch (source)
        {
            case "imported":
            {
                var query = db.HomeworkAssignments.AsNoTracking().Where(x => x.WorkspaceId == workspace &&
                    x.MembershipId == membershipId && x.StudentId == member.StudentId && x.ProgramId == member.ProgramId &&
                    (!fromInstant.HasValue || x.AssignedAt >= fromInstant && x.AssignedAt < untilInstant) &&
                    (!results || x.ScorePercent != null || db.HomeworkSubmissions.Any(s => s.WorkspaceId == workspace &&
                        s.MembershipId == membershipId && s.StudentId == member.StudentId && s.ProgramId == member.ProgramId && s.AssignmentId == x.Id)));
                var result = await PageAsync(query.OrderByDescending(x => x.AssignedAt).ThenBy(x => x.Id), page,
                    x => Row(x.Id, x.Name, MoscowDay(x.AssignedAt), x.ScorePercent,
                        new { x.HomeworkId, x.TaskNumber, x.Url, x.AssignedAt, x.DeadlineAt, x.SubmittedAt, x.Status, x.LegacyLessonId }), ct);
                var ids = result.Items.Select(x => x.Id).ToArray();
                var attempts = await db.HomeworkSubmissions.AsNoTracking().Where(x => x.WorkspaceId == workspace &&
                    x.MembershipId == membershipId && x.StudentId == member.StudentId && x.ProgramId == member.ProgramId && ids.Contains(x.AssignmentId))
                    .OrderByDescending(x => x.CompletedAt).ThenBy(x => x.Id)
                    .Select(x => new { x.Id, x.AssignmentId, x.ScorePercent, x.CompletedAt, x.DurationSeconds, x.IsLate }).ToListAsync(ct);
                return result with { Items = result.Items.Select(x => x with { Attempts = attempts.Where(a => a.AssignmentId == x.Id).Cast<object>().ToArray() }).ToArray() };
            }
            case "tests":
                return await PageAsync(db.HistoricalTestResults.AsNoTracking().Where(x => x.WorkspaceId == workspace &&
                    x.MembershipId == membershipId && x.StudentId == member.StudentId && x.ProgramId == member.ProgramId &&
                    (!month.HasValue || x.TestDate >= month && x.TestDate < end))
                    .OrderByDescending(x => x.TestDate).ThenBy(x => x.Id), page,
                    x => Row(x.Id, x.TopicName, x.TestDate, x.ScorePercent,
                        new { x.TestId, x.TaskNumber, x.CorrectCount, x.TotalCount, x.StartedAt, x.FinishedAt, x.DurationSeconds }), ct);
            case "liveTests":
                return await PageAsync(db.TestAttempts.AsNoTracking().Where(x => x.WorkspaceId == workspace &&
                    x.MembershipId == membershipId && x.StudentId == member.StudentId && x.ProgramId == member.ProgramId &&
                    (!fromInstant.HasValue || x.CompletedAt >= fromInstant && x.CompletedAt < untilInstant))
                    .OrderByDescending(x => x.CompletedAt).ThenBy(x => x.Id), page,
                    x => Row(x.Id, x.Topic, MoscowDay(x.CompletedAt), x.Percent,
                        new { x.TestId, x.TaskNumber, correctCount = x.Correct, totalCount = x.Total, x.StartedAt, finishedAt = x.CompletedAt, x.DurationSeconds }), ct);
            case "mocks":
            {
                var result = await PageAsync(db.HistoricalMockResults.AsNoTracking().Where(x => x.WorkspaceId == workspace &&
                    x.MembershipId == membershipId && x.StudentId == member.StudentId && x.ProgramId == member.ProgramId &&
                    (!month.HasValue || x.MockDate >= month && x.MockDate < end))
                    .OrderByDescending(x => x.MockDate).ThenBy(x => x.Id), page,
                    x => Row(x.Id, x.VariantName, x.MockDate, x.ScorePercent,
                        new { x.MockId, x.Score, x.PrimaryScore, x.MaxPrimaryScore, x.GradeMark, x.DurationSeconds }), ct);
                // Task events are independent historical facts, not a reconstructed attempt.
                // Their own source remains available even when no summary row exists.
                return result;
            }
            case "mockTasks":
                return await PageAsync(db.HistoricalMockTaskResults.AsNoTracking().Where(x => x.WorkspaceId == workspace &&
                    x.MembershipId == membershipId && x.StudentId == member.StudentId && x.ProgramId == member.ProgramId &&
                    (mockId == null || x.MockId == mockId) && (!mockDate.HasValue || x.MockDate == mockDate) &&
                    (!month.HasValue || x.MockDate >= month && x.MockDate < end))
                    .OrderByDescending(x => x.MockDate).ThenBy(x => x.MockId).ThenBy(x => x.TaskNumber).ThenBy(x => x.Id), page,
                    x => Row(x.Id, x.TopicName, x.MockDate, null,
                        new { x.MockId, x.TaskNumber, x.IsCorrect, x.Answered, x.EarnedPoints, x.MaxPoints }), ct);
            case "mockSessions":
                return await PageAsync(db.HistoricalMockSessions.AsNoTracking().Where(x => x.WorkspaceId == workspace &&
                    x.MembershipId == membershipId && x.StudentId == member.StudentId && x.ProgramId == member.ProgramId &&
                    (!fromInstant.HasValue || x.StartedAt >= fromInstant && x.StartedAt < untilInstant))
                    .OrderByDescending(x => x.StartedAt).ThenBy(x => x.Id), page,
                    x => Row(x.Id, x.MockId, MoscowDay(x.StartedAt), x.ScorePercent,
                        new { x.MockId, x.StartedAt, x.DeadlineAt, x.SubmittedAt, x.Status, x.PrimaryScore, x.MaxPrimaryScore, score = x.TestScore, x.GradeMark, x.DurationSeconds }), ct);
            default: throw new ArgumentException("Unknown pupil history source.", nameof(source));
        }
    }
}
