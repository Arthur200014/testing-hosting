using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Lessons;

public sealed record TeacherLessonCorrectionRequest(
    string? ExpectedRevision, DateTimeOffset? LessonAt,
    List<TeacherLessonParticipantRequest>? Participants, bool Complete = false);
public sealed record TeacherLessonFeedbackRequest(string? ExpectedRevision, string? Reaction, string? Feedback);
public enum TeacherLessonCorrectionStatus { Updated, Unchanged, Conflict, NotFound, InvalidRequest }
public sealed record TeacherLessonCorrectionResult(
    TeacherLessonCorrectionStatus Status, TeacherLessonView? Response = null,
    Dictionary<string, string[]>? Errors = null);

public sealed class TeacherLessonCorrectionService(PlatformDbContext db, TimeProvider clock)
{
    public async Task<TeacherLessonCorrectionResult> FeedbackAsync(Guid workspaceId, Guid lessonId,
        Guid membershipId, TeacherLessonFeedbackRequest request, CancellationToken ct)
    {
        var reaction = Clean(request.Reaction);
        var feedback = Clean(request.Feedback);
        if (request.ExpectedRevision is null || request.ExpectedRevision.Length != 64 ||
            !request.ExpectedRevision.All(Uri.IsHexDigit) ||
            reaction is not (null or "positive" or "neutral" or "negative") || feedback?.Length > 2000)
            return new(TeacherLessonCorrectionStatus.InvalidRequest, Errors: new()
            { ["result"] = ["Проверьте реакцию, комментарий (до 2000 символов) и обновите занятие."] });
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var workspaceKey = "lesson-workspace:" + workspaceId.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({workspaceKey}, 0))", ct);
        var lesson = await db.Lessons.Include(x => x.Participants)
            .SingleOrDefaultAsync(x => x.WorkspaceId == workspaceId && x.Id == lessonId, ct);
        var participant = lesson?.Participants.SingleOrDefault(x => x.MembershipId == membershipId);
        if (lesson is null || participant is null) return new(TeacherLessonCorrectionStatus.NotFound);
        var current = TeacherLessonRevision.FromEntity(lesson);
        if (participant.Reaction == reaction && participant.Feedback == feedback)
            return new(TeacherLessonCorrectionStatus.Unchanged, current);
        if (!string.Equals(request.ExpectedRevision, current.Revision, StringComparison.OrdinalIgnoreCase))
            return new(TeacherLessonCorrectionStatus.Conflict);
        participant.Reaction = reaction; participant.Feedback = feedback;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return new(TeacherLessonCorrectionStatus.Updated, TeacherLessonRevision.FromEntity(lesson));
    }

    public async Task<TeacherLessonCorrectionResult> CorrectAsync(
        Guid workspaceId, Guid lessonId, TeacherLessonCorrectionRequest request, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.ExpectedRevision) ||
            request.ExpectedRevision.Length != 64 ||
            !request.ExpectedRevision.All(Uri.IsHexDigit))
            errors["expectedRevision"] = ["Reload the lesson to obtain a valid revision."];
        if (request.LessonAt is null || request.LessonAt == default)
            errors["lessonAt"] = ["LessonAt is required."];
        if (request.Participants is null or { Count: 0 or > 100 })
            errors["participants"] = ["Between 1 and 100 participants are required."];

        var normalized = new List<TeacherLessonParticipantRequest>();
        if (request.Participants is not null)
        {
            var seen = new HashSet<Guid>();
            foreach (var p in request.Participants)
            {
                var status = p.AttendanceStatus?.Trim();
                var tasks = Clean(p.TaskNumbers);
                var topic = Clean(p.TopicComment);
                if (p.MembershipId == Guid.Empty || !seen.Add(p.MembershipId) ||
                    p.DurationMinutes is < 1 or > 1440 ||
                    string.IsNullOrWhiteSpace(status) || status.Length > 128 ||
                    tasks?.Length > 2048 || topic?.Length > 4096)
                {
                    errors["participants"] = ["Invalid attendance, duration, topic, or duplicate participant."];
                    break;
                }
                normalized.Add(new(p.MembershipId, p.DurationMinutes, tasks, topic, status));
            }
        }
        if (errors.Count > 0) return new(TeacherLessonCorrectionStatus.InvalidRequest, Errors: errors);

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var workspaceKey = "lesson-workspace:" + workspaceId.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({workspaceKey}, 0))", ct);
        var key = "teacher-lesson-correction:" + workspaceId.ToString("N") + ":" + lessonId.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))", ct);

        var lesson = await db.Lessons.Include(x => x.Participants)
            .SingleOrDefaultAsync(x => x.Id == lessonId && x.WorkspaceId == workspaceId, ct);
        if (lesson is null) return new(TeacherLessonCorrectionStatus.NotFound);
        var current = TeacherLessonRevision.FromEntity(lesson);

        // For existing pair/group lessons, the set of membership IDs is immutable in
        // correction. Preserve links to subscription snapshots and all homework rows.
        var expectedIds = lesson.Participants.Select(x => x.MembershipId).Order().ToArray();
        var proposedIds = normalized.Select(x => x.MembershipId).Order().ToArray();
        if (!expectedIds.SequenceEqual(proposedIds))
            return new(TeacherLessonCorrectionStatus.InvalidRequest, Errors: new()
            {
                ["participants"] = ["Cannot add or remove participants when correcting a lesson."]
            });

        var date = new DateTimeOffset(
            request.LessonAt!.Value.ToUniversalTime().Ticks -
            request.LessonAt.Value.ToUniversalTime().Ticks % 10, TimeSpan.Zero);
        var byId = normalized.ToDictionary(x => x.MembershipId);
        var identical = (!request.Complete || lesson.CompletedAt is not null) && lesson.LessonAt == date && lesson.Participants.All(x =>
        {
            var p = byId[x.MembershipId];
            return x.DurationMinutes == p.DurationMinutes &&
                x.TaskNumbers == p.TaskNumbers && x.TopicComment == p.TopicComment &&
                x.AttendanceStatus == p.AttendanceStatus;
        });
        // Replayed successful submissions are safe without an idempotency table.
        if (identical) return new(TeacherLessonCorrectionStatus.Unchanged, current);
        if (!string.Equals(request.ExpectedRevision, current.Revision, StringComparison.OrdinalIgnoreCase))
            return new(TeacherLessonCorrectionStatus.Conflict);

        lesson.LessonAt = date;
        if (request.Complete && lesson.CompletedAt is null)
        {
            var now = clock.GetUtcNow().ToUniversalTime();
            lesson.CompletedAt = new DateTimeOffset(now.Ticks - now.Ticks % 10, TimeSpan.Zero);
        }
        foreach (var row in lesson.Participants)
        {
            var p = byId[row.MembershipId];
            row.DurationMinutes = p.DurationMinutes;
            row.TaskNumbers = p.TaskNumbers;
            row.TopicComment = p.TopicComment;
            row.AttendanceStatus = p.AttendanceStatus!;
        }
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new(TeacherLessonCorrectionStatus.Updated, TeacherLessonRevision.FromEntity(lesson));
    }

    private static string? Clean(string? text) =>
        string.IsNullOrWhiteSpace(text) ? null : text.Trim();
}
