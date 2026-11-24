using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

public sealed record PublishClassAnnouncement(Guid RequestId, string? Title, string? Body);
public sealed record ClassAnnouncementView(Guid Id, string Title, string Body, DateTimeOffset PublishedAt);
public sealed record StudentClassAnnouncement(string ClassTitle, string Title, string Body, DateTimeOffset PublishedAt);

public sealed class ClassAnnouncementRow
{
    public Guid Id { get; set; }
    public Guid? IndividualClassId { get; set; }
    public Guid? GroupClassId { get; set; }
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public DateTimeOffset PublishedAt { get; set; }
    public DateTimeOffset? WithdrawnAt { get; set; }
}

public sealed class ClassAnnouncementService(PlatformDbContext db, TimeProvider clock)
{
    private IQueryable<ClassAnnouncementRow> Rows(Guid workspace) =>
        db.Database.SqlQuery<ClassAnnouncementRow>($"""
            SELECT "Id","IndividualClassId","GroupClassId","Title","Body","PublishedAt","WithdrawnAt"
            FROM platform."ClassAnnouncements" WHERE "WorkspaceId"={workspace}
            """);

    private IQueryable<ClassAnnouncementRow> InClass(Guid workspace, string kind, Guid id) =>
        Rows(workspace).Where(x => kind == "individual" ? x.IndividualClassId == id : x.GroupClassId == id);

    private Task<bool> Active(Guid workspace, string kind, Guid id, CancellationToken ct) => kind switch
    {
        "individual" => db.TeacherClasses.AnyAsync(c => c.WorkspaceId == workspace && c.Id == id && !c.IsArchived, ct),
        "group" => db.TeacherGroupClasses.AnyAsync(c => c.WorkspaceId == workspace && c.Id == id && !c.IsArchived, ct),
        _ => Task.FromResult(false)
    };

    public async Task<List<ClassAnnouncementView>?> TeacherList(Guid workspace, string kind, Guid id, CancellationToken ct)
    {
        if (!await Active(workspace, kind, id, ct)) return null;
        return await InClass(workspace, kind, id).Where(a => a.WithdrawnAt == null)
            .OrderByDescending(a => a.PublishedAt).ThenByDescending(a => a.Id).Take(50)
            .Select(a => new ClassAnnouncementView(a.Id, a.Title, a.Body, a.PublishedAt)).ToListAsync(ct);
    }

    public async Task<(int Status, object? Value)> Publish(Guid workspace, string kind, Guid id,
        PublishClassAnnouncement request, CancellationToken ct)
    {
        var title = request.Title?.Trim() ?? "";
        var body = request.Body?.Trim() ?? "";
        if (request.RequestId == Guid.Empty || title.Length is < 1 or > 120 || body.Length is < 1 or > 4000 ||
            title.Contains('\0') || body.Contains('\0')) return (400, "Укажите заголовок и текст объявления.");
        if (!await Active(workspace, kind, id, ct)) return (404, null);
        Guid? individual = kind == "individual" ? id : null;
        Guid? group = kind == "group" ? id : null;
        var now = clock.GetUtcNow();
        var affected = await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO platform."ClassAnnouncements"
                ("WorkspaceId","Id","IndividualClassId","GroupClassId","Title","Body","PublishedAt")
            VALUES ({workspace},{request.RequestId},{individual},{group},{title},{body},{now})
            ON CONFLICT ("WorkspaceId","Id") DO NOTHING
            """, ct);
        var saved = await InClass(workspace, kind, id).Where(a => a.Id == request.RequestId).SingleOrDefaultAsync(ct);
        if (saved == null || saved.WithdrawnAt != null || saved.Title != title || saved.Body != body)
            return (409, "Запрос уже использован. Обновите объявления.");
        return (affected == 1 ? 201 : 200, new ClassAnnouncementView(saved.Id, saved.Title, saved.Body, saved.PublishedAt));
    }

    public async Task<bool> Withdraw(Guid workspace, string kind, Guid id, Guid announcement, CancellationToken ct)
    {
        if (!await Active(workspace, kind, id, ct)) return false;
        var isIndividual = kind == "individual";
        var now = clock.GetUtcNow();
        return await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE platform."ClassAnnouncements" SET "WithdrawnAt" = COALESCE("WithdrawnAt", {now})
            WHERE "WorkspaceId"={workspace} AND "Id"={announcement}
                AND (CASE WHEN {isIndividual} THEN "IndividualClassId" ELSE "GroupClassId" END)={id}
            """, ct) == 1;
    }

    public async Task<List<StudentClassAnnouncement>?> StudentList(ClaimsPrincipal principal, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("workspace_id"), out var workspace) ||
            !Guid.TryParse(principal.FindFirstValue("membership_id"), out var member) ||
            !Guid.TryParse(principal.FindFirstValue("sub"), out var student) ||
            !await db.WorkspaceStudentMemberships.AnyAsync(m => m.WorkspaceId == workspace && m.Id == member &&
                m.StudentId == student && m.IsActive && m.Student.IsActive && m.Program.IsActive, ct)) return null;
        var individual = db.TeacherClasses.Where(c => c.WorkspaceId == workspace && !c.IsArchived && c.StudentMembershipId == member);
        var groups = db.TeacherGroupClasses.Where(c => c.WorkspaceId == workspace && !c.IsArchived &&
            c.Members.Any(m => m.MembershipId == member && m.IsApproved));
        return await Rows(workspace).Where(a => a.WithdrawnAt == null &&
                (individual.Any(c => c.Id == a.IndividualClassId) || groups.Any(c => c.Id == a.GroupClassId)))
            .OrderByDescending(a => a.PublishedAt).ThenByDescending(a => a.Id).Take(50)
            .Select(a => new StudentClassAnnouncement(
                a.IndividualClassId != null ? individual.Where(c => c.Id == a.IndividualClassId).Select(c => c.Title).First() :
                    groups.Where(c => c.Id == a.GroupClassId).Select(c => c.Title).First(),
                a.Title, a.Body, a.PublishedAt)).ToListAsync(ct);
    }
}
