using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Boards;

internal static class ClassBoardAccess
{
    internal sealed record Row(Guid Id, string Kind, string Title);
    internal static async Task<Row[]> ListAsync(ClaimsPrincipal principal, string role, PlatformDbContext db, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("workspace_id"), out var workspace)) return [];
        Guid.TryParse(principal.FindFirstValue("membership_id"), out var membership);
        var student = role == "student";
        Guid.TryParse(principal.FindFirstValue("sub"), out var studentId);
        var active = await db.Workspaces.AnyAsync(x => x.Id == workspace && x.IsActive, ct);
        if (!active) return [];
        if (student && !await db.WorkspaceStudentMemberships.AnyAsync(x => x.Id == membership && x.WorkspaceId == workspace &&
            x.StudentId == studentId && x.IsActive && x.Student.IsActive && x.Program.IsActive, ct)) return [];
        var individual = await db.TeacherClasses.AsNoTracking().Where(x => x.WorkspaceId == workspace && !x.IsArchived &&
            (!student || x.StudentMembershipId == membership)).Select(x => new Row(x.Id, "individual", x.Title)).ToArrayAsync(ct);
        var groups = await db.TeacherGroupClasses.AsNoTracking().Where(x => x.WorkspaceId == workspace && !x.IsArchived &&
            (!student || db.TeacherGroupEnrollments.Any(e => e.WorkspaceId == workspace && e.GroupClassId == x.Id &&
                e.MembershipId == membership && e.IsApproved))).Select(x => new Row(x.Id, "group", x.Title)).ToArrayAsync(ct);
        return individual.Concat(groups).ToArray();
    }
    internal static async Task<bool> CanAccessAsync(ClaimsPrincipal principal, string role, string kind, Guid id,
        PlatformDbContext db, CancellationToken ct)
    {
        if (id == Guid.Empty || kind is not ("individual" or "group")) return false;
        return (await ListAsync(principal, role, db, ct)).Any(x => x.Id == id && x.Kind == kind);
    }
}
