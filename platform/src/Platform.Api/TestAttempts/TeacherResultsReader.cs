using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.TestAttempts;

public sealed record TeacherTestResultView(
    Guid MembershipId, string TestId, DateOnly TestDate, string TopicId, string TopicName,
    int TaskNumber, int? CorrectCount, int? TotalCount, int ScorePercent,
    DateTimeOffset? StartedAt, DateTimeOffset? FinishedAt);

public sealed record TeacherMockResultView(
    Guid MembershipId, string MockId, DateOnly MockDate, string VariantName,
    int? Score, int PrimaryScore, int MaxPrimaryScore, int ScorePercent, int? GradeMark);

public sealed record TeacherMockTaskView(
    Guid MembershipId, string MockId, DateOnly MockDate, int TaskNumber,
    string TopicId, string TopicName, bool IsCorrect, bool Answered,
    int? EarnedPoints, int? MaxPoints);

public sealed record TeacherLiveTestAttemptView(
    Guid MembershipId, string TestId, string Topic, int TaskNumber,
    int Correct, int Total, int Percent, DateTimeOffset CompletedAt,
    int DurationSeconds, string MoscowMonthKey);

public sealed record TeacherMockSessionView(
    Guid MembershipId, string MockId, DateTimeOffset StartedAt, DateTimeOffset DeadlineAt,
    string Status, DateTimeOffset? SubmittedAt, int? PrimaryScore,
    int? MaxPrimaryScore, int? ScorePercent, int? GradeMark);

public sealed class TeacherResultsReader(PlatformDbContext db)
{
    public Task<List<TeacherLiveTestAttemptView>> LiveTestsAsync(
        Guid workspaceId, Guid? membershipId, CancellationToken cancellationToken) =>
        db.TestAttempts.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId &&
                (!membershipId.HasValue || x.MembershipId == membershipId.Value))
            .OrderByDescending(x => x.CompletedAt).ThenBy(x => x.Id)
            .Select(x => new TeacherLiveTestAttemptView(
                x.MembershipId, x.TestId, x.Topic, x.TaskNumber,
                x.Correct, x.Total, x.Percent, x.CompletedAt,
                x.DurationSeconds, x.MoscowMonthKey))
            .ToListAsync(cancellationToken);

    public Task<List<TeacherMockSessionView>> MockSessionsAsync(
        Guid workspaceId, Guid? membershipId, CancellationToken cancellationToken) =>
        db.HistoricalMockSessions.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId &&
                (!membershipId.HasValue || x.MembershipId == membershipId.Value))
            .OrderByDescending(x => x.StartedAt).ThenBy(x => x.Id)
            .Select(x => new TeacherMockSessionView(
                x.MembershipId, x.MockId, x.StartedAt, x.DeadlineAt,
                x.Status, x.SubmittedAt, x.PrimaryScore,
                x.MaxPrimaryScore, x.ScorePercent, x.GradeMark))
            .ToListAsync(cancellationToken);

    public Task<List<TeacherTestResultView>> TestsAsync(
        Guid workspaceId, Guid? membershipId, CancellationToken cancellationToken) =>
        db.HistoricalTestResults.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId &&
                (!membershipId.HasValue || x.MembershipId == membershipId.Value))
            .OrderByDescending(x => x.TestDate).ThenBy(x => x.Id)
            .Select(x => new TeacherTestResultView(
                x.MembershipId, x.TestId, x.TestDate, x.TopicId, x.TopicName,
                x.TaskNumber, x.CorrectCount, x.TotalCount, x.ScorePercent,
                x.StartedAt, x.FinishedAt))
            .ToListAsync(cancellationToken);

    public Task<List<TeacherMockResultView>> MocksAsync(
        Guid workspaceId, Guid? membershipId, CancellationToken cancellationToken) =>
        db.HistoricalMockResults.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId &&
                (!membershipId.HasValue || x.MembershipId == membershipId.Value))
            .OrderByDescending(x => x.MockDate).ThenBy(x => x.Id)
            .Select(x => new TeacherMockResultView(
                x.MembershipId, x.MockId, x.MockDate, x.VariantName,
                x.Score, x.PrimaryScore, x.MaxPrimaryScore, x.ScorePercent, x.GradeMark))
            .ToListAsync(cancellationToken);

    public Task<List<TeacherMockTaskView>> MockTasksAsync(
        Guid workspaceId, Guid? membershipId, CancellationToken cancellationToken) =>
        db.HistoricalMockTaskResults.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId &&
                (!membershipId.HasValue || x.MembershipId == membershipId.Value))
            .OrderByDescending(x => x.MockDate).ThenBy(x => x.TaskNumber).ThenBy(x => x.Id)
            .Select(x => new TeacherMockTaskView(
                x.MembershipId, x.MockId, x.MockDate, x.TaskNumber,
                x.TopicId, x.TopicName, x.IsCorrect, x.Answered,
                x.EarnedPoints, x.MaxPoints))
            .ToListAsync(cancellationToken);
}
