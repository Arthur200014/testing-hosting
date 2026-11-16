using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Classes;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Lessons;

// External recording references only; these rows never contain video bytes.
public sealed class LessonRecording
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid LessonId { get; set; }
    public required string Title { get; set; }
    public required string SourceUrl { get; set; }
    public bool IsAvailable { get; set; }
    public DateTimeOffset? AccessUntil { get; set; }
    public int Revision { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed class LessonRecordingOperation
{
    public Guid WorkspaceId { get; set; }
    public Guid RequestId { get; set; }
    public Guid RecordingId { get; set; }
    public required string Kind { get; set; }
    public required string PayloadHash { get; set; }
    public int ResultRevision { get; set; }
}
public sealed record RecordingWriteRequest(Guid RequestId,Guid LessonId,string? Title,string? SourceUrl,int ExpectedRevision=0,DateTimeOffset? AccessUntil=null,bool IsAvailable=true);
public sealed record TeacherRecordingView(Guid Id,Guid LessonId,string Title,string SourceUrl,int Revision,bool IsAvailable,DateTimeOffset? AccessUntil,DateTimeOffset CreatedAt,DateTimeOffset LessonAt,string? LessonTitle,Guid? IndividualClassId,Guid? GroupClassId);
public sealed record StudentRecordingView(Guid Id,string Title,DateTimeOffset LessonAt,string? LessonTitle,string ClassTitle,DateTimeOffset? AccessUntil);

public sealed class LessonRecordingService(PlatformDbContext db,TimeProvider clock)
{
    public static string? SafeSource(string? value)
    {
        if(string.IsNullOrWhiteSpace(value) || value.Trim().Length>2048 || !Uri.TryCreate(value.Trim(),UriKind.Absolute,out var url) ||
           url.Scheme!="https" || url.Port!=443 || url.UserInfo.Length!=0 || url.IsLoopback || url.HostNameType!=UriHostNameType.Dns ||
           !url.Host.Contains('.') || url.Host.TrimEnd('.').EndsWith(".localhost",StringComparison.OrdinalIgnoreCase) || url.Host.TrimEnd('.').EndsWith(".local",StringComparison.OrdinalIgnoreCase)) return null;
        return url.AbsoluteUri.Length<=2048 ? url.AbsoluteUri : null;
    }
    public Task<List<TeacherRecordingView>> TeacherListAsync(Guid workspace,CancellationToken ct) =>
        (from r in db.LessonRecordings.AsNoTracking() join l in db.Lessons.AsNoTracking()
         on new{r.WorkspaceId,r.LessonId} equals new{l.WorkspaceId,LessonId=l.Id}
         where r.WorkspaceId==workspace orderby l.LessonAt descending,r.CreatedAt descending
         select new TeacherRecordingView(r.Id,r.LessonId,r.Title,r.SourceUrl,r.Revision,r.IsAvailable,r.AccessUntil,r.CreatedAt,l.LessonAt,l.Title,l.IndividualClassId,l.GroupClassId)).ToListAsync(ct);
    public Task<string?> TeacherSourceAsync(Guid workspace,Guid id,CancellationToken ct) =>
        db.LessonRecordings.AsNoTracking().Where(r=>r.WorkspaceId==workspace && r.Id==id).Select(r=>r.SourceUrl).SingleOrDefaultAsync(ct);

    public async Task<(int Status,object? Value)> WriteAsync(Guid workspace,Guid? id,RecordingWriteRequest request,CancellationToken ct)
    {
        var title=request.Title?.Trim() ?? "";var source=SafeSource(request.SourceUrl);
        if(request.RequestId==Guid.Empty || request.LessonId==Guid.Empty || title.Length is <1 or >250 || source is null ||
            (id.HasValue?request.ExpectedRevision<1:request.ExpectedRevision!=0)) return (400,"Укажите занятие, название и HTTPS-ссылку на внешний источник.");
        var kind=id.HasValue?"edit":"create";
        var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(System.Text.Json.JsonSerializer.Serialize(new{id,request.LessonId,title,source,request.ExpectedRevision,Until=request.AccessUntil?.ToUniversalTime(),request.IsAvailable}))));
        await using var tx=await db.Database.BeginTransactionAsync(ct);await TeacherMaterialManagement.LockAsync(db,workspace,ct);
        var previous=await db.LessonRecordingOperations.AsNoTracking().SingleOrDefaultAsync(x=>x.WorkspaceId==workspace && x.RequestId==request.RequestId && x.Kind==kind,ct);
        if(previous is not null) {
            if(previous.PayloadHash!=hash) return (409,"Запрос уже использован для другого изменения.");
            return (200,new{Id=previous.RecordingId,Revision=previous.ResultRevision});
        }
        var lesson=await db.Lessons.AsNoTracking().SingleOrDefaultAsync(l=>l.WorkspaceId==workspace && l.Id==request.LessonId,ct);
        if(lesson is null || (lesson.IndividualClassId is null && lesson.GroupClassId is null)) return (404,null);
        if(lesson.IndividualClassId is {} cls && !await db.TeacherClasses.AnyAsync(c=>c.WorkspaceId==workspace && c.Id==cls && !c.IsArchived,ct) ||
           lesson.GroupClassId is {} grp && !await db.TeacherGroupClasses.AnyAsync(c=>c.WorkspaceId==workspace && c.Id==grp && !c.IsArchived,ct)) return (404,null);
        LessonRecording row;
        if(id is {} recording) {
            var current=await db.LessonRecordings.SingleOrDefaultAsync(x=>x.WorkspaceId==workspace && x.Id==recording,ct);
            if(current is null) return (404,null);
            if(current.Revision!=request.ExpectedRevision) return (409,"Запись изменилась. Обновите библиотеку.");
            row=current;row.Revision++;
        } else {row=new(){Id=Guid.NewGuid(),WorkspaceId=workspace,LessonId=lesson.Id,Title=title,SourceUrl=source,CreatedAt=clock.GetUtcNow()};db.LessonRecordings.Add(row);}
        row.LessonId=lesson.Id;row.Title=title;row.SourceUrl=source;row.AccessUntil=request.AccessUntil?.ToUniversalTime();row.IsAvailable=request.IsAvailable;
        db.LessonRecordingOperations.Add(new(){WorkspaceId=workspace,RequestId=request.RequestId,RecordingId=row.Id,Kind=kind,PayloadHash=hash,ResultRevision=row.Revision});
        await db.SaveChangesAsync(ct);await tx.CommitAsync(ct);return (200,new{row.Id,row.Revision});
    }
    private async Task<(Guid Workspace,Guid Member)?> StudentAsync(ClaimsPrincipal principal,CancellationToken ct)
    {
        if(!Guid.TryParse(principal.FindFirstValue("workspace_id"),out var workspace) || !Guid.TryParse(principal.FindFirstValue("membership_id"),out var member) || !Guid.TryParse(principal.FindFirstValue("sub"),out var student)) return null;
        return await db.WorkspaceStudentMemberships.AnyAsync(x=>x.WorkspaceId==workspace && x.Id==member && x.StudentId==student && x.IsActive && x.Student.IsActive && x.Program.IsActive,ct)?(workspace,member):null;
    }
    private IQueryable<LessonRecording> Accessible(Guid workspace,Guid member)
    {
        var now=clock.GetUtcNow();
        var individual=db.TeacherClasses.Where(c=>c.WorkspaceId==workspace && !c.IsArchived && c.StudentMembershipId==member).Select(c=>c.Id);
        var groups=db.TeacherGroupClasses.Where(c=>c.WorkspaceId==workspace && !c.IsArchived && c.Members.Any(m=>m.MembershipId==member && m.IsApproved)).Select(c=>c.Id);
        var lessons=db.Lessons.Where(l=>l.WorkspaceId==workspace && l.Participants.Any(p=>p.MembershipId==member) &&
            (l.IndividualClassId!=null && individual.Contains(l.IndividualClassId.Value) || l.GroupClassId!=null && groups.Contains(l.GroupClassId.Value))).Select(l=>l.Id);
        return db.LessonRecordings.AsNoTracking().Where(r=>r.WorkspaceId==workspace && r.IsAvailable && (r.AccessUntil==null || r.AccessUntil>now) && lessons.Contains(r.LessonId));
    }
    public async Task<List<StudentRecordingView>?> StudentListAsync(ClaimsPrincipal principal,CancellationToken ct)
    {
        var identity=await StudentAsync(principal,ct);if(identity is null) return null;
        var (workspace,member)=identity.Value;
        return await (from r in Accessible(workspace,member) join l in db.Lessons.AsNoTracking() on new{r.WorkspaceId,r.LessonId} equals new{l.WorkspaceId,LessonId=l.Id}
            orderby l.LessonAt descending,r.CreatedAt descending
            select new StudentRecordingView(r.Id,r.Title,l.LessonAt,l.Title,
                (l.IndividualClassId!=null ? db.TeacherClasses.Where(c=>c.WorkspaceId==workspace && c.Id==l.IndividualClassId).Select(c=>c.Title).FirstOrDefault() : db.TeacherGroupClasses.Where(c=>c.WorkspaceId==workspace && c.Id==l.GroupClassId).Select(c=>c.Title).FirstOrDefault()) ?? "Класс",r.AccessUntil)).ToListAsync(ct);
    }
    public async Task<string?> StudentSourceAsync(ClaimsPrincipal principal,Guid id,CancellationToken ct)
    {
        var identity=await StudentAsync(principal,ct);if(identity is null) return null;
        return await Accessible(identity.Value.Workspace,identity.Value.Member).Where(r=>r.Id==id).Select(r=>r.SourceUrl).SingleOrDefaultAsync(ct);
    }
}
