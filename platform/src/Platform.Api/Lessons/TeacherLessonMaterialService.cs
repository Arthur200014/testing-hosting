using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Classes;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Lessons;

public sealed class TeacherLessonMaterialLink
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid RequestId { get; set; }
    public Guid LessonId { get; set; }
    public Guid MaterialId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed record TeacherLessonMaterialView(
    Guid Id, Guid LessonId, Guid MaterialId, string Title, string Url, DateTimeOffset CreatedAt, Guid? FileId = null, string? FileName = null, long? SizeBytes = null, string? ContentType = null);
public sealed record TeacherLessonMaterialWriteRequest(Guid RequestId, Guid LessonId, Guid MaterialId);
public enum TeacherLessonMaterialStatus { Created, Duplicate, Invalid, NotFound, Conflict }
public sealed record TeacherLessonMaterialResult(
    TeacherLessonMaterialStatus Status, TeacherLessonMaterialView? Response = null,
    Dictionary<string,string[]>? Errors = null);

public sealed class TeacherLessonMaterialService(PlatformDbContext db, TimeProvider clock)
{
    private IQueryable<TeacherLessonMaterialView> Links(Guid workspaceId) =>
        from link in db.TeacherLessonMaterialLinks.AsNoTracking()
        join material in db.TeacherMaterials.AsNoTracking()
            on new { link.WorkspaceId, link.MaterialId }
            equals new { material.WorkspaceId, MaterialId = material.Id }
        where link.WorkspaceId == workspaceId
        orderby link.CreatedAt descending
        select new TeacherLessonMaterialView(link.Id, link.LessonId, link.MaterialId,
            material.Title, material.Url, link.CreatedAt, material.FileAssetId, material.FileAsset == null ? null : material.FileAsset.FileName, material.FileAsset == null ? null : (long?)material.FileAsset.SizeBytes, material.FileAsset == null ? null : material.FileAsset.ContentType);

    public Task<List<TeacherLessonMaterialView>> ListAsync(Guid workspaceId, CancellationToken ct) =>
        Links(workspaceId).ToListAsync(ct);

    private Task<TeacherLessonMaterialView?> ByRequestAsync(
        Guid workspaceId, Guid requestId, CancellationToken ct) =>
        (from link in db.TeacherLessonMaterialLinks.AsNoTracking()
         join material in db.TeacherMaterials.AsNoTracking()
             on new { link.WorkspaceId, link.MaterialId }
             equals new { material.WorkspaceId, MaterialId = material.Id }
         where link.WorkspaceId == workspaceId && link.RequestId == requestId
         select new TeacherLessonMaterialView(link.Id, link.LessonId, link.MaterialId,
             material.Title, material.Url, link.CreatedAt, material.FileAssetId, material.FileAsset == null ? null : material.FileAsset.FileName, material.FileAsset == null ? null : (long?)material.FileAsset.SizeBytes, material.FileAsset == null ? null : material.FileAsset.ContentType)).SingleOrDefaultAsync(ct);

    public async Task<TeacherLessonMaterialResult> AttachAsync(
        Guid workspaceId, TeacherLessonMaterialWriteRequest request, CancellationToken ct)
    {
        var errors = new Dictionary<string,string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Request ID is required."];
        if (request.LessonId == Guid.Empty) errors["lessonId"] = ["Lesson ID is required."];
        if (request.MaterialId == Guid.Empty) errors["materialId"] = ["Material ID is required."];
        if (errors.Count > 0) return new(TeacherLessonMaterialStatus.Invalid, Errors: errors);

        var previous = await ByRequestAsync(workspaceId, request.RequestId, ct);
        if (previous is not null)
            return previous.LessonId == request.LessonId && previous.MaterialId == request.MaterialId
                ? new(TeacherLessonMaterialStatus.Duplicate, previous)
                : new(TeacherLessonMaterialStatus.Conflict);

        var lesson = await db.Lessons.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && x.Id == request.LessonId)
            .Select(x => new { x.IndividualClassId, x.GroupClassId }).SingleOrDefaultAsync(ct);
        if (lesson is null) return new(TeacherLessonMaterialStatus.NotFound);
        if (lesson.IndividualClassId is { } classId &&
            !await db.TeacherClasses.AsNoTracking().AnyAsync(x =>
                x.WorkspaceId == workspaceId && x.Id == classId && !x.IsArchived, ct))
            return new(TeacherLessonMaterialStatus.NotFound);
        if (lesson.GroupClassId is { } groupId &&
            !await db.TeacherGroupClasses.AsNoTracking().AnyAsync(x =>
                x.WorkspaceId == workspaceId && x.Id == groupId && !x.IsArchived, ct))
            return new(TeacherLessonMaterialStatus.NotFound);
        if (!await db.TeacherMaterials.AsNoTracking().AnyAsync(x =>
                x.WorkspaceId == workspaceId && x.Id == request.MaterialId, ct))
            return new(TeacherLessonMaterialStatus.NotFound);
        if (await db.TeacherLessonMaterialLinks.AsNoTracking().AnyAsync(x =>
            x.WorkspaceId == workspaceId && x.LessonId == request.LessonId &&
            x.MaterialId == request.MaterialId, ct))
            return new(TeacherLessonMaterialStatus.Conflict);

        var created = new TeacherLessonMaterialLink {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId,
            RequestId = request.RequestId, LessonId = request.LessonId,
            MaterialId = request.MaterialId, CreatedAt = clock.GetUtcNow()
        };
        db.TeacherLessonMaterialLinks.Add(created);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException e) when (e.InnerException is PostgresException pg && pg.SqlState == "23505")
        {
            db.ChangeTracker.Clear();
            previous = await ByRequestAsync(workspaceId, request.RequestId, ct);
            return previous is not null && previous.LessonId == request.LessonId &&
                previous.MaterialId == request.MaterialId
                ? new(TeacherLessonMaterialStatus.Duplicate, previous)
                : new(TeacherLessonMaterialStatus.Conflict);
        }
        return new(TeacherLessonMaterialStatus.Created,
            (await ByRequestAsync(workspaceId, request.RequestId, ct))!);
    }
}
