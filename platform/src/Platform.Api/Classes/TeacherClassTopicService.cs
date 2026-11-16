using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

// Class topics belong to a specific class, not a legacy LearningProgram.
public sealed class TeacherClassTopic
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid RequestId { get; set; }
    public Guid? IndividualClassId { get; set; }
    public Guid? GroupClassId { get; set; }
    public required string Title { get; set; }
    public string Plan { get; set; } = "";
    public int SortOrder { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public int CompletionRevision { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class TeacherTopicMaterialLink
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid RequestId { get; set; }
    public Guid TopicId { get; set; }
    public Guid MaterialId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

// A reusable task template attached to a topic; not a student assignment.
public sealed class TeacherTopicTaskLink
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid RequestId { get; set; }
    public Guid TopicId { get; set; }
    public Guid TaskId { get; set; }
    public Guid ProgramId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed record TeacherTopicTaskView(
    Guid Id, Guid TopicId, Guid TaskId, Guid ProgramId, string Title, string Prompt, DateTimeOffset CreatedAt);
public sealed record TeacherTopicTaskRequest(Guid RequestId, Guid TopicId, Guid TaskId);

public sealed record TeacherClassTopicView(
    Guid Id, Guid? IndividualClassId, Guid? GroupClassId, string Title,
    string Plan, int SortOrder, DateTimeOffset CreatedAt, DateTimeOffset? CompletedAt, int CompletionRevision);
public sealed record TeacherTopicMaterialView(
    Guid Id, Guid TopicId, Guid MaterialId, string Title, string Url, DateTimeOffset CreatedAt, Guid? FileId = null, string? FileName = null, long? SizeBytes = null, string? ContentType = null);
public sealed record TeacherClassTopicCreateRequest(
    Guid RequestId, Guid ClassId, string ClassKind, string? Title, string? Plan = null);
public sealed record TeacherTopicMaterialRequest(Guid RequestId, Guid TopicId, Guid MaterialId);
public sealed record TeacherTopicMoveRequest(Guid TopicId, string Direction, List<Guid>? ExpectedOrder);
public sealed record TeacherTopicCompletionRequest(Guid TopicId, bool? Completed, int? ExpectedRevision);
public enum TeacherTopicStatus { Created, Duplicate, Updated, Invalid, NotFound, Conflict }
public sealed record TeacherTopicResult(
    TeacherTopicStatus Status, TeacherClassTopicView? Topic = null,
    TeacherTopicMaterialView? Material = null, Dictionary<string, string[]>? Errors = null,
    TeacherTopicTaskView? TaskLink = null);

public sealed class TeacherClassTopicService(PlatformDbContext db, TimeProvider clock)
{
    private IQueryable<TeacherClassTopicView> Topics(Guid workspaceId) =>
        db.TeacherClassTopics.AsNoTracking().Where(x => x.WorkspaceId == workspaceId)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id)
            .Select(x => new TeacherClassTopicView(x.Id, x.IndividualClassId, x.GroupClassId,
                x.Title, x.Plan, x.SortOrder, x.CreatedAt, x.CompletedAt, x.CompletionRevision));

    private IQueryable<TeacherTopicTaskView> TaskLinks(Guid workspaceId, Guid? linkId = null) =>
        from link in db.TeacherTopicTaskLinks.AsNoTracking()
        join task in db.NativeHomeworkTasks.AsNoTracking()
            on new { link.WorkspaceId, link.TaskId, link.ProgramId }
            equals new { task.WorkspaceId, TaskId = task.Id, task.ProgramId }
        where link.WorkspaceId == workspaceId && (linkId == null || link.Id == linkId)
        orderby link.CreatedAt, link.Id
        select new TeacherTopicTaskView(link.Id, link.TopicId, link.TaskId, link.ProgramId,
            task.Title, task.Prompt, link.CreatedAt);

    public Task<List<TeacherTopicTaskView>> TasksAsync(Guid workspaceId, CancellationToken ct) =>
        TaskLinks(workspaceId).ToListAsync(ct);

    public async Task<TeacherTopicResult> AttachTaskAsync(
        Guid workspaceId, TeacherTopicTaskRequest request, CancellationToken ct)
    {
        if (request.RequestId == Guid.Empty || request.TopicId == Guid.Empty || request.TaskId == Guid.Empty)
            return new(TeacherTopicStatus.Invalid, Errors: new() {
                ["task"] = ["Request, topic and task IDs are required."]
            });
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            var topic = await db.TeacherClassTopics.AsNoTracking().SingleOrDefaultAsync(
                x => x.WorkspaceId == workspaceId && x.Id == request.TopicId, ct);
            if (topic is null || !await ClassActiveAsync(
                    workspaceId, topic.IndividualClassId, topic.GroupClassId, ct))
                return new(TeacherTopicStatus.NotFound);
            var prior = await db.TeacherTopicTaskLinks.AsNoTracking().SingleOrDefaultAsync(
                x => x.WorkspaceId == workspaceId && x.RequestId == request.RequestId, ct);
            if (prior is not null)
                return prior.TopicId == request.TopicId && prior.TaskId == request.TaskId
                    ? new(TeacherTopicStatus.Duplicate, TaskLink:
                        await TaskLinks(workspaceId, prior.Id).SingleAsync(ct))
                    : new(TeacherTopicStatus.Conflict);
            var task = await db.NativeHomeworkTasks.AsNoTracking().SingleOrDefaultAsync(
                x => x.WorkspaceId == workspaceId && x.Id == request.TaskId, ct);
            if (task is null) return new(TeacherTopicStatus.NotFound);
            if (await db.TeacherTopicTaskLinks.AnyAsync(x => x.WorkspaceId == workspaceId &&
                    x.TopicId == request.TopicId && x.TaskId == request.TaskId, ct))
                return new(TeacherTopicStatus.Conflict);
            var link = new TeacherTopicTaskLink {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId, RequestId = request.RequestId,
                TopicId = topic.Id, TaskId = task.Id, ProgramId = task.ProgramId, CreatedAt = clock.GetUtcNow()
            };
            db.TeacherTopicTaskLinks.Add(link);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return new(TeacherTopicStatus.Created, TaskLink:
                await TaskLinks(workspaceId, link.Id).SingleAsync(ct));
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23505")
        {
            await tx.RollbackAsync(ct);
            db.ChangeTracker.Clear();
            var prior = await db.TeacherTopicTaskLinks.AsNoTracking().SingleOrDefaultAsync(
                x => x.WorkspaceId == workspaceId && x.RequestId == request.RequestId, ct);
            return prior is not null && prior.TopicId == request.TopicId && prior.TaskId == request.TaskId
                ? new(TeacherTopicStatus.Duplicate, TaskLink:
                    await TaskLinks(workspaceId, prior.Id).SingleAsync(ct))
                : new(TeacherTopicStatus.Conflict);
        }
        catch (PostgresException ex) when (ex.SqlState is "40001" or "40P01")
        {
            return new(TeacherTopicStatus.Conflict);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState is "40001" or "40P01")
        {
            return new(TeacherTopicStatus.Conflict);
        }
    }

    private IQueryable<TeacherTopicMaterialView> Materials(Guid workspaceId) =>
        from link in db.TeacherTopicMaterialLinks.AsNoTracking()
        join material in db.TeacherMaterials.AsNoTracking()
            on new { link.WorkspaceId, link.MaterialId }
            equals new { material.WorkspaceId, MaterialId = material.Id }
        where material.DeletedAt == null && link.WorkspaceId == workspaceId
        orderby link.CreatedAt descending
        select new TeacherTopicMaterialView(link.Id, link.TopicId, link.MaterialId,
            material.Title, material.Url, link.CreatedAt, material.FileAssetId, material.FileAsset == null ? null : material.FileAsset.FileName, material.FileAsset == null ? null : (long?)material.FileAsset.SizeBytes, material.FileAsset == null ? null : material.FileAsset.ContentType);

    public Task<List<TeacherClassTopicView>> ListAsync(Guid workspaceId, CancellationToken ct) =>
        Topics(workspaceId).ToListAsync(ct);
    public Task<List<TeacherTopicMaterialView>> MaterialsAsync(Guid workspaceId, CancellationToken ct) =>
        Materials(workspaceId).ToListAsync(ct);

    private Task<TeacherTopicMaterialView> ByLinkAsync(
        Guid workspaceId, Guid linkId, CancellationToken ct) =>
        (from link in db.TeacherTopicMaterialLinks.AsNoTracking()
         join material in db.TeacherMaterials.AsNoTracking()
             on new { link.WorkspaceId, link.MaterialId }
             equals new { material.WorkspaceId, MaterialId = material.Id }
         where material.DeletedAt == null && link.WorkspaceId == workspaceId && link.Id == linkId
         select new TeacherTopicMaterialView(link.Id, link.TopicId, link.MaterialId,
             material.Title, material.Url, link.CreatedAt, material.FileAssetId, material.FileAsset == null ? null : material.FileAsset.FileName, material.FileAsset == null ? null : (long?)material.FileAsset.SizeBytes, material.FileAsset == null ? null : material.FileAsset.ContentType)).SingleAsync(ct);

    private Task<bool> ClassActiveAsync(Guid workspaceId, Guid? individual, Guid? group, CancellationToken ct) =>
        individual is { } individualId
            ? db.TeacherClasses.AsNoTracking().AnyAsync(x =>
                x.WorkspaceId == workspaceId && x.Id == individualId && !x.IsArchived, ct)
            : db.TeacherGroupClasses.AsNoTracking().AnyAsync(x =>
                x.WorkspaceId == workspaceId && x.Id == group && !x.IsArchived, ct);

    private static TeacherClassTopicView View(TeacherClassTopic x) =>
        new(x.Id, x.IndividualClassId, x.GroupClassId, x.Title, x.Plan, x.SortOrder, x.CreatedAt, x.CompletedAt, x.CompletionRevision);

    public async Task<TeacherTopicResult> CreateAsync(
        Guid workspaceId, TeacherClassTopicCreateRequest request, CancellationToken ct)
    {
        var title = (request.Title ?? "").Trim();
        var plan = (request.Plan ?? "").Trim();
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Request ID is required."];
        if (request.ClassId == Guid.Empty) errors["classId"] = ["Class ID is required."];
        if (request.ClassKind is not ("individual" or "group")) errors["classKind"] = ["Invalid class kind."];
        if (title.Length is < 1 or > 200) errors["title"] = ["Title must contain 1–200 characters."];
        if (plan.Length > 2000) errors["plan"] = ["Plan exceeds 2000 characters."];
        if (errors.Count > 0) return new(TeacherTopicStatus.Invalid, Errors: errors);

        var previous = await db.TeacherClassTopics.AsNoTracking().SingleOrDefaultAsync(
            x => x.WorkspaceId == workspaceId && x.RequestId == request.RequestId, ct);
        if (previous is not null)
            return previous.IndividualClassId == (request.ClassKind == "individual" ? request.ClassId : null)
                && previous.GroupClassId == (request.ClassKind == "group" ? request.ClassId : null)
                && previous.Title == title && previous.Plan == plan
                ? new(TeacherTopicStatus.Duplicate, Topic: View(previous))
                : new(TeacherTopicStatus.Conflict);
        var individual = request.ClassKind == "individual" ? request.ClassId : (Guid?)null;
        var group = request.ClassKind == "group" ? request.ClassId : (Guid?)null;
        if (!await ClassActiveAsync(workspaceId, individual, group, ct))
            return new(TeacherTopicStatus.NotFound);

        var max = await db.TeacherClassTopics.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && x.IndividualClassId == individual &&
                x.GroupClassId == group)
            .Select(x => (int?)x.SortOrder).MaxAsync(ct) ?? 0;
        var created = new TeacherClassTopic {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, RequestId = request.RequestId,
            IndividualClassId = individual, GroupClassId = group,
            Title = title, Plan = plan, SortOrder = max + 10, CreatedAt = clock.GetUtcNow()
        };
        db.TeacherClassTopics.Add(created);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23505")
        {
            db.ChangeTracker.Clear();
            previous = await db.TeacherClassTopics.AsNoTracking().SingleOrDefaultAsync(
                x => x.WorkspaceId == workspaceId && x.RequestId == request.RequestId, ct);
            return previous is not null && previous.IndividualClassId == individual
                && previous.GroupClassId == group && previous.Title == title && previous.Plan == plan
                ? new(TeacherTopicStatus.Duplicate, Topic: View(previous))
                : new(TeacherTopicStatus.Conflict);
        }
        return new(TeacherTopicStatus.Created, Topic: View(created));
    }

    public async Task<TeacherTopicResult> AttachAsync(
        Guid workspaceId, TeacherTopicMaterialRequest request, CancellationToken ct)
    {
        var errors = new Dictionary<string,string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Request ID is required."];
        if (request.TopicId == Guid.Empty) errors["topicId"] = ["Topic is required."];
        if (request.MaterialId == Guid.Empty) errors["materialId"] = ["Material is required."];
        if (errors.Count > 0) return new(TeacherTopicStatus.Invalid, Errors: errors);
        await using var tx=await db.Database.BeginTransactionAsync(ct);
        await TeacherMaterialManagement.LockAsync(db,workspaceId,ct);
        if(await TeacherMaterialManagement.RevokedAsync(db,workspaceId,request.RequestId,"topic",ct)) return new(TeacherTopicStatus.Conflict);
        var prior = await db.TeacherTopicMaterialLinks.AsNoTracking().SingleOrDefaultAsync(
            x => x.WorkspaceId == workspaceId && x.RequestId == request.RequestId, ct);
        if (prior is not null)
            return prior.TopicId == request.TopicId && prior.MaterialId == request.MaterialId
                ? new(TeacherTopicStatus.Duplicate, Material: await ByLinkAsync(workspaceId, prior.Id, ct))
                : new(TeacherTopicStatus.Conflict);

        var topic = await db.TeacherClassTopics.AsNoTracking().SingleOrDefaultAsync(
            x => x.WorkspaceId == workspaceId && x.Id == request.TopicId, ct);
        if (topic is null || !await ClassActiveAsync(
                workspaceId, topic.IndividualClassId, topic.GroupClassId, ct))
            return new(TeacherTopicStatus.NotFound);
        if (!await db.TeacherMaterials.AsNoTracking().AnyAsync(
                x => x.WorkspaceId == workspaceId && x.Id == request.MaterialId && x.DeletedAt == null, ct))
            return new(TeacherTopicStatus.NotFound);
        if (await db.TeacherTopicMaterialLinks.AsNoTracking().AnyAsync(
                x => x.WorkspaceId == workspaceId && x.TopicId == request.TopicId
                    && x.MaterialId == request.MaterialId, ct))
            return new(TeacherTopicStatus.Conflict);
        var link = new TeacherTopicMaterialLink {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, RequestId = request.RequestId,
            TopicId = request.TopicId, MaterialId = request.MaterialId, CreatedAt = clock.GetUtcNow()
        };
        db.TeacherTopicMaterialLinks.Add(link);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23505")
        {
            await tx.RollbackAsync(ct);await tx.DisposeAsync();
            db.ChangeTracker.Clear();
            prior = await db.TeacherTopicMaterialLinks.AsNoTracking().SingleOrDefaultAsync(
                x => x.WorkspaceId == workspaceId && x.RequestId == request.RequestId, ct);
            return prior is not null && prior.TopicId == request.TopicId
                && prior.MaterialId == request.MaterialId
                ? new(TeacherTopicStatus.Duplicate, Material: await ByLinkAsync(workspaceId, prior.Id, ct))
                : new(TeacherTopicStatus.Conflict);
        }
        await tx.CommitAsync(ct);
        return new(TeacherTopicStatus.Created,
            Material: await ByLinkAsync(workspaceId, link.Id, ct));
    }

    public async Task<TeacherTopicResult> CompleteAsync(
        Guid workspaceId, TeacherTopicCompletionRequest request, CancellationToken ct)
    {
        if (request.TopicId == Guid.Empty || request.Completed is null ||
            request.ExpectedRevision is null or < 0 or int.MaxValue)
            return new(TeacherTopicStatus.Invalid, Errors: new() {
                ["completion"] = ["Topic, completion flag and valid expected revision are required."]
            });
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            var topic = await db.TeacherClassTopics.AsNoTracking().SingleOrDefaultAsync(
                x => x.WorkspaceId == workspaceId && x.Id == request.TopicId, ct);
            if (topic is null || !await ClassActiveAsync(
                    workspaceId, topic.IndividualClassId, topic.GroupClassId, ct))
                return new(TeacherTopicStatus.NotFound);
            var completed = request.Completed.Value;
            // Replaying the immediately preceding status change is safe and preserves its timestamp.
            if (topic.CompletionRevision != request.ExpectedRevision)
                return topic.CompletionRevision == request.ExpectedRevision + 1 &&
                    (topic.CompletedAt is not null) == completed
                    ? new(TeacherTopicStatus.Updated, Topic: View(topic))
                    : new(TeacherTopicStatus.Conflict);
            if ((topic.CompletedAt is not null) == completed)
                return new(TeacherTopicStatus.Updated, Topic: View(topic));
            var completedAt = completed ? DateTimeOffset.FromUnixTimeMilliseconds(clock.GetUtcNow().ToUnixTimeMilliseconds()) : (DateTimeOffset?)null;
            var changed = await db.TeacherClassTopics.Where(x => x.WorkspaceId == workspaceId &&
                x.Id == request.TopicId && x.CompletionRevision == request.ExpectedRevision)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(x => x.CompletedAt, completedAt)
                    .SetProperty(x => x.CompletionRevision, x => x.CompletionRevision + 1), ct);
            if (changed != 1) return new(TeacherTopicStatus.Conflict);
            await tx.CommitAsync(ct);
            topic.CompletedAt = completedAt;
            topic.CompletionRevision++;
            return new(TeacherTopicStatus.Updated, Topic: View(topic));
        }
        catch (PostgresException e) when (e.SqlState is "40001" or "40P01")
        {
            return new(TeacherTopicStatus.Conflict);
        }
    }

    public async Task<TeacherTopicResult> MoveAsync(
        Guid workspaceId, TeacherTopicMoveRequest request, CancellationToken ct)
    {
        if (request.TopicId == Guid.Empty || request.Direction is not ("up" or "down") ||
            request.ExpectedOrder is not { Count: > 0 and <= 200 } ||
            request.ExpectedOrder.Count != request.ExpectedOrder.Distinct().Count())
            return new(TeacherTopicStatus.Invalid, Errors: new() {
                ["order"] = ["Topic, direction and a distinct order of at most 200 IDs are required."]
            });
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            var selected = await db.TeacherClassTopics.SingleOrDefaultAsync(
                x => x.WorkspaceId == workspaceId && x.Id == request.TopicId, ct);
            if (selected is null || !await ClassActiveAsync(
                    workspaceId, selected.IndividualClassId, selected.GroupClassId, ct))
                return new(TeacherTopicStatus.NotFound);
            var siblings = await db.TeacherClassTopics
                .Where(x => x.WorkspaceId == workspaceId
                    && x.IndividualClassId == selected.IndividualClassId
                    && x.GroupClassId == selected.GroupClassId)
                .OrderBy(x => x.SortOrder).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id).ToListAsync(ct);
            if (!siblings.Select(x => x.Id).SequenceEqual(request.ExpectedOrder))
                return new(TeacherTopicStatus.Conflict);
            var idx = siblings.FindIndex(x => x.Id == selected.Id);
            var other = idx + (request.Direction == "up" ? -1 : 1);
            if (other < 0 || other >= siblings.Count)
                return new(TeacherTopicStatus.Invalid, Errors: new() {
                    ["direction"] = ["No neighboring topic in this direction."]
                });
            (siblings[idx], siblings[other]) = (siblings[other], siblings[idx]);
            for (var i = 0; i < siblings.Count; i++) siblings[i].SortOrder = (i + 1) * 10;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return new(TeacherTopicStatus.Updated, Topic: View(selected));
        }
        catch (PostgresException e) when (e.SqlState is "40001" or "40P01")
        {
            return new(TeacherTopicStatus.Conflict);
        }
    }
}
