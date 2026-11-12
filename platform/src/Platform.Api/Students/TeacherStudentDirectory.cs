using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Students;

public sealed record TeacherStudentView(
    Guid MembershipId, Guid StudentId, string StudentName,
    Guid ProgramId, string ProgramCode, string ProgramName,
    string? ImportExternalId);

public sealed class TeacherStudentDirectory(PlatformDbContext db)
{
    private IQueryable<TeacherStudentView> InWorkspace(Guid workspaceId) =>
        db.WorkspaceStudentMemberships.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && x.IsActive && x.Student.IsActive && x.Program.IsActive)
            .Select(x => new TeacherStudentView(
                x.Id, x.StudentId, x.Student.DisplayName,
                x.ProgramId, x.Program.Code, x.Program.DisplayName,
                x.ImportExternalId));

    public Task<List<TeacherStudentView>> ListAsync(Guid workspaceId, CancellationToken cancellationToken) =>
        InWorkspace(workspaceId)
            .OrderBy(x => x.StudentName).ThenBy(x => x.MembershipId)
            .ToListAsync(cancellationToken);

    public Task<TeacherStudentView?> GetAsync(
        Guid workspaceId, Guid membershipId, CancellationToken cancellationToken) =>
        InWorkspace(workspaceId)
            .SingleOrDefaultAsync(x => x.MembershipId == membershipId, cancellationToken);
}
