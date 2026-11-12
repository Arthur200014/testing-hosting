using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Lessons;

public sealed record TeacherLessonParticipantView(
    Guid MembershipId, Guid StudentId, Guid ProgramId,
    int DurationMinutes, string? TaskNumbers, string? TopicComment, string AttendanceStatus);

public sealed record TeacherLessonView(
    Guid Id, string LegacyLessonId, DateTimeOffset LessonAt,
    List<TeacherLessonParticipantView> Participants);

public sealed record TeacherSubscriptionView(
    Guid MembershipId, Guid StudentId, Guid ProgramId,
    int PackageSize, DateTimeOffset? ResetAt, DateTimeOffset UpdatedAt,
    decimal? LessonPrice, int? BaseLessonCount);

public sealed class TeacherHistoryReader(PlatformDbContext db)
{
    public async Task<List<TeacherLessonView>> ListLessonsAsync(
        Guid workspaceId, CancellationToken cancellationToken)
    {
        var lessons = await db.Lessons.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId)
            .OrderByDescending(x => x.LessonAt).ThenBy(x => x.Id)
            .Select(x => new { x.Id, x.LegacyLessonId, x.LessonAt })
            .ToListAsync(cancellationToken);

        var participants = await db.LessonParticipants.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId)
            .OrderBy(x => x.Id)
            .Select(x => new
            {
                x.LessonId,
                View = new TeacherLessonParticipantView(
                    x.MembershipId, x.StudentId, x.ProgramId,
                    x.DurationMinutes, x.TaskNumbers, x.TopicComment, x.AttendanceStatus)
            })
            .ToListAsync(cancellationToken);
        var byLesson = participants.ToLookup(x => x.LessonId, x => x.View);
        return lessons.Select(x => new TeacherLessonView(
            x.Id, x.LegacyLessonId, x.LessonAt, byLesson[x.Id].ToList())).ToList();
    }

    public Task<List<TeacherSubscriptionView>> ListSubscriptionsAsync(
        Guid workspaceId, CancellationToken cancellationToken) =>
        db.SubscriptionSnapshots.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId)
            .OrderBy(x => x.MembershipId)
            .Select(x => new TeacherSubscriptionView(
                x.MembershipId, x.StudentId, x.ProgramId,
                x.PackageSize, x.ResetAt, x.UpdatedAt, x.LessonPrice, x.BaseLessonCount))
            .ToListAsync(cancellationToken);
}
