using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Students;

public sealed record TeacherArchiveStudentResponse(Guid MembershipId, bool IsActive);
public enum TeacherArchiveStudentStatus { Archived, Duplicate, NotFound }
public sealed record TeacherArchiveStudentResult(
    TeacherArchiveStudentStatus Status, TeacherArchiveStudentResponse? Response = null);

public sealed class TeacherStudentArchiver(PlatformDbContext db)
{
    public async Task<TeacherArchiveStudentResult> ArchiveAsync(
        Guid workspaceId, Guid membershipId, CancellationToken cancellationToken)
    {
        var updated = await db.WorkspaceStudentMemberships
            .Where(x => x.WorkspaceId == workspaceId && x.Id == membershipId && x.IsActive)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.IsActive, false), cancellationToken);
        if (updated == 1)
            return new(TeacherArchiveStudentStatus.Archived, new(membershipId, false));

        var exists = await db.WorkspaceStudentMemberships.AsNoTracking()
            .AnyAsync(x => x.WorkspaceId == workspaceId && x.Id == membershipId, cancellationToken);
        return exists
            ? new(TeacherArchiveStudentStatus.Duplicate, new(membershipId, false))
            : new(TeacherArchiveStudentStatus.NotFound);
    }
}
