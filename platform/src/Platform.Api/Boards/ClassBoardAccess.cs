using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Boards;

internal static class ClassBoardAccess
{
    internal sealed record Row(Guid Id, string Kind, string Title);

    private static IQueryable<Row> Visible(ClaimsPrincipal principal, string role, PlatformDbContext db)
    {
        Guid.TryParse(principal.FindFirstValue("workspace_id"), out var workspace);
        Guid.TryParse(principal.FindFirstValue("membership_id"), out var membership);
        Guid.TryParse(principal.FindFirstValue("sub"), out var studentId);
        var student = role == "student";
        var workspaces = db.Workspaces.Where(x => x.Id == workspace && x.IsActive &&
            (!student || db.WorkspaceStudentMemberships.Any(m => m.Id == membership && m.WorkspaceId == x.Id &&
                m.StudentId == studentId && m.IsActive && m.Student.IsActive && m.Program.IsActive)));
        var individual = db.TeacherClasses.AsNoTracking().Where(x => x.WorkspaceId == workspace && !x.IsArchived &&
            workspaces.Any(w => w.Id == x.WorkspaceId) && (!student || x.StudentMembershipId == membership))
            .Select(x => new {x.Id, Kind = "individual", x.Title});
        var groups = db.TeacherGroupClasses.AsNoTracking().Where(x => x.WorkspaceId == workspace && !x.IsArchived &&
            workspaces.Any(w => w.Id == x.WorkspaceId) && (!student || db.TeacherGroupEnrollments.Any(e =>
                e.WorkspaceId == workspace && e.GroupClassId == x.Id && e.MembershipId == membership && e.IsApproved)))
            .Select(x => new {x.Id, Kind = "group", x.Title});
        return individual.Concat(groups).Select(x => new Row(x.Id, x.Kind, x.Title));
    }

    internal static Task<Row[]> ListAsync(ClaimsPrincipal principal, string role, PlatformDbContext db, CancellationToken ct)
        => Visible(principal, role, db).ToArrayAsync(ct);

    internal static Task<bool> CanAccessAsync(ClaimsPrincipal principal, string role, string kind, Guid id,
        PlatformDbContext db, CancellationToken ct)
        => id != Guid.Empty && kind is ("individual" or "group")
            ? Visible(principal, role, db).AnyAsync(x => x.Id == id && x.Kind == kind, ct)
            : Task.FromResult(false);
}
