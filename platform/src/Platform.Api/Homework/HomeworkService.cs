using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Homework;

public sealed class HomeworkService(PlatformDbContext dbContext, TimeProvider timeProvider)
{
    private const int MaxHomeworkIdLength = 128;
    private const int MaxEventIdLength = 128;
    private const int MaxSchemaVersionLength = 64;
    private const int MaxDurationSeconds = 86_400;
    private const string EventIdUniqueIndex = "IX_HomeworkSubmissions_WorkspaceId_EventId";
    private static readonly TimeSpan FutureTolerance = TimeSpan.FromMinutes(5);

    public async Task<IReadOnlyList<HomeworkAssignmentResponse>?> ListAssignmentsAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var identity = await ResolveIdentityAsync(principal, cancellationToken);
        if (identity is null) return null;

        return await dbContext.HomeworkAssignments
            .AsNoTracking()
            .Where(assignment =>
                assignment.WorkspaceId == identity.WorkspaceId &&
                assignment.MembershipId == identity.MembershipId &&
                assignment.StudentId == identity.StudentId &&
                assignment.ProgramId == identity.ProgramId)
            .OrderByDescending(assignment => assignment.AssignedAt)
            .ThenByDescending(assignment => assignment.Id)
            .Select(assignment => new HomeworkAssignmentResponse(
                assignment.Id,
                assignment.HomeworkId,
                assignment.TaskNumber,
                assignment.Name,
                assignment.Url,
                assignment.AssignedAt,
                assignment.DeadlineAt,
                assignment.SubmittedAt,
                assignment.Status,
                assignment.ScorePercent,
                assignment.SchemaVersion))
            .ToListAsync(cancellationToken);
    }

    public async Task<HomeworkSubmissionWriteResult> SubmitAsync(
        ClaimsPrincipal principal,
        HomeworkSubmissionRequest request,
        CancellationToken cancellationToken)
    {
        var identity = await ResolveIdentityAsync(principal, cancellationToken);
        if (identity is null) return new(HomeworkSubmissionWriteStatus.InvalidIdentity);

        var validation = Validate(request, timeProvider.GetUtcNow());
        if (validation.Errors.Count > 0)
            return new(HomeworkSubmissionWriteStatus.InvalidRequest, Errors: validation.Errors);

        var canonical = validation.Submission!;
        var existing = await dbContext.HomeworkSubmissions
            .AsNoTracking()
            .SingleOrDefaultAsync(
                item => item.WorkspaceId == identity.WorkspaceId && item.EventId == canonical.EventId,
                cancellationToken);
        if (existing is not null)
            return await BuildReplayAsync(existing, identity, canonical, cancellationToken);

        var assignment = await dbContext.HomeworkAssignments
            .SingleOrDefaultAsync(
                item => item.WorkspaceId == identity.WorkspaceId &&
                        item.MembershipId == identity.MembershipId &&
                        item.StudentId == identity.StudentId &&
                        item.ProgramId == identity.ProgramId &&
                        item.HomeworkId == canonical.HomeworkId &&
                        item.AssignedAt == dbContext.HomeworkAssignments
                            .Where(candidate => candidate.WorkspaceId == identity.WorkspaceId &&
                                                candidate.MembershipId == identity.MembershipId &&
                                                candidate.StudentId == identity.StudentId &&
                                                candidate.ProgramId == identity.ProgramId &&
                                                candidate.HomeworkId == canonical.HomeworkId)
                            .Max(candidate => candidate.AssignedAt),
                cancellationToken);
        if (assignment is null) return new(HomeworkSubmissionWriteStatus.AssignmentNotFound);

        var late = canonical.CompletedAt > assignment.DeadlineAt;
        var submission = new HomeworkSubmission
        {
            Id = Guid.NewGuid(),
            WorkspaceId = identity.WorkspaceId,
            AssignmentId = assignment.Id,
            MembershipId = identity.MembershipId,
            StudentId = identity.StudentId,
            ProgramId = identity.ProgramId,
            EventId = canonical.EventId,
            ScorePercent = canonical.ScorePercent,
            DurationSeconds = canonical.DurationSeconds,
            CompletedAt = canonical.CompletedAt,
            IsLate = late,
            SchemaVersion = canonical.SchemaVersion,
            CreatedAt = TruncateToMicroseconds(timeProvider.GetUtcNow())
        };

        assignment.SubmittedAt = canonical.CompletedAt;
        assignment.ScorePercent = canonical.ScorePercent;
        assignment.HomeworkEventId = canonical.EventId;
        assignment.Status = late ? "submitted_late" : "submitted";
        dbContext.HomeworkSubmissions.Add(submission);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsEventIdUniqueViolation(exception))
        {
            dbContext.ChangeTracker.Clear();
            var winner = await dbContext.HomeworkSubmissions.AsNoTracking()
                .SingleOrDefaultAsync(
                    item => item.WorkspaceId == identity.WorkspaceId && item.EventId == canonical.EventId,
                    cancellationToken);
            if (winner is null) throw;
            return await BuildReplayAsync(winner, identity, canonical, cancellationToken);
        }

        return new(HomeworkSubmissionWriteStatus.Created, BuildResponse(submission, assignment, false));
    }

    private async Task<HomeworkSubmissionWriteResult> BuildReplayAsync(
        HomeworkSubmission existing,
        CurrentStudentIdentity identity,
        CanonicalSubmission canonical,
        CancellationToken cancellationToken)
    {
        var assignment = await dbContext.HomeworkAssignments.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == existing.AssignmentId, cancellationToken);
        if (assignment is null ||
            existing.WorkspaceId != identity.WorkspaceId ||
            existing.MembershipId != identity.MembershipId ||
            existing.StudentId != identity.StudentId ||
            existing.ProgramId != identity.ProgramId ||
            assignment.HomeworkId != canonical.HomeworkId ||
            existing.EventId != canonical.EventId ||
            existing.ScorePercent != canonical.ScorePercent ||
            existing.DurationSeconds != canonical.DurationSeconds ||
            existing.CompletedAt != canonical.CompletedAt ||
            existing.SchemaVersion != canonical.SchemaVersion)
            return new(HomeworkSubmissionWriteStatus.Conflict);

        return new(HomeworkSubmissionWriteStatus.Duplicate, BuildResponse(existing, assignment, true));
    }

    private async Task<CurrentStudentIdentity?> ResolveIdentityAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        if (!TryReadIdentity(principal, out var claims)) return null;
        return await dbContext.WorkspaceStudentMemberships.AsNoTracking()
            .Where(membership =>
                membership.Id == claims.MembershipId &&
                membership.WorkspaceId == claims.WorkspaceId &&
                membership.StudentId == claims.StudentId &&
                membership.IsActive && membership.Workspace.IsActive &&
                membership.Student.IsActive && membership.Program.IsActive)
            .Select(membership => new CurrentStudentIdentity(
                membership.WorkspaceId, membership.Id, membership.StudentId, membership.ProgramId))
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static ValidationResult Validate(HomeworkSubmissionRequest request, DateTimeOffset now)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var homeworkId = RequiredString(request.AssignmentId, "assignmentId", MaxHomeworkIdLength, errors);
        var eventId = RequiredString(request.EventId, "eventId", MaxEventIdLength, errors);
        var schemaVersion = RequiredString(request.SchemaVersion, "schemaVersion", MaxSchemaVersionLength, errors);
        if (request.ScorePercent is null or < 0 or > 100)
            errors["scorePercent"] = ["ScorePercent must be between 0 and 100."];
        if (request.DurationSeconds is null or < 0 or > MaxDurationSeconds)
            errors["durationSeconds"] = ["DurationSeconds must be between 0 and 86400."];
        if (request.CompletedAt is null)
            errors["completedAt"] = ["CompletedAt is required."];

        var completedAt = request.CompletedAt is null ? default : TruncateToMicroseconds(request.CompletedAt.Value);
        if (request.CompletedAt is not null && completedAt > now.ToUniversalTime() + FutureTolerance)
            errors["completedAt"] = ["CompletedAt is too far in the future."];

        return errors.Count > 0
            ? new(null, errors)
            : new(new CanonicalSubmission(
                homeworkId!, eventId!, request.ScorePercent!.Value,
                request.DurationSeconds!.Value, completedAt, schemaVersion!), errors);
    }

    private static string? RequiredString(string? value, string field, int maxLength, IDictionary<string, string[]> errors)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            errors[field] = [$"{field} is required."];
            return null;
        }
        var canonical = value.Trim();
        if (canonical.Length > maxLength)
        {
            errors[field] = [$"{field} cannot exceed {maxLength} characters."];
            return null;
        }
        return canonical;
    }

    private static HomeworkSubmissionResponse BuildResponse(
        HomeworkSubmission submission,
        HomeworkAssignment assignment,
        bool duplicate) => new(
            submission.Id,
            assignment.Id,
            assignment.HomeworkId,
            submission.EventId,
            duplicate,
            submission.IsLate,
            submission.IsLate ? "submitted_late" : "submitted",
            submission.ScorePercent,
            submission.CompletedAt,
            submission.CreatedAt);

    private static bool TryReadIdentity(ClaimsPrincipal principal, out SessionClaims identity)
    {
        var studentClaim = principal.FindFirst("sub")?.Value;
        var workspaceClaim = principal.FindFirst("workspace_id")?.Value;
        var membershipClaim = principal.FindFirst("membership_id")?.Value;
        var hasStudentRole = principal.Claims.Any(claim =>
            (claim.Type == "role" || claim.Type == ClaimTypes.Role) && claim.Value == "student");
        if (!hasStudentRole ||
            !Guid.TryParse(studentClaim, out var studentId) || studentId == Guid.Empty ||
            !Guid.TryParse(workspaceClaim, out var workspaceId) || workspaceId == Guid.Empty ||
            !Guid.TryParse(membershipClaim, out var membershipId) || membershipId == Guid.Empty)
        {
            identity = default;
            return false;
        }
        identity = new(workspaceId, membershipId, studentId);
        return true;
    }

    private static bool IsEventIdUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: EventIdUniqueIndex };

    private static DateTimeOffset TruncateToMicroseconds(DateTimeOffset value)
    {
        var utcTicks = value.UtcTicks;
        return new DateTimeOffset(utcTicks - utcTicks % 10, TimeSpan.Zero);
    }

    private readonly record struct SessionClaims(Guid WorkspaceId, Guid MembershipId, Guid StudentId);
    private sealed record CurrentStudentIdentity(Guid WorkspaceId, Guid MembershipId, Guid StudentId, Guid ProgramId);
    private sealed record CanonicalSubmission(string HomeworkId, string EventId, int ScorePercent,
        int DurationSeconds, DateTimeOffset CompletedAt, string SchemaVersion);
    private sealed record ValidationResult(CanonicalSubmission? Submission,
        IReadOnlyDictionary<string, string[]> Errors);
}
