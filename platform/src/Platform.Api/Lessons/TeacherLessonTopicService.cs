using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Lessons;

public sealed class TeacherLessonTopicLink
{
    public Guid WorkspaceId { get; set; }
    public Guid LessonId { get; set; }
    public Guid TopicId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed record TeacherLessonTopicSet(Guid LessonId, int Revision, Guid[] TopicIds);
public sealed record TeacherLessonTopicRequest(Guid LessonId, int? ExpectedRevision, List<Guid>? TopicIds);
public enum TeacherLessonTopicStatus { Updated, Invalid, NotFound, Conflict }
public sealed record TeacherLessonTopicResult(TeacherLessonTopicStatus Status, TeacherLessonTopicSet? Value = null);

public sealed class TeacherLessonTopicService(PlatformDbContext db, TimeProvider clock)
{
    public async Task<List<TeacherLessonTopicSet>> ListAsync(Guid workspaceId, CancellationToken ct)
    {
        var lessons = await db.Lessons.AsNoTracking().Where(x => x.WorkspaceId == workspaceId &&
            (x.IndividualClassId != null || x.GroupClassId != null))
            .OrderBy(x => x.Id).Select(x => new { x.Id, x.TopicRevision }).ToListAsync(ct);
        var links = await db.TeacherLessonTopicLinks.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId).Select(x => new { x.LessonId, x.TopicId }).ToListAsync(ct);
        var byLesson = links.ToLookup(x => x.LessonId, x => x.TopicId);
        return lessons.Select(x => new TeacherLessonTopicSet(x.Id, x.TopicRevision,
            byLesson[x.Id].Order().ToArray())).ToList();
    }

    private static bool IsWriteConflict(Exception error) => error is PostgresException pg
        ? pg.SqlState is "40001" or "40P01" or "23505"
        : error.InnerException is { } inner && IsWriteConflict(inner);

    public async Task<TeacherLessonTopicResult> ReplaceAsync(
        Guid workspaceId, TeacherLessonTopicRequest request, CancellationToken ct)
    {
        if (request.LessonId == Guid.Empty || request.ExpectedRevision is null or < 0 or int.MaxValue ||
            request.TopicIds is null || request.TopicIds.Count > 50 || request.TopicIds.Contains(Guid.Empty) ||
            request.TopicIds.Count != request.TopicIds.Distinct().Count())
            return new(TeacherLessonTopicStatus.Invalid);
        var desired = request.TopicIds.Order().ToArray();
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            var lesson = await db.Lessons.AsNoTracking().SingleOrDefaultAsync(
                x => x.WorkspaceId == workspaceId && x.Id == request.LessonId, ct);
            if (lesson is null) return new(TeacherLessonTopicStatus.NotFound);
            // Only an explicit saved class link establishes ownership. Never infer it from students/programs.
            var active = lesson.IndividualClassId is { } individualId
                ? await db.TeacherClasses.AsNoTracking().AnyAsync(x => x.WorkspaceId == workspaceId &&
                    x.Id == individualId && !x.IsArchived, ct)
                : lesson.GroupClassId is { } groupId &&
                    await db.TeacherGroupClasses.AsNoTracking().AnyAsync(x => x.WorkspaceId == workspaceId &&
                        x.Id == groupId && !x.IsArchived, ct);
            if (!active) return new(TeacherLessonTopicStatus.NotFound);
            var allowed = await db.TeacherClassTopics.AsNoTracking().Where(x => x.WorkspaceId == workspaceId &&
                x.IndividualClassId == lesson.IndividualClassId && x.GroupClassId == lesson.GroupClassId &&
                desired.Contains(x.Id)).CountAsync(ct);
            if (allowed != desired.Length) return new(TeacherLessonTopicStatus.NotFound);
            var existing = await db.TeacherLessonTopicLinks.AsNoTracking()
                .Where(x => x.WorkspaceId == workspaceId && x.LessonId == lesson.Id)
                .Select(x => x.TopicId).ToListAsync(ct);
            var same = existing.Order().SequenceEqual(desired);
            var current = new TeacherLessonTopicSet(lesson.Id, lesson.TopicRevision, existing.Order().ToArray());
            if (lesson.TopicRevision != request.ExpectedRevision)
                return lesson.TopicRevision == request.ExpectedRevision + 1 && same
                    ? new(TeacherLessonTopicStatus.Updated, current)
                    : new(TeacherLessonTopicStatus.Conflict);
            if (same) return new(TeacherLessonTopicStatus.Updated, current);
            var changed = await db.Lessons.Where(x => x.WorkspaceId == workspaceId && x.Id == lesson.Id &&
                x.TopicRevision == request.ExpectedRevision).ExecuteUpdateAsync(
                    setters => setters.SetProperty(x => x.TopicRevision, x => x.TopicRevision + 1), ct);
            if (changed != 1) return new(TeacherLessonTopicStatus.Conflict);
            await db.TeacherLessonTopicLinks.Where(x => x.WorkspaceId == workspaceId && x.LessonId == lesson.Id &&
                !desired.Contains(x.TopicId)).ExecuteDeleteAsync(ct);
            db.TeacherLessonTopicLinks.AddRange(desired.Except(existing).Select(id => new TeacherLessonTopicLink {
                WorkspaceId = workspaceId, LessonId = lesson.Id, TopicId = id, CreatedAt = clock.GetUtcNow()
            }));
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return new(TeacherLessonTopicStatus.Updated, new(lesson.Id, lesson.TopicRevision + 1, desired));
        }
        catch (Exception ex) when (IsWriteConflict(ex))
        {
            return new(TeacherLessonTopicStatus.Conflict);
        }
    }
}
