using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Students;

public sealed record TeacherStudentView(
    Guid MembershipId, Guid StudentId, string StudentName,
    Guid ProgramId, string ProgramCode, string ProgramName,
    string? ImportExternalId);

public sealed class TeacherStudentDirectory(PlatformDbContext db)
{
    private IQueryable<WorkspaceStudentMembership> InWorkspace(Guid workspaceId) =>
        db.WorkspaceStudentMemberships.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && x.IsActive && x.Student.IsActive && x.Program.IsActive);

    private static IQueryable<TeacherStudentView> Project(IQueryable<WorkspaceStudentMembership> memberships) =>
        memberships.Select(x => new TeacherStudentView(
            x.Id, x.StudentId, x.Student.DisplayName,
            x.ProgramId, x.Program.Code, x.Program.DisplayName,
            x.ImportExternalId));

    public Task<List<TeacherStudentView>> ListAsync(Guid workspaceId, CancellationToken cancellationToken) =>
        Project(InWorkspace(workspaceId).OrderBy(x => x.Student.DisplayName).ThenBy(x => x.Id))
            .ToListAsync(cancellationToken);

    public Task<TeacherStudentView?> GetAsync(
        Guid workspaceId, Guid membershipId, CancellationToken cancellationToken) =>
        Project(InWorkspace(workspaceId).Where(x => x.Id == membershipId))
            .SingleOrDefaultAsync(cancellationToken);
}
