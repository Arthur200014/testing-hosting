using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.StudentSessions;

public sealed class StudentSessionService(PlatformDbContext dbContext, IStudentCodeHasher codeHasher)
{
    public async Task<StudentSessionIdentity?> ExchangeAsync(
        string? workspace,
        string? code,
        CancellationToken cancellationToken)
    {
        var workspaceValid = codeHasher.TryNormalizeWorkspace(workspace, out var normalizedWorkspace);
        var codeValid = codeHasher.TryNormalizeCode(code, out var normalizedCode);

        // Invalid input follows the same database lookup and response path as unknown credentials.
        var lookupWorkspace = workspaceValid ? normalizedWorkspace : "invalid-workspace";
        var lookupCode = codeValid ? normalizedCode : "INVALID-CODE";
        var hash = codeHasher.Hash(lookupWorkspace, lookupCode);

        var identity = await dbContext.WorkspaceStudentMemberships
            .AsNoTracking()
            .Where(membership =>
                membership.Workspace.Slug == lookupWorkspace &&
                membership.CodeHash == hash &&
                membership.IsActive &&
                membership.Workspace.IsActive &&
                membership.Program.IsActive &&
                membership.Student.IsActive)
            .Select(membership => new StudentSessionIdentity(
                membership.Id,
                membership.StudentId,
                membership.Student.DisplayName,
                membership.Program.Code,
                membership.WorkspaceId))
            .SingleOrDefaultAsync(cancellationToken);

        return workspaceValid && codeValid ? identity : null;
    }
}
