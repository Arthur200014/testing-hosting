using System.Data;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Homework;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Lessons;

public sealed record TeacherLessonHomeworkRequest(
    TeacherLessonWriteRequest? Lesson, Guid? CatalogItemId, int? DeadlineHours);

public sealed record TeacherLessonHomeworkResponse(
    TeacherLessonWriteResponse Lesson, TeacherAssignHomeworkResponse? Homework);

public enum TeacherLessonHomeworkStatus { Created, Duplicate, Conflict, NotFound, InvalidRequest }

public sealed record TeacherLessonHomeworkResult(
    TeacherLessonHomeworkStatus Status, TeacherLessonHomeworkResponse? Response = null,
    Dictionary<string, string[]>? Errors = null);

public sealed class TeacherLessonHomeworkService(
    PlatformDbContext db, TeacherLessonService lessons, TeacherHomeworkAssignmentService homework)
{
    public async Task<TeacherLessonHomeworkResult> SaveAsync(
        Guid workspaceId, TeacherLessonHomeworkRequest request, CancellationToken cancellationToken)
    {
        if (request.Lesson is null)
            return Invalid("lesson", "Lesson is required.");
        if (request.CatalogItemId is null && request.DeadlineHours is not null)
            return Invalid("deadlineHours", "DeadlineHours requires a catalog item.");

        var lessonRequest = request.Lesson;
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.ReadCommitted, cancellationToken);
        var lockKey = workspaceId.ToString("N") + ":" + lessonRequest.RequestId.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))", cancellationToken);

        var savedLesson = await lessons.SaveAsync(workspaceId, lessonRequest, cancellationToken);
        if (savedLesson.Status == TeacherLessonWriteStatus.InvalidRequest)
            return new(TeacherLessonHomeworkStatus.InvalidRequest, Errors: savedLesson.Errors);
        if (savedLesson.Status == TeacherLessonWriteStatus.MembershipNotFound)
            return new(TeacherLessonHomeworkStatus.NotFound);
        if (savedLesson.Status == TeacherLessonWriteStatus.Conflict)
            return new(TeacherLessonHomeworkStatus.Conflict);

        if (request.CatalogItemId is null)
        {
            var prefix = "api:" + lessonRequest.RequestId.ToString("N") + ":";
            if (await db.HomeworkAssignments.AsNoTracking().AnyAsync(x =>
                x.WorkspaceId == workspaceId && x.AssignmentRecordId.StartsWith(prefix), cancellationToken))
                return new(TeacherLessonHomeworkStatus.Conflict);

            if (savedLesson.Status == TeacherLessonWriteStatus.Created)
                await transaction.CommitAsync(cancellationToken);
            return new(savedLesson.Status == TeacherLessonWriteStatus.Created
                ? TeacherLessonHomeworkStatus.Created : TeacherLessonHomeworkStatus.Duplicate,
                new(savedLesson.Response!, null));
        }

        var assignment = new TeacherAssignHomeworkRequest(
            lessonRequest.RequestId, request.CatalogItemId.Value, lessonRequest.LessonAt,
            request.DeadlineHours ?? 0,
            lessonRequest.Participants?.Select(x => x.MembershipId).ToList());
        var savedHomework = await homework.AssignInTransactionAsync(
            workspaceId, assignment, cancellationToken);
        if (savedHomework.Status == TeacherAssignHomeworkStatus.InvalidRequest)
            return new(TeacherLessonHomeworkStatus.InvalidRequest, Errors: savedHomework.Errors);
        if (savedHomework.Status == TeacherAssignHomeworkStatus.NotFound)
            return new(TeacherLessonHomeworkStatus.NotFound);
        if (savedHomework.Status == TeacherAssignHomeworkStatus.Conflict ||
            (savedLesson.Status == TeacherLessonWriteStatus.Created) !=
            (savedHomework.Status == TeacherAssignHomeworkStatus.Created))
            return new(TeacherLessonHomeworkStatus.Conflict);

        if (savedLesson.Status == TeacherLessonWriteStatus.Created)
            await transaction.CommitAsync(cancellationToken);
        return new(savedLesson.Status == TeacherLessonWriteStatus.Created
            ? TeacherLessonHomeworkStatus.Created : TeacherLessonHomeworkStatus.Duplicate,
            new(savedLesson.Response!, savedHomework.Response));
    }

    private static TeacherLessonHomeworkResult Invalid(string field, string message) =>
        new(TeacherLessonHomeworkStatus.InvalidRequest, Errors: new() { [field] = [message] });
}
