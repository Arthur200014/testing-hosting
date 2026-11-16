using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

public sealed class TeacherFileAsset
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid RequestId { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public string? UploadTitle { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public required string Sha256 { get; set; }
    public long SizeBytes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed class TeacherFileContent
{
    public Guid FileId { get; set; }
    public Guid WorkspaceId { get; set; }
    public required byte[] Bytes { get; set; }
}
public sealed record FileDownload(byte[] Bytes, string ContentType, string FileName);

// Small educational documents use existing durable PostgreSQL storage. Lists never load binary content.
public sealed class TeacherFileService(PlatformDbContext db, TimeProvider clock)
{
    public const int MaxFileBytes = 5 * 1024 * 1024;
    public const long MaxWorkspaceBytes = 100 * 1024 * 1024;
    public async Task<(int Status, object? Value)> UploadAsync(Guid workspace, Guid requestId, string? fileName,
        string? title, Stream stream, long? contentLength, CancellationToken ct)
    {
        var name = fileName?.Trim() ?? "";
        var caption = string.IsNullOrWhiteSpace(title) ? name : title.Trim();
        if (requestId == Guid.Empty || name.Length is < 1 or > 180 || name.Any(char.IsControl) ||
            name.Contains('/') || name.Contains('\\') || name is "." or ".." || caption.Length is < 1 or > 250)
            return (400, "Укажите название и корректное имя файла.");
        if (contentLength > MaxFileBytes) return (413, "Максимальный размер файла — 5 МБ.");
        await using var buffer = new MemoryStream();
        var chunk = new byte[8192];
        int read;
        while ((read = await stream.ReadAsync(chunk, ct)) != 0)
        {
            if (buffer.Length + read > MaxFileBytes) return (413, "Максимальный размер файла — 5 МБ.");
            await buffer.WriteAsync(chunk.AsMemory(0, read), ct);
        }
        var bytes = buffer.ToArray();
        var type = ContentType(name, bytes);
        if (type is null) return (400, "Поддерживаются PDF, PNG, JPEG и UTF-8 TXT с соответствующим содержимым.");
        var hash = Convert.ToHexString(SHA256.HashData(bytes));
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var key = "file-workspace:" + workspace.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))", ct);
        var prior = await db.TeacherFileAssets.AsNoTracking().SingleOrDefaultAsync(x => x.WorkspaceId == workspace && x.RequestId == requestId, ct);
        if (prior is not null)
        {
            var material = await db.TeacherMaterials.AsNoTracking().SingleAsync(x => x.WorkspaceId == workspace && x.FileAssetId == prior.Id, ct);
            if(prior.DeletedAt is not null) return (410,"Файл был удалён. Выберите файл для новой загрузки.");
            return prior.FileName == name && prior.Sha256 == hash && (prior.UploadTitle ?? material.Title) == caption
                ? (200, View(material, prior)) : (409, "Этот запрос уже использован для другого файла.");
        }
        var used = await db.TeacherFileAssets.Where(x => x.WorkspaceId == workspace && x.DeletedAt == null).SumAsync(x => (long?)x.SizeBytes, ct) ?? 0;
        if (used + bytes.Length > MaxWorkspaceBytes) return (409, "Достигнут лимит файлов пространства — 100 МБ.");
        var asset = new TeacherFileAsset { Id=Guid.NewGuid(),WorkspaceId=workspace,RequestId=requestId,
            FileName=name,UploadTitle=caption,ContentType=type,SizeBytes=bytes.Length,Sha256=hash,CreatedAt=clock.GetUtcNow() };
        var item = new TeacherMaterial { Id=Guid.NewGuid(),WorkspaceId=workspace,Title=caption,Url="",
            FileAssetId=asset.Id,FileAsset=asset,CreatedAt=asset.CreatedAt };
        db.TeacherFileAssets.Add(asset);
        db.TeacherFileContents.Add(new() {FileId=asset.Id,WorkspaceId=workspace,Bytes=bytes});
        db.TeacherMaterials.Add(item);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return (201, View(item, asset));
    }
    private static TeacherMaterialView View(TeacherMaterial m, TeacherFileAsset f) =>
        new(m.Id,m.Title,m.Url,m.CreatedAt,f.Id,f.FileName,f.SizeBytes,f.ContentType,m.Revision);
    private static string? ContentType(string name, byte[] data)
    {
        if (data.Length == 0) return null;
        var ext=Path.GetExtension(name).ToLowerInvariant();
        if (ext==".pdf" && data.AsSpan().StartsWith("%PDF-"u8)) return "application/pdf";
        if (ext==".png" && data.AsSpan().StartsWith(new byte[]{137,80,78,71,13,10,26,10})) return "image/png";
        if ((ext is ".jpg" or ".jpeg") && data.Length>=3 && data[0]==255 && data[1]==216 && data[2]==255) return "image/jpeg";
        if (ext==".txt" && !data.Contains((byte)0))
            try { _=new UTF8Encoding(false,true).GetString(data); return "text/plain"; } catch (DecoderFallbackException) { }
        return null;
    }
    public async Task<FileDownload?> TeacherDownloadAsync(Guid workspace, Guid id, CancellationToken ct) =>
        await DownloadAsync(workspace, id, ct);
    private async Task<FileDownload?> DownloadAsync(Guid workspace, Guid id, CancellationToken ct) =>
        await (from f in db.TeacherFileAssets.AsNoTracking() join c in db.TeacherFileContents.AsNoTracking()
            on new {f.WorkspaceId,FileId=f.Id} equals new {c.WorkspaceId,c.FileId}
            where f.WorkspaceId==workspace && f.Id==id && f.DeletedAt==null
            select new FileDownload(c.Bytes,f.ContentType,f.FileName)).SingleOrDefaultAsync(ct);

    private async Task<(Guid Workspace,Guid Member,Guid Student)?> StudentAsync(ClaimsPrincipal principal,CancellationToken ct)
    {
        if(!Guid.TryParse(principal.FindFirstValue("workspace_id"),out var workspace) ||
           !Guid.TryParse(principal.FindFirstValue("membership_id"),out var member) ||
           !Guid.TryParse(principal.FindFirstValue("sub"),out var student)) return null;
        return await db.WorkspaceStudentMemberships.AsNoTracking().AnyAsync(x=>x.WorkspaceId==workspace && x.Id==member &&
            x.StudentId==student && x.IsActive && x.Student.IsActive && x.Program.IsActive,ct) ? (workspace,member,student) : null;
    }
    private IQueryable<TeacherMaterial> Accessible(Guid workspace,Guid member)
    {
        var individual=db.TeacherClasses.Where(x=>x.WorkspaceId==workspace && !x.IsArchived && x.StudentMembershipId==member).Select(x=>x.Id);
        var groups=db.TeacherGroupClasses.Where(x=>x.WorkspaceId==workspace && !x.IsArchived && x.Members.Any(m=>m.MembershipId==member && m.IsApproved)).Select(x=>x.Id);
        var topics=db.TeacherClassTopics.Where(x=>x.WorkspaceId==workspace &&
            (x.IndividualClassId!=null && individual.Contains(x.IndividualClassId.Value) || x.GroupClassId!=null && groups.Contains(x.GroupClassId.Value))).Select(x=>x.Id);
        var lessons=db.Lessons.Where(x=>x.WorkspaceId==workspace && x.Participants.Any(p=>p.MembershipId==member) &&
            (x.IndividualClassId!=null && individual.Contains(x.IndividualClassId.Value) || x.GroupClassId!=null && groups.Contains(x.GroupClassId.Value))).Select(x=>x.Id);
        return db.TeacherMaterials.AsNoTracking().Where(x=>x.WorkspaceId==workspace && x.DeletedAt==null && x.FileAssetId!=null &&
            (db.TeacherClassMaterialLinks.Any(l=>l.WorkspaceId==workspace && l.MaterialId==x.Id &&
                (l.IndividualClassId!=null && individual.Contains(l.IndividualClassId.Value) || l.GroupClassId!=null && groups.Contains(l.GroupClassId.Value))) ||
             db.TeacherTopicMaterialLinks.Any(l=>l.WorkspaceId==workspace && l.MaterialId==x.Id && topics.Contains(l.TopicId)) ||
             db.TeacherLessonMaterialLinks.Any(l=>l.WorkspaceId==workspace && l.MaterialId==x.Id && lessons.Contains(l.LessonId))));
    }
    public async Task<List<TeacherMaterialView>?> StudentFilesAsync(ClaimsPrincipal principal,CancellationToken ct)
    {
        var identity=await StudentAsync(principal,ct);if(identity is null) return null;
        return await Accessible(identity.Value.Workspace,identity.Value.Member).OrderByDescending(x=>x.CreatedAt)
            .Select(x=>new TeacherMaterialView(x.Id,x.Title,x.Url,x.CreatedAt,x.FileAssetId,x.FileAsset!.FileName,x.FileAsset.SizeBytes,x.FileAsset.ContentType,x.Revision)).ToListAsync(ct);
    }
    public async Task<FileDownload?> StudentDownloadAsync(ClaimsPrincipal principal,Guid id,CancellationToken ct)
    {
        var identity=await StudentAsync(principal,ct);if(identity is null) return null;
        var (workspace,member,_)=identity.Value;
        if(!await Accessible(workspace,member).AnyAsync(x=>x.FileAssetId==id,ct)) return null;
        return await DownloadAsync(workspace,id,ct);
    }
}
