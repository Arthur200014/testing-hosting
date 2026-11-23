using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Classes;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Boards;

internal static class ClassBoardAccess
{
    internal sealed record Row(Guid Id, string Kind, string Title);

    private static (IQueryable<TeacherClass> Individual, IQueryable<TeacherGroupClass> Groups) Visible(
        ClaimsPrincipal principal, string role, PlatformDbContext db)
    {
        Guid.TryParse(principal.FindFirstValue("workspace_id"), out var workspace);
        Guid.TryParse(principal.FindFirstValue("membership_id"), out var membership);
        Guid.TryParse(principal.FindFirstValue("sub"), out var studentId);
        var student = role == "student";
        var workspaces = db.Workspaces.Where(x => x.Id == workspace && x.IsActive &&
            (!student || db.WorkspaceStudentMemberships.Any(m => m.Id == membership && m.WorkspaceId == x.Id &&
                m.StudentId == studentId && m.IsActive && m.Student.IsActive && m.Program.IsActive)));
        var individual = db.TeacherClasses.AsNoTracking().Where(x => x.WorkspaceId == workspace && !x.IsArchived &&
            workspaces.Any(w => w.Id == x.WorkspaceId) && (!student || x.StudentMembershipId == membership));
        var groups = db.TeacherGroupClasses.AsNoTracking().Where(x => x.WorkspaceId == workspace && !x.IsArchived &&
            workspaces.Any(w => w.Id == x.WorkspaceId) && (!student || db.TeacherGroupEnrollments.Any(e =>
                e.WorkspaceId == workspace && e.GroupClassId == x.Id && e.MembershipId == membership && e.IsApproved)));
        return (individual, groups);
    }

    internal static Task<Row[]> ListAsync(ClaimsPrincipal principal, string role, PlatformDbContext db, CancellationToken ct)
    {
        var (individual, groups) = Visible(principal, role, db);
        return individual.Select(x => new { x.Id, Kind = "individual", x.Title })
            .Concat(groups.Select(x => new { x.Id, Kind = "group", x.Title }))
            .Select(x => new Row(x.Id, x.Kind, x.Title))
            .ToArrayAsync(ct);
    }

    internal static Task<bool> CanAccessAsync(ClaimsPrincipal principal, string role, string kind, Guid id,
        PlatformDbContext db, CancellationToken ct)
    {
        if (id == Guid.Empty) return Task.FromResult(false);
        var classes = Visible(principal, role, db);
        return kind switch
        {
            "individual" => classes.Individual.AnyAsync(x => x.Id == id, ct),
            "group" => classes.Groups.AnyAsync(x => x.Id == id, ct),
            _ => Task.FromResult(false)
        };
    }
}
