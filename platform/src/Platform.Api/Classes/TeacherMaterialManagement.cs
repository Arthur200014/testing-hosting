using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

// Receipts also retain revoked attachment request IDs, so late retries cannot grant access again.
public sealed class TeacherMaterialOperation
{
    public Guid WorkspaceId { get; set; }
    public Guid RequestId { get; set; }
    public Guid MaterialId { get; set; }
    public required string Kind { get; set; }
    public required string PayloadHash { get; set; }
    public int ResultRevision { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed record RenameMaterialRequest(Guid RequestId, int ExpectedRevision, string? Title);
public sealed record DeleteMaterialRequest(Guid RequestId, int ExpectedRevision);
public sealed record UnlinkMaterialRequest(Guid RequestId, string? LinkKind, Guid LinkId);

public sealed class TeacherMaterialManagement(PlatformDbContext db, TimeProvider clock)
{
    public static async Task LockAsync(PlatformDbContext db, Guid workspace, CancellationToken ct)
    {
        var key="file-workspace:"+workspace.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))",ct);
    }
    public static Task<bool> RevokedAsync(PlatformDbContext db, Guid workspace, Guid requestId, string kind, CancellationToken ct) =>
        db.TeacherMaterialOperations.AsNoTracking().AnyAsync(x=>x.WorkspaceId==workspace && x.RequestId==requestId && x.Kind=="attach-"+kind,ct);
    private static string Hash(Guid id,string value)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(id.ToString("N")+":"+value)));
    private async Task<(int Status,object? Value)?> Replay(Guid workspace,Guid requestId,string kind,string hash,CancellationToken ct)
    {
        var prior=await db.TeacherMaterialOperations.AsNoTracking().SingleOrDefaultAsync(x=>x.WorkspaceId==workspace && x.RequestId==requestId && x.Kind==kind,ct);
        if(prior is null) return null;
        if(prior.PayloadHash!=hash) return (409,"Запрос уже использован для другого изменения.");
        return (200,new{prior.MaterialId,Revision=prior.ResultRevision});
    }
    private void Receipt(Guid workspace,Guid requestId,Guid material,string kind,string hash,int revision) =>
        db.TeacherMaterialOperations.Add(new(){WorkspaceId=workspace,RequestId=requestId,MaterialId=material,Kind=kind,PayloadHash=hash,ResultRevision=revision,CreatedAt=clock.GetUtcNow()});
    public async Task<(int Status,object? Value)> RenameAsync(Guid workspace,Guid id,RenameMaterialRequest request,CancellationToken ct)
    {
        var title=request.Title?.Trim() ?? "";
        if(request.RequestId==Guid.Empty || request.ExpectedRevision<1 || title.Length is <1 or >250) return (400,"Укажите название длиной 1–250 символов.");
        var hash=Hash(id,request.ExpectedRevision+":"+title);
        await using var tx=await db.Database.BeginTransactionAsync(ct);await LockAsync(db,workspace,ct);
        if(await Replay(workspace,request.RequestId,"rename",hash,ct) is {} replay) return replay;
        var material=await db.TeacherMaterials.Include(x=>x.FileAsset).SingleOrDefaultAsync(x=>x.WorkspaceId==workspace && x.Id==id && x.DeletedAt==null,ct);
        if(material is null) return (404,null);
        if(material.Revision!=request.ExpectedRevision) return (409,"Материал изменился. Обновите библиотеку.");
        if(material.FileAsset is {} file && file.UploadTitle is null) file.UploadTitle=material.Title;
        material.Title=title;material.Revision++;
        Receipt(workspace,request.RequestId,id,"rename",hash,material.Revision);
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return (200,new{MaterialId=id,material.Revision});
    }
    public async Task<(int Status,object? Value)> UnlinkAsync(Guid workspace,Guid id,UnlinkMaterialRequest request,CancellationToken ct)
    {
        if(request.RequestId==Guid.Empty || request.LinkId==Guid.Empty || request.LinkKind is not ("class" or "topic" or "lesson")) return (400,"Выберите существующую привязку.");
        var kind="unlink-"+request.LinkKind;var hash=Hash(id,request.LinkId.ToString("N"));
        await using var tx=await db.Database.BeginTransactionAsync(ct);await LockAsync(db,workspace,ct);
        if(await Replay(workspace,request.RequestId,kind,hash,ct) is {} replay) return replay;
        var material=await db.TeacherMaterials.AsNoTracking().SingleOrDefaultAsync(x=>x.WorkspaceId==workspace && x.Id==id && x.DeletedAt==null,ct);
        if(material is null) return (404,null);
        Guid attachRequest;
        if(request.LinkKind=="class") {
            var link=await db.TeacherClassMaterialLinks.SingleOrDefaultAsync(x=>x.WorkspaceId==workspace && x.MaterialId==id && x.Id==request.LinkId,ct);
            if(link is null) return (404,null);attachRequest=link.RequestId;db.TeacherClassMaterialLinks.Remove(link);
        } else if(request.LinkKind=="topic") {
            var link=await db.TeacherTopicMaterialLinks.SingleOrDefaultAsync(x=>x.WorkspaceId==workspace && x.MaterialId==id && x.Id==request.LinkId,ct);
            if(link is null) return (404,null);attachRequest=link.RequestId;db.TeacherTopicMaterialLinks.Remove(link);
        } else {
            var link=await db.TeacherLessonMaterialLinks.SingleOrDefaultAsync(x=>x.WorkspaceId==workspace && x.MaterialId==id && x.Id==request.LinkId,ct);
            if(link is null) return (404,null);attachRequest=link.RequestId;db.TeacherLessonMaterialLinks.Remove(link);
        }
        Receipt(workspace,attachRequest,id,"attach-"+request.LinkKind,request.LinkId.ToString("N"),material.Revision);
        Receipt(workspace,request.RequestId,id,kind,hash,material.Revision);
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return (200,new{MaterialId=id,material.Revision});
    }
    public async Task<(int Status,object? Value)> DeleteAsync(Guid workspace,Guid id,DeleteMaterialRequest request,CancellationToken ct)
    {
        if(request.RequestId==Guid.Empty || request.ExpectedRevision<1) return (400,"Обновите материал перед удалением.");
        var hash=Hash(id,request.ExpectedRevision.ToString());
        await using var tx=await db.Database.BeginTransactionAsync(ct);await LockAsync(db,workspace,ct);
        if(await Replay(workspace,request.RequestId,"delete",hash,ct) is {} replay) return replay;
        var material=await db.TeacherMaterials.Include(x=>x.FileAsset).SingleOrDefaultAsync(x=>x.WorkspaceId==workspace && x.Id==id && x.DeletedAt==null,ct);
        if(material is null) return (404,null);
        if(material.Revision!=request.ExpectedRevision) return (409,"Материал изменился. Обновите библиотеку.");
        if(await db.TeacherClassMaterialLinks.AnyAsync(x=>x.WorkspaceId==workspace && x.MaterialId==id,ct) ||
           await db.TeacherTopicMaterialLinks.AnyAsync(x=>x.WorkspaceId==workspace && x.MaterialId==id,ct) ||
           await db.TeacherLessonMaterialLinks.AnyAsync(x=>x.WorkspaceId==workspace && x.MaterialId==id,ct)) return (409,"Материал используется. Сначала снимите все привязки.");
        material.DeletedAt=clock.GetUtcNow();material.Revision++;
        if(material.FileAsset is {} file) {
            file.DeletedAt=material.DeletedAt;
            var content=await db.TeacherFileContents.SingleOrDefaultAsync(x=>x.WorkspaceId==workspace && x.FileId==file.Id,ct);
            if(content is not null) db.TeacherFileContents.Remove(content);
        }
        Receipt(workspace,request.RequestId,id,"delete",hash,material.Revision);
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return (200,new{MaterialId=id,material.Revision});
    }
}
