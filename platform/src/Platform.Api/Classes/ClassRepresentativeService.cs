using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

public sealed record IssueRepresentativeRequest(Guid RequestId, Guid MembershipId, string? Name, string? Code);
public sealed record AcceptRepresentativeRequest(string? Code, string? SessionKey);
public sealed record RepresentativeInvitation(Guid Id, Guid MembershipId, string Name, string Status, DateTimeOffset ExpiresAt);
public sealed record RepresentativeLesson(string? Title, DateTimeOffset LessonAt, string Attendance);
public sealed record RepresentativeCabinet(string Name, string ClassTitle, string StudentName, List<RepresentativeLesson> Lessons);

public sealed class ClassRepresentativeRow
{
    public Guid WorkspaceId { get; set; }
    public Guid Id { get; set; }
    public Guid MembershipId { get; set; }
    public Guid? IndividualClassId { get; set; }
    public Guid? GroupClassId { get; set; }
    public string Name { get; set; } = "";
    public string CodeHash { get; set; } = "";
    public DateTimeOffset IssuedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? AcceptedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public string? SessionHash { get; set; }
    public DateTimeOffset? SessionExpiresAt { get; set; }
}

public sealed class ClassRepresentativeService(PlatformDbContext db, TimeProvider clock)
{
    private static string? Hash(string? value) =>
        value is {Length:64} && value.All(Uri.IsHexDigit)
            ? Convert.ToHexString(SHA256.HashData(Convert.FromHexString(value))) : null;

    private IQueryable<ClassRepresentativeRow> Rows => db.Database.SqlQueryRaw<ClassRepresentativeRow>("""
        SELECT "WorkspaceId","Id","MembershipId","IndividualClassId","GroupClassId","Name",
            "CodeHash","IssuedAt","ExpiresAt","AcceptedAt","RevokedAt","SessionHash","SessionExpiresAt"
        FROM platform."ClassRepresentativeInvitations"
        """);

    private IQueryable<ClassRepresentativeRow> InClass(Guid workspace, string kind, Guid id) =>
        Rows.Where(x => x.WorkspaceId == workspace && (kind == "individual" ? x.IndividualClassId == id : x.GroupClassId == id));

    private Task<bool> ClassExists(Guid workspace, string kind, Guid id, CancellationToken ct) => kind switch
    {
        "individual" => db.TeacherClasses.AnyAsync(x => x.WorkspaceId == workspace && x.Id == id && !x.IsArchived, ct),
        "group" => db.TeacherGroupClasses.AnyAsync(x => x.WorkspaceId == workspace && x.Id == id && !x.IsArchived, ct),
        _ => Task.FromResult(false)
    };

    private async Task<(string ClassTitle, string StudentName, Guid StudentId)?> Subject(Guid workspace, Guid? individual,
        Guid? group, Guid member, CancellationToken ct)
    {
        var pupil = await db.WorkspaceStudentMemberships.Where(m => m.WorkspaceId == workspace && m.Id == member &&
                m.IsActive && m.Student.IsActive && m.Program.IsActive)
            .Select(m => new {m.StudentId, m.Student.DisplayName}).SingleOrDefaultAsync(ct);
        if (pupil == null) return null;
        var title = individual != null
            ? await db.TeacherClasses.Where(c => c.WorkspaceId == workspace && c.Id == individual &&
                !c.IsArchived && c.StudentMembershipId == member).Select(c => c.Title).SingleOrDefaultAsync(ct)
            : await db.TeacherGroupClasses.Where(c => c.WorkspaceId == workspace && c.Id == group &&
                !c.IsArchived && c.Members.Any(m => m.MembershipId == member && m.IsApproved)).Select(c => c.Title).SingleOrDefaultAsync(ct);
        return title == null ? null : (title, pupil.DisplayName, pupil.StudentId);
    }

    private static RepresentativeInvitation Describe(ClassRepresentativeRow row, DateTimeOffset now)
    {
        var status = row.RevokedAt != null ? "revoked" :
            row.SessionExpiresAt > now ? "active" :
            row.AcceptedAt == null && row.ExpiresAt > now ? "pending" : "expired";
        return new(row.Id, row.MembershipId, row.Name, status,
            row.SessionExpiresAt ?? row.ExpiresAt);
    }

    public async Task<List<RepresentativeInvitation>?> List(Guid workspace, string kind, Guid id, CancellationToken ct)
    {
        if (!await ClassExists(workspace, kind, id, ct)) return null;
        var rows = await InClass(workspace, kind, id).OrderBy(x => x.RevokedAt != null)
            .ThenByDescending(x => x.IssuedAt).Take(50).ToListAsync(ct);
        var now = clock.GetUtcNow();
        return rows.Select(row => Describe(row, now)).ToList();
    }

    public async Task<(int Status, object? Value)> Issue(Guid workspace, string kind, Guid id,
        IssueRepresentativeRequest request, CancellationToken ct)
    {
        var name = request.Name?.Trim() ?? "";
        var codeHash = Hash(request.Code);
        if (request.RequestId == Guid.Empty || name.Length is < 1 or > 100 || name.Contains('\0') || codeHash == null)
            return (400,"Укажите имя представителя и ученика.");
        if (!await ClassExists(workspace, kind, id, ct)) return (404, null);
        Guid? individual = kind == "individual" ? id : null;
        Guid? group = kind == "group" ? id : null;
        if (await Subject(workspace, individual, group, request.MembershipId, ct) is not {} subject) return (404, null);
        var now = clock.GetUtcNow();
        var expires = now.AddDays(7);
        var affected = await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO platform."ClassRepresentativeInvitations"
                ("WorkspaceId","Id","MembershipId","StudentId","IndividualClassId","GroupClassId","Name","CodeHash","IssuedAt","ExpiresAt")
            VALUES ({workspace},{request.RequestId},{request.MembershipId},{subject.StudentId},{individual},{group},{name},{codeHash},{now},{expires})
            ON CONFLICT DO NOTHING
            """, ct);
        var row = await InClass(workspace, kind, id).Where(x => x.Id == request.RequestId).SingleOrDefaultAsync(ct);
        if (row == null || row.MembershipId != request.MembershipId || row.Name != name || row.CodeHash != codeHash ||
            row.RevokedAt != null) return (409,"Запрос уже использован.");
        return (affected == 1 ? 201 : 200, Describe(row, now));
    }

    public async Task<bool> Revoke(Guid workspace, string kind, Guid id, Guid invitation, CancellationToken ct)
    {
        if (!await ClassExists(workspace, kind, id, ct)) return false;
        var now = clock.GetUtcNow();
        var individual = kind == "individual";
        return await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE platform."ClassRepresentativeInvitations"
                SET "RevokedAt"=COALESCE("RevokedAt",{now}), "SessionHash"=NULL, "SessionExpiresAt"=NULL
            WHERE "WorkspaceId"={workspace} AND "Id"={invitation}
                AND (CASE WHEN {individual} THEN "IndividualClassId" ELSE "GroupClassId" END)={id}
            """, ct) == 1;
    }

    public async Task<bool> Accept(AcceptRepresentativeRequest request, CancellationToken ct)
    {
        var codeHash = Hash(request.Code);
        var sessionHash = Hash(request.SessionKey);
        if (codeHash == null || sessionHash == null || codeHash == sessionHash) return false;
        var now = clock.GetUtcNow();
        var row = await Rows.Where(x => x.CodeHash == codeHash && x.RevokedAt == null).SingleOrDefaultAsync(ct);
        if (row == null || await Subject(row.WorkspaceId, row.IndividualClassId, row.GroupClassId, row.MembershipId, ct) == null)
            return false;
        if (row.AcceptedAt != null) return row.SessionHash == sessionHash && row.SessionExpiresAt > now;
        var expires = now.AddDays(30);
        var accepted = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE platform."ClassRepresentativeInvitations"
                SET "AcceptedAt"={now}, "SessionHash"={sessionHash}, "SessionExpiresAt"={expires}
            WHERE "WorkspaceId"={row.WorkspaceId} AND "Id"={row.Id} AND "AcceptedAt" IS NULL
                AND "RevokedAt" IS NULL AND "ExpiresAt">{now}
            """, ct);
        return accepted == 1 || await Rows.AnyAsync(x => x.Id == row.Id && x.WorkspaceId == row.WorkspaceId &&
            x.SessionHash == sessionHash && x.RevokedAt == null && x.SessionExpiresAt > now, ct);
    }

    public async Task<RepresentativeCabinet?> Read(string? key, CancellationToken ct)
    {
        var hash = Hash(key);
        if (hash == null) return null;
        var now = clock.GetUtcNow();
        var row = await Rows.Where(x => x.SessionHash == hash && x.RevokedAt == null && x.SessionExpiresAt > now)
            .SingleOrDefaultAsync(ct);
        if (row == null || await Subject(row.WorkspaceId, row.IndividualClassId, row.GroupClassId, row.MembershipId, ct) is not {} subject)
            return null;
        var lessons = await (from lesson in db.Lessons
            where lesson.WorkspaceId == row.WorkspaceId && (row.IndividualClassId != null
                ? lesson.IndividualClassId == row.IndividualClassId : lesson.GroupClassId == row.GroupClassId)
            from participant in lesson.Participants
            where participant.MembershipId == row.MembershipId
            orderby lesson.LessonAt descending, lesson.Id descending
            select new RepresentativeLesson(lesson.Title, lesson.LessonAt, participant.AttendanceStatus))
            .Take(8).ToListAsync(ct);
        return new(row.Name, subject.ClassTitle, subject.StudentName, lessons);
    }

    public async Task Logout(string? key, CancellationToken ct)
    {
        var hash = Hash(key);
        if (hash == null) return;
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE platform."ClassRepresentativeInvitations" SET "SessionHash"=NULL, "SessionExpiresAt"=NULL
            WHERE "SessionHash"={hash}
            """, ct);
    }
}
