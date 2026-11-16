using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Subscriptions;

namespace TestingHosting.Platform.Lessons;

public sealed record TeacherLessonParticipantView(
    Guid MembershipId, Guid StudentId, Guid ProgramId,
    int DurationMinutes, string? TaskNumbers, string? TopicComment, string AttendanceStatus,
    string? Reaction = null, string? Feedback = null);

public sealed record TeacherLessonView(
    Guid Id, string LegacyLessonId, DateTimeOffset LessonAt,
    List<TeacherLessonParticipantView> Participants, string Revision,
    Guid? IndividualClassId = null, Guid? GroupClassId = null,
    string? Title = null, string? Description = null, DateTimeOffset? CompletedAt = null, DateTimeOffset? CreatedAt = null);

public sealed class TeacherHistoryReader(PlatformDbContext db)
{
    public async Task<List<TeacherLessonView>> ListLessonsAsync(
        Guid workspaceId, CancellationToken cancellationToken, Guid? membershipId = null)
    {
        var lessons = await db.Lessons.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && (!membershipId.HasValue || db.LessonParticipants.Any(p => p.WorkspaceId == workspaceId && p.LessonId == x.Id && p.MembershipId == membershipId)))
            .OrderByDescending(x => x.LessonAt).ThenBy(x => x.Id)
            .Select(x => new { x.Id, x.LegacyLessonId, x.LessonAt,
                x.IndividualClassId, x.GroupClassId, x.Title, x.Description, x.CompletedAt, x.CreatedAt })
            .ToListAsync(cancellationToken);

        var participants = await db.LessonParticipants.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && (!membershipId.HasValue || x.MembershipId == membershipId))
            .OrderBy(x => x.Id)
            .Select(x => new
            {
                x.LessonId,
                View = new TeacherLessonParticipantView(
                    x.MembershipId, x.StudentId, x.ProgramId,
                    x.DurationMinutes, x.TaskNumbers, x.TopicComment, x.AttendanceStatus, x.Reaction, x.Feedback)
            })
            .ToListAsync(cancellationToken);
        var byLesson = participants.ToLookup(x => x.LessonId, x => x.View);
        return lessons.Select(x =>
        {
            var rows = byLesson[x.Id].ToList();
            return new TeacherLessonView(x.Id, x.LegacyLessonId, x.LessonAt,
                rows, TeacherLessonRevision.Compute(x.LessonAt, rows, x.CompletedAt),
                x.IndividualClassId, x.GroupClassId, x.Title, x.Description, x.CompletedAt, x.CreatedAt);
        }).ToList();
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
