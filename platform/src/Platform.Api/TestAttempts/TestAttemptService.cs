using System.Globalization;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.TestAttempts;

public sealed class TestAttemptService(PlatformDbContext dbContext, TimeProvider timeProvider)
{
    private const int MaxEventIdLength = 128;
    private const int MaxTestIdLength = 128;
    private const int MaxTopicLength = 200;
    private const int MaxSchemaVersionLength = 64;
    private const int MaxTaskNumber = 1_000;
    private const int MaxTotal = 10_000;
    private const int MaxDurationSeconds = 86_400;
    private const string EventIdUniqueIndex = "IX_TestAttempts_WorkspaceId_EventId";
    private static readonly TimeSpan FutureTolerance = TimeSpan.FromMinutes(5);
    private static readonly TimeZoneInfo MoscowTimeZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Moscow");

    public async Task<TestAttemptWriteResult> SubmitAsync(
        ClaimsPrincipal principal,
        TestAttemptRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryReadIdentity(principal, out var claims))
        {
            return new(TestAttemptWriteStatus.InvalidIdentity);
        }

        var identity = await dbContext.WorkspaceStudentMemberships
            .AsNoTracking()
            .Where(membership =>
                membership.Id == claims.MembershipId &&
                membership.WorkspaceId == claims.WorkspaceId &&
                membership.StudentId == claims.StudentId &&
                membership.IsActive &&
                membership.Workspace.IsActive &&
                membership.Student.IsActive &&
                membership.Program.IsActive)
            .Select(membership => new CurrentStudentIdentity(
                membership.WorkspaceId,
                membership.Id,
                membership.StudentId,
                membership.ProgramId))
            .SingleOrDefaultAsync(cancellationToken);

        if (identity is null)
        {
            return new(TestAttemptWriteStatus.InvalidIdentity);
        }

        var validation = ValidateAndCanonicalize(request, timeProvider.GetUtcNow());
        if (validation.Errors.Count > 0)
        {
            return new(TestAttemptWriteStatus.InvalidRequest, Errors: validation.Errors);
        }

        var canonical = validation.Attempt!;
        var existing = await FindByEventIdAsync(identity.WorkspaceId, canonical.EventId, cancellationToken);
        if (existing is not null)
        {
            return await BuildReplayResultAsync(existing, identity, canonical, cancellationToken);
        }

        var attempt = new TestAttempt
        {
            Id = Guid.NewGuid(),
            WorkspaceId = identity.WorkspaceId,
            MembershipId = identity.MembershipId,
            StudentId = identity.StudentId,
            ProgramId = identity.ProgramId,
            EventId = canonical.EventId,
            TestId = canonical.TestId,
            Topic = canonical.Topic,
            TaskNumber = canonical.TaskNumber,
            Correct = canonical.Correct,
            Total = canonical.Total,
            Percent = canonical.Percent,
            StartedAt = canonical.StartedAt,
            CompletedAt = canonical.CompletedAt,
            DurationSeconds = canonical.DurationSeconds,
            SchemaVersion = canonical.SchemaVersion,
            MoscowMonthKey = canonical.MoscowMonthKey,
            CreatedAt = TruncateToMicroseconds(timeProvider.GetUtcNow())
        };

        dbContext.TestAttempts.Add(attempt);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsEventIdUniqueViolation(exception))
        {
            dbContext.ChangeTracker.Clear();
            var winner = await FindByEventIdAsync(identity.WorkspaceId, canonical.EventId, cancellationToken);
            if (winner is null)
            {
                throw;
            }

            return await BuildReplayResultAsync(winner, identity, canonical, cancellationToken);
        }

        var response = await BuildResponseAsync(attempt, duplicate: false, cancellationToken);
        return new(TestAttemptWriteStatus.Created, response);
    }

    private async Task<TestAttemptWriteResult> BuildReplayResultAsync(
        TestAttempt existing,
        CurrentStudentIdentity identity,
        CanonicalAttempt canonical,
        CancellationToken cancellationToken)
    {
        if (!IsEquivalent(existing, identity, canonical))
        {
            return new(TestAttemptWriteStatus.Conflict);
        }

        var response = await BuildResponseAsync(existing, duplicate: true, cancellationToken);
        return new(TestAttemptWriteStatus.Duplicate, response);
    }

    private async Task<TestAttemptResponse> BuildResponseAsync(
        TestAttempt attempt,
        bool duplicate,
        CancellationToken cancellationToken)
    {
        var monthlyBest = await dbContext.TestAttempts
            .AsNoTracking()
            .Where(candidate =>
                candidate.WorkspaceId == attempt.WorkspaceId &&
                candidate.MembershipId == attempt.MembershipId &&
                candidate.TestId == attempt.TestId &&
                candidate.MoscowMonthKey == attempt.MoscowMonthKey)
            .OrderByDescending(candidate => candidate.Percent)
            .ThenBy(candidate => candidate.DurationSeconds)
            .ThenBy(candidate => candidate.CompletedAt)
            .ThenBy(candidate => candidate.Id)
            .Select(candidate => new MonthlyBestResponse(
                candidate.Id,
                candidate.Percent,
                candidate.DurationSeconds,
                candidate.CompletedAt))
            .FirstAsync(cancellationToken);

        return new TestAttemptResponse(
            attempt.Id,
            attempt.EventId,
            duplicate,
            attempt.CreatedAt,
            monthlyBest);
    }

    private Task<TestAttempt?> FindByEventIdAsync(
        Guid workspaceId,
        string eventId,
        CancellationToken cancellationToken) =>
        dbContext.TestAttempts
            .AsNoTracking()
            .SingleOrDefaultAsync(
                attempt => attempt.WorkspaceId == workspaceId && attempt.EventId == eventId,
                cancellationToken);

    private static ValidationResult ValidateAndCanonicalize(TestAttemptRequest request, DateTimeOffset now)
    {
        var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var eventId = ValidateString(request.EventId, "eventId", MaxEventIdLength, errors);
        var testId = ValidateString(request.TestId, "testId", MaxTestIdLength, errors);
        var topic = ValidateString(request.Topic, "topic", MaxTopicLength, errors);
        var schemaVersion = ValidateString(request.SchemaVersion, "schemaVersion", MaxSchemaVersionLength, errors);

        ValidateRange(request.TaskNumber, "taskNumber", 1, MaxTaskNumber, errors);
        ValidateRange(request.Correct, "correct", 0, MaxTotal, errors);
        ValidateRange(request.Total, "total", 1, MaxTotal, errors);
        ValidateRange(request.Percent, "percent", 0, 100, errors);
        ValidateRange(request.DurationSeconds, "durationSeconds", 0, MaxDurationSeconds, errors);

        if (request.Correct is not null && request.Total is not null &&
            request.Correct >= 0 && request.Total > 0)
        {
            if (request.Correct > request.Total)
            {
                errors["correct"] = ["Correct cannot exceed total."];
            }
            else if (request.Percent is not null && request.Percent != request.Correct * 100 / request.Total)
            {
                errors["percent"] = ["Percent does not match correct and total."];
            }
        }

        var startedAt = request.StartedAt is null ? default : TruncateToMicroseconds(request.StartedAt.Value);
        var completedAt = request.CompletedAt is null ? default : TruncateToMicroseconds(request.CompletedAt.Value);

        if (request.StartedAt is null)
        {
            errors["startedAt"] = ["StartedAt is required."];
        }

        if (request.CompletedAt is null)
        {
            errors["completedAt"] = ["CompletedAt is required."];
        }

        if (request.StartedAt is not null && request.CompletedAt is not null)
        {
            if (completedAt < startedAt)
            {
                errors["completedAt"] = ["CompletedAt cannot be earlier than startedAt."];
            }
            else
            {
                var elapsed = completedAt - startedAt;
                if (elapsed > TimeSpan.FromSeconds(MaxDurationSeconds))
                {
                    errors["durationSeconds"] = ["Duration cannot exceed 86400 seconds."];
                }
                else if (request.DurationSeconds is not null &&
                    request.DurationSeconds != (int)Math.Round(elapsed.TotalSeconds, MidpointRounding.AwayFromZero))
                {
                    errors["durationSeconds"] = ["Duration does not match the attempt timestamps."];
                }
            }

            if (completedAt > now.ToUniversalTime() + FutureTolerance)
            {
                errors["completedAt"] = ["CompletedAt is too far in the future."];
            }
        }

        if (errors.Count > 0)
        {
            return new(null, errors);
        }

        var moscowCompletion = TimeZoneInfo.ConvertTime(completedAt, MoscowTimeZone);
        var canonical = new CanonicalAttempt(
            eventId!,
            testId!,
            topic!,
            request.TaskNumber!.Value,
            request.Correct!.Value,
            request.Total!.Value,
            request.Percent!.Value,
            startedAt,
            completedAt,
            request.DurationSeconds!.Value,
            schemaVersion!,
            moscowCompletion.ToString("yyyy-MM", CultureInfo.InvariantCulture));
        return new(canonical, errors);
    }

    private static string? ValidateString(
        string? value,
        string field,
        int maxLength,
        IDictionary<string, string[]> errors)
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

    private static void ValidateRange(
        int? value,
        string field,
        int minimum,
        int maximum,
        IDictionary<string, string[]> errors)
    {
        if (value is null)
        {
            errors[field] = [$"{field} is required."];
        }
        else if (value < minimum || value > maximum)
        {
            errors[field] = [$"{field} must be between {minimum} and {maximum}."];
        }
    }

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

        identity = new SessionClaims(workspaceId, membershipId, studentId);
        return true;
    }

    private static bool IsEquivalent(
        TestAttempt attempt,
        CurrentStudentIdentity identity,
        CanonicalAttempt canonical) =>
        attempt.WorkspaceId == identity.WorkspaceId &&
        attempt.MembershipId == identity.MembershipId &&
        attempt.StudentId == identity.StudentId &&
        attempt.ProgramId == identity.ProgramId &&
        attempt.EventId == canonical.EventId &&
        attempt.TestId == canonical.TestId &&
        attempt.Topic == canonical.Topic &&
        attempt.TaskNumber == canonical.TaskNumber &&
        attempt.Correct == canonical.Correct &&
        attempt.Total == canonical.Total &&
        attempt.Percent == canonical.Percent &&
        attempt.StartedAt == canonical.StartedAt &&
        attempt.CompletedAt == canonical.CompletedAt &&
        attempt.DurationSeconds == canonical.DurationSeconds &&
        attempt.SchemaVersion == canonical.SchemaVersion &&
        attempt.MoscowMonthKey == canonical.MoscowMonthKey;

    private static bool IsEventIdUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: EventIdUniqueIndex
        };

    private static DateTimeOffset TruncateToMicroseconds(DateTimeOffset value)
    {
        var utcTicks = value.UtcTicks;
        return new DateTimeOffset(utcTicks - utcTicks % 10, TimeSpan.Zero);
    }

    private readonly record struct SessionClaims(Guid WorkspaceId, Guid MembershipId, Guid StudentId);

    private sealed record CurrentStudentIdentity(Guid WorkspaceId, Guid MembershipId, Guid StudentId, Guid ProgramId);

    private sealed record CanonicalAttempt(
        string EventId,
        string TestId,
        string Topic,
        int TaskNumber,
        int Correct,
        int Total,
        int Percent,
        DateTimeOffset StartedAt,
        DateTimeOffset CompletedAt,
        int DurationSeconds,
        string SchemaVersion,
        string MoscowMonthKey);

    private sealed record ValidationResult(
        CanonicalAttempt? Attempt,
        IReadOnlyDictionary<string, string[]> Errors);
}
