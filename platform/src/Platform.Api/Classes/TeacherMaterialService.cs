using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

// A reusable workspace material is distinct from the class attachment.
public sealed class TeacherMaterial
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public required string Title { get; set; }
    public required string Url { get; set; }
    public Guid? FileAssetId { get; set; }
    public TeacherFileAsset? FileAsset { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class TeacherClassMaterialLink
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid RequestId { get; set; }
    public Guid MaterialId { get; set; }
    public Guid? IndividualClassId { get; set; }
    public Guid? GroupClassId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed record TeacherMaterialView(Guid Id, string Title, string Url, DateTimeOffset CreatedAt, Guid? FileId = null, string? FileName = null, long? SizeBytes = null, string? ContentType = null);
public sealed record TeacherClassMaterialView(
    Guid Id, Guid MaterialId, Guid? IndividualClassId, Guid? GroupClassId,
    string Title, string Url, DateTimeOffset CreatedAt, Guid? FileId = null, string? FileName = null, long? SizeBytes = null, string? ContentType = null);
public sealed record TeacherClassMaterialWriteRequest(
    Guid RequestId, Guid ClassId, string ClassKind, Guid? MaterialId = null,
    string? Title = null, string? Url = null);
public enum TeacherClassMaterialStatus { Created, Duplicate, NotFound, Invalid, Conflict }
public sealed record TeacherClassMaterialResult(
    TeacherClassMaterialStatus Status, TeacherClassMaterialView? Response = null,
    Dictionary<string, string[]>? Errors = null);

public sealed class TeacherMaterialService(PlatformDbContext db, TimeProvider clock)
{
    public Task<List<TeacherMaterialView>> LibraryAsync(Guid workspaceId, CancellationToken ct) =>
        db.TeacherMaterials.AsNoTracking().Where(x => x.WorkspaceId == workspaceId)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new TeacherMaterialView(x.Id, x.Title, x.Url, x.CreatedAt, x.FileAssetId, x.FileAsset == null ? null : x.FileAsset.FileName, x.FileAsset == null ? null : (long?)x.FileAsset.SizeBytes, x.FileAsset == null ? null : x.FileAsset.ContentType))
            .ToListAsync(ct);

    private IQueryable<TeacherClassMaterialView> Linked(Guid workspaceId) =>
        from link in db.TeacherClassMaterialLinks.AsNoTracking()
        join material in db.TeacherMaterials.AsNoTracking()
            on new { link.WorkspaceId, link.MaterialId }
            equals new { material.WorkspaceId, MaterialId = material.Id }
        where link.WorkspaceId == workspaceId
        orderby link.CreatedAt descending
        select new TeacherClassMaterialView(link.Id, link.MaterialId,
            link.IndividualClassId, link.GroupClassId, material.Title, material.Url, link.CreatedAt, material.FileAssetId, material.FileAsset == null ? null : material.FileAsset.FileName, material.FileAsset == null ? null : (long?)material.FileAsset.SizeBytes, material.FileAsset == null ? null : material.FileAsset.ContentType);

    public Task<List<TeacherClassMaterialView>> LinksAsync(Guid workspaceId, CancellationToken ct) =>
        Linked(workspaceId).ToListAsync(ct);

    private Task<TeacherClassMaterialView?> ByRequestAsync(Guid workspaceId, Guid requestId, CancellationToken ct) =>
        (from link in db.TeacherClassMaterialLinks.AsNoTracking()
         join material in db.TeacherMaterials.AsNoTracking()
             on new { link.WorkspaceId, link.MaterialId }
             equals new { material.WorkspaceId, MaterialId = material.Id }
         where link.WorkspaceId == workspaceId && link.RequestId == requestId
         select new TeacherClassMaterialView(link.Id, link.MaterialId,
             link.IndividualClassId, link.GroupClassId, material.Title, material.Url, link.CreatedAt, material.FileAssetId, material.FileAsset == null ? null : material.FileAsset.FileName, material.FileAsset == null ? null : (long?)material.FileAsset.SizeBytes, material.FileAsset == null ? null : material.FileAsset.ContentType))
        .SingleOrDefaultAsync(ct);

    private static bool SameRequest(TeacherClassMaterialView existing, TeacherClassMaterialWriteRequest request,
        string title, string url) =>
        (request.ClassKind == "individual" ? existing.IndividualClassId == request.ClassId && existing.GroupClassId is null :
            existing.GroupClassId == request.ClassId && existing.IndividualClassId is null)
        && (request.MaterialId is { } materialId ? materialId == existing.MaterialId :
            existing.Title == title && existing.Url == url);

    private static bool ValidHttps(string input) =>
        input.Length <= 2048 && Uri.TryCreate(input, UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps && !string.IsNullOrEmpty(uri.Host)
        && string.IsNullOrEmpty(uri.UserInfo) && uri.Port == 443
        && !uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase);

    public async Task<TeacherClassMaterialResult> CreateAsync(
        Guid workspaceId, TeacherClassMaterialWriteRequest request, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Request ID is required."];
        if (request.ClassId == Guid.Empty) errors["classId"] = ["Class ID is required."];
        if (request.ClassKind is not ("individual" or "group")) errors["classKind"] = ["Invalid class kind."];
        var title = (request.Title ?? "").Trim();
        var url = (request.Url ?? "").Trim();
        if (request.MaterialId is null)
        {
            if (title.Length is < 1 or > 250) errors["title"] = ["Title must contain 1–250 characters."];
            if (!ValidHttps(url)) errors["url"] = ["An absolute HTTPS URL is required (max 2048)."];
        }
        else if (request.MaterialId == Guid.Empty || title.Length > 0 || url.Length > 0)
            errors["materialId"] = ["Choose an existing material without changing its title/URL."];
        if (errors.Count != 0) return new(TeacherClassMaterialStatus.Invalid, Errors: errors);

        var previous = await ByRequestAsync(workspaceId, request.RequestId, ct);
        if (previous is not null)
            return SameRequest(previous, request, title, url)
                ? new(TeacherClassMaterialStatus.Duplicate, previous)
                : new(TeacherClassMaterialStatus.Conflict);

        var classExists = request.ClassKind == "individual"
            ? await db.TeacherClasses.AsNoTracking().AnyAsync(
                x => x.WorkspaceId == workspaceId && x.Id == request.ClassId && !x.IsArchived, ct)
            : await db.TeacherGroupClasses.AsNoTracking().AnyAsync(
                x => x.WorkspaceId == workspaceId && x.Id == request.ClassId && !x.IsArchived, ct);
        if (!classExists) return new(TeacherClassMaterialStatus.NotFound);

        TeacherMaterial material;
        if (request.MaterialId is { } id)
        {
            material = await db.TeacherMaterials.AsNoTracking().Include(x=>x.FileAsset)
                .SingleOrDefaultAsync(x => x.WorkspaceId == workspaceId && x.Id == id, ct)
                ?? null!;
            if (material is null) return new(TeacherClassMaterialStatus.NotFound);
        }
        else
        {
            material = new TeacherMaterial {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId, Title = title,
                Url = url, CreatedAt = clock.GetUtcNow()
            };
            db.TeacherMaterials.Add(material);
        }
        var existingLink = await db.TeacherClassMaterialLinks.AsNoTracking().AnyAsync(
            x => x.WorkspaceId == workspaceId && x.MaterialId == material.Id
                && (request.ClassKind == "individual" ? x.IndividualClassId == request.ClassId : x.GroupClassId == request.ClassId), ct);
        if (existingLink) return new(TeacherClassMaterialStatus.Conflict);

        var created = new TeacherClassMaterialLink {
            Id = Guid.NewGuid(), RequestId = request.RequestId, WorkspaceId = workspaceId,
            MaterialId = material.Id,
            IndividualClassId = request.ClassKind == "individual" ? request.ClassId : null,
            GroupClassId = request.ClassKind == "group" ? request.ClassId : null,
            CreatedAt = clock.GetUtcNow()
        };
        db.TeacherClassMaterialLinks.Add(created);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23505")
        {
            db.ChangeTracker.Clear();
            previous = await ByRequestAsync(workspaceId, request.RequestId, ct);
            return previous is not null && SameRequest(previous, request, title, url)
                ? new(TeacherClassMaterialStatus.Duplicate, previous)
                : new(TeacherClassMaterialStatus.Conflict);
        }
        return new(TeacherClassMaterialStatus.Created,
            new TeacherClassMaterialView(created.Id, material.Id,
                created.IndividualClassId, created.GroupClassId, material.Title, material.Url, created.CreatedAt, material.FileAssetId, material.FileAsset?.FileName, material.FileAsset?.SizeBytes, material.FileAsset?.ContentType));
    }
}
