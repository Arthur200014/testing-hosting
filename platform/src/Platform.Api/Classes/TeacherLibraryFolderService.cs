using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

public sealed class TeacherLibraryFolder
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public required string Title { get; set; }
    public int Revision { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed class TeacherLibraryFolderOperation
{
    public Guid WorkspaceId { get; set; }
    public Guid RequestId { get; set; }
    public required string Kind { get; set; }
    public Guid FolderId { get; set; }
    public required string PayloadHash { get; set; }
    public int ResultRevision { get; set; }
}
public sealed record CreateLibraryFolderRequest(Guid RequestId, string? Title);
public sealed record RenameLibraryFolderRequest(Guid RequestId, int ExpectedRevision, string? Title);
public sealed record MoveMaterialRequest(Guid RequestId, int ExpectedRevision, Guid? FolderId);
public sealed class TeacherLibraryFolderService(PlatformDbContext db, TimeProvider clock)
{
    public Task<List<TeacherLibraryFolder>> ListAsync(Guid workspace, CancellationToken ct) =>
        db.TeacherLibraryFolders.AsNoTracking().Where(x=>x.WorkspaceId==workspace).OrderBy(x=>x.Title).ThenBy(x=>x.Id).ToListAsync(ct);

    public async Task<(int Status,object? Value)> WriteAsync(Guid workspace,Guid? id,Guid requestId,int expectedRevision,string? rawTitle,CancellationToken ct)
    {
        var title=rawTitle?.Trim() ?? "";
        if(requestId==Guid.Empty || title.Length is <1 or >100 || (id.HasValue && expectedRevision<1)) return (400,"Укажите название папки длиной 1–100 символов и актуальную версию.");
        var kind=id.HasValue?"rename":"create";
        var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(id+":"+expectedRevision+":"+title)));
        await using var tx=await db.Database.BeginTransactionAsync(ct);
        await TeacherMaterialManagement.LockAsync(db,workspace,ct);
        var prior=await db.TeacherLibraryFolderOperations.AsNoTracking().SingleOrDefaultAsync(x=>x.WorkspaceId==workspace && x.RequestId==requestId && x.Kind==kind,ct);
        if(prior is not null) return prior.PayloadHash==hash ? (200,new{Id=prior.FolderId,Revision=prior.ResultRevision}) : (409,"Запрос уже использован для другого изменения.");
        TeacherLibraryFolder folder;
        if(id is {} folderId) {
            var current=await db.TeacherLibraryFolders.SingleOrDefaultAsync(x=>x.WorkspaceId==workspace && x.Id==folderId,ct);
            if(current is null) return (404,null);
            if(current.Revision!=expectedRevision) return (409,"Папка изменилась. Обновите библиотеку.");
            folder=current;folder.Title=title;folder.Revision++;
        } else {
            folder=new(){Id=Guid.NewGuid(),WorkspaceId=workspace,Title=title,CreatedAt=clock.GetUtcNow()};
            db.TeacherLibraryFolders.Add(folder);
        }
        db.TeacherLibraryFolderOperations.Add(new(){WorkspaceId=workspace,RequestId=requestId,Kind=kind,FolderId=folder.Id,PayloadHash=hash,ResultRevision=folder.Revision});
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);
        return (200,new{folder.Id,folder.Revision});
    }
}
