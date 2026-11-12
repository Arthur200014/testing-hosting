using System.Data;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Homework;

public sealed record TeacherAssignHomeworkRequest(
    Guid RequestId, Guid CatalogItemId, DateTimeOffset? AssignedAt,
    int DeadlineHours, List<Guid>? MembershipIds);

public sealed record TeacherAssignHomeworkResponse(
    Guid RequestId, string HomeworkId, List<Guid> AssignmentIds);

public enum TeacherAssignHomeworkStatus { Created, Duplicate, Conflict, NotFound, InvalidRequest }

public sealed record TeacherAssignHomeworkResult(
    TeacherAssignHomeworkStatus Status, TeacherAssignHomeworkResponse? Response = null,
    Dictionary<string, string[]>? Errors = null);

public sealed class TeacherHomeworkAssignmentService(PlatformDbContext db)
{
    public async Task<TeacherAssignHomeworkResult> AssignAsync(
        Guid workspaceId, TeacherAssignHomeworkRequest request, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty)
            errors["requestId"] = ["A non-empty request ID is required."];
        if (request.CatalogItemId == Guid.Empty)
            errors["catalogItemId"] = ["A catalog item is required."];
        if (request.AssignedAt is null || request.AssignedAt == default)
            errors["assignedAt"] = ["AssignedAt is required."];
        if (request.DeadlineHours is not (24 or 48 or 72))
            errors["deadlineHours"] = ["DeadlineHours must be 24, 48 or 72."];
        if (request.MembershipIds is null or { Count: 0 or > 100 } ||
            request.MembershipIds?.Any(x => x == Guid.Empty) == true ||
            request.MembershipIds?.Distinct().Count() != request.MembershipIds?.Count)
            errors["membershipIds"] = ["Between 1 and 100 distinct student memberships are required."];
        if (errors.Count > 0) return new(TeacherAssignHomeworkStatus.InvalidRequest, Errors: errors);

        var assignedAt = Truncate(request.AssignedAt!.Value);
        var deadlineAt = assignedAt.AddHours(request.DeadlineHours);
        var prefix = "api:" + request.RequestId.ToString("N") + ":";

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        // Serialize every attempt with this workspace/request ID, including attempts with different student sets.
        var lockKey = workspaceId.ToString("N") + ":" + request.RequestId.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))", cancellationToken);

        var existing = await db.HomeworkAssignments.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && x.AssignmentRecordId.StartsWith(prefix))
            .OrderBy(x => x.Id).ToListAsync(cancellationToken);
        if (existing.Count > 0)
        {
            var same = existing.Count == request.MembershipIds!.Count &&
                existing.All(x => request.MembershipIds.Contains(x.MembershipId) &&
                    x.CatalogItemId == request.CatalogItemId &&
                    x.AssignedAt == assignedAt && x.DeadlineAt == deadlineAt &&
                    x.AssignmentRecordId == prefix + x.MembershipId.ToString("N"));
            return same
                ? new(TeacherAssignHomeworkStatus.Duplicate,
                    new(request.RequestId, existing[0].HomeworkId, existing.Select(x => x.Id).ToList()))
                : new(TeacherAssignHomeworkStatus.Conflict);
        }

        var catalog = await db.HomeworkCatalogItems.AsNoTracking()
            .SingleOrDefaultAsync(x => x.WorkspaceId == workspaceId &&
                x.Id == request.CatalogItemId && x.IsActive && x.Program.IsActive,
                cancellationToken);
        if (catalog is null) return new(TeacherAssignHomeworkStatus.NotFound);

        var homeworkLockKey = workspaceId.ToString("N") + ":" +
            catalog.ProgramId.ToString("N") + ":" + catalog.HomeworkId;
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({homeworkLockKey}, 0))", cancellationToken);

        var members = await db.WorkspaceStudentMemberships.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && request.MembershipIds!.Contains(x.Id) &&
                x.IsActive && x.Student.IsActive && x.Program.IsActive)
            .Select(x => new { x.Id, x.StudentId, x.ProgramId })
            .ToListAsync(cancellationToken);
        if (members.Count != request.MembershipIds!.Count)
            return new(TeacherAssignHomeworkStatus.NotFound);
        if (members.Any(x => x.ProgramId != catalog.ProgramId))
            return new(TeacherAssignHomeworkStatus.InvalidRequest, Errors: new()
            {
                ["membershipIds"] = ["The selected homework and students must share a program."]
            });

        var pending = await db.HomeworkAssignments.AsNoTracking().AnyAsync(x =>
            x.WorkspaceId == workspaceId && x.ProgramId == catalog.ProgramId &&
            x.HomeworkId == catalog.HomeworkId && request.MembershipIds!.Contains(x.MembershipId) &&
            x.SubmittedAt == null, cancellationToken);
        if (pending) return new(TeacherAssignHomeworkStatus.Conflict);

        var assignments = members.Select(x => new HomeworkAssignment
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId,
            MembershipId = x.Id, StudentId = x.StudentId, ProgramId = x.ProgramId,
            CatalogItemId = catalog.Id, AssignmentRecordId = prefix + x.Id.ToString("N"),
            HomeworkId = catalog.HomeworkId, TaskNumber = catalog.TaskNumber,
            Name = catalog.Name, Url = catalog.Url,
            AssignedAt = assignedAt, DeadlineAt = deadlineAt,
            Status = "assigned", SchemaVersion = "teacher-api-v1"
        }).ToList();
        db.HomeworkAssignments.AddRange(assignments);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new(TeacherAssignHomeworkStatus.Created,
            new(request.RequestId, catalog.HomeworkId, assignments.Select(x => x.Id).ToList()));
    }

    private static DateTimeOffset Truncate(DateTimeOffset date) =>
        new(date.ToUniversalTime().Ticks - date.ToUniversalTime().Ticks % 10, TimeSpan.Zero);
}
