using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

// Bit 0 = Monday, bit 6 = Sunday. Minutes are local wall-clock values in TimeZoneId.
// A rule describes recurring availability, NOT a persisted Lesson or attendance event.
public sealed class TeacherScheduleRule
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid RequestId { get; set; }
    public Guid? IndividualClassId { get; set; }
    public Guid? GroupClassId { get; set; }
    public int DaysMask { get; set; }
    public int StartMinute { get; set; }
    public int DurationMinutes { get; set; }
    public required string TimeZoneId { get; set; }
    public bool IsActive { get; set; } = true;
    public int Revision { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed record TeacherScheduleRuleView(
    Guid Id, Guid ClassId, string ClassKind, int DaysMask, int StartMinute,
    int DurationMinutes, string TimeZoneId, bool IsActive, int Revision);

public sealed record TeacherScheduleRuleCreateRequest(
    Guid RequestId, Guid ClassId, string? ClassKind, int DaysMask, int StartMinute,
    int DurationMinutes, string? TimeZoneId, bool IsActive = true);

public sealed record TeacherScheduleRuleUpdateRequest(
    int ExpectedRevision, int DaysMask, int StartMinute,
    int DurationMinutes, string? TimeZoneId, bool IsActive);

public enum TeacherScheduleRuleStatus { Created, Updated, Unchanged, NotFound, Conflict, Invalid }
public sealed record TeacherScheduleRuleResult(
    TeacherScheduleRuleStatus Status, TeacherScheduleRuleView? Response = null,
    Dictionary<string, string[]>? Errors = null);

public sealed class TeacherScheduleRuleService(PlatformDbContext db, TimeProvider clock)
{
    private IQueryable<TeacherScheduleRule> Scoped(Guid workspaceId) =>
        db.TeacherScheduleRules.Where(x => x.WorkspaceId == workspaceId);

    private static TeacherScheduleRuleView View(TeacherScheduleRule item) => new(
        item.Id, item.IndividualClassId ?? item.GroupClassId!.Value,
        item.IndividualClassId.HasValue ? "individual" : "group",
        item.DaysMask, item.StartMinute, item.DurationMinutes,
        item.TimeZoneId, item.IsActive, item.Revision);

    public Task<List<TeacherScheduleRuleView>> ListAsync(Guid workspaceId, CancellationToken ct) =>
        Scoped(workspaceId).AsNoTracking()
            .OrderBy(x => x.IndividualClassId).ThenBy(x => x.GroupClassId)
            .ThenBy(x => x.StartMinute)
            .Select(x => new TeacherScheduleRuleView(
                x.Id, x.IndividualClassId ?? x.GroupClassId!.Value,
                x.IndividualClassId.HasValue ? "individual" : "group",
                x.DaysMask, x.StartMinute, x.DurationMinutes,
                x.TimeZoneId, x.IsActive, x.Revision)).ToListAsync(ct);

    private static Dictionary<string, string[]> Validate(
        int daysMask, int startMinute, int durationMinutes, string? timezone)
    {
        var errors = new Dictionary<string, string[]>();
        if (daysMask is < 1 or > 127)
            errors["daysMask"] = ["Select at least one day of the week."];
        if (startMinute is < 0 or > 1439 || startMinute % 5 != 0)
            errors["startMinute"] = ["Start time must be on a five-minute boundary."];
        if (durationMinutes is < 15 or > 240 || durationMinutes % 5 != 0)
            errors["durationMinutes"] = ["Duration must be 15–240 minutes in five-minute increments."];
        if (startMinute + durationMinutes > 1440)
            errors["startMinute"] = ["An overnight slot is not supported. End before midnight."];
        if (string.IsNullOrWhiteSpace(timezone) || timezone.Trim().Length > 64 ||
            !TimeZoneInfo.TryFindSystemTimeZoneById(timezone.Trim(), out _))
            errors["timeZoneId"] = ["Choose a valid IANA time zone."];
        return errors;
    }

    private Task<bool> ClassActiveAsync(Guid workspaceId, Guid classId, string kind, CancellationToken ct) =>
        kind == "group"
            ? db.TeacherGroupClasses.AnyAsync(x => x.WorkspaceId == workspaceId &&
                x.Id == classId && !x.IsArchived, ct)
            : db.TeacherClasses.AnyAsync(x => x.WorkspaceId == workspaceId &&
                x.Id == classId && !x.IsArchived, ct);

    private async Task<bool> ConflictsAsync(
        Guid workspaceId, Guid classId, string kind, Guid exceptId,
        int mask, int start, int duration, string timeZoneId, CancellationToken ct)
    {
        // Only slots belonging to this class are compared. A class uses one active zone at a time.
        var rules = await Scoped(workspaceId).AsNoTracking()
            .Where(x => x.IsActive && x.Id != exceptId &&
                (kind == "group" ? x.GroupClassId == classId : x.IndividualClassId == classId))
            .Select(x => new { x.DaysMask, x.StartMinute, x.DurationMinutes, x.TimeZoneId })
            .ToListAsync(ct);
        return rules.Any(x => x.TimeZoneId != timeZoneId ||
            ((x.DaysMask & mask) != 0 && start < x.StartMinute + x.DurationMinutes &&
                x.StartMinute < start + duration));
    }

    public async Task<TeacherScheduleRuleResult> CreateAsync(
        Guid workspaceId, TeacherScheduleRuleCreateRequest request, CancellationToken ct)
    {
        var errors = Validate(request.DaysMask, request.StartMinute, request.DurationMinutes, request.TimeZoneId);
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Request ID is required."];
        if (request.ClassId == Guid.Empty) errors["classId"] = ["Class ID is required."];
        if (request.ClassKind is not ("individual" or "group"))
            errors["classKind"] = ["Select an individual or group class."];
        if (errors.Count > 0) return new(TeacherScheduleRuleStatus.Invalid, Errors: errors);
        var zone = request.TimeZoneId!.Trim();
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var previous = await Scoped(workspaceId).AsNoTracking()
                .SingleOrDefaultAsync(x => x.RequestId == request.RequestId, ct);
            if (previous is not null)
                return previous.IndividualClassId == (request.ClassKind == "individual" ? request.ClassId : null) &&
                       previous.GroupClassId == (request.ClassKind == "group" ? request.ClassId : null) &&
                       previous.DaysMask == request.DaysMask && previous.StartMinute == request.StartMinute &&
                       previous.DurationMinutes == request.DurationMinutes && previous.TimeZoneId == zone &&
                       previous.IsActive == request.IsActive
                    ? new(TeacherScheduleRuleStatus.Unchanged, View(previous))
                    : new(TeacherScheduleRuleStatus.Conflict);
            if (!await ClassActiveAsync(workspaceId, request.ClassId, request.ClassKind!, ct))
                return new(TeacherScheduleRuleStatus.NotFound);
            if (request.IsActive && await ConflictsAsync(workspaceId, request.ClassId,
                request.ClassKind!, Guid.Empty, request.DaysMask, request.StartMinute,
                request.DurationMinutes, zone, ct))
                return new(TeacherScheduleRuleStatus.Conflict);
            var rule = new TeacherScheduleRule
            {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId, RequestId = request.RequestId,
                IndividualClassId = request.ClassKind == "individual" ? request.ClassId : null,
                GroupClassId = request.ClassKind == "group" ? request.ClassId : null,
                DaysMask = request.DaysMask, StartMinute = request.StartMinute,
                DurationMinutes = request.DurationMinutes, TimeZoneId = zone,
                IsActive = request.IsActive, CreatedAt = clock.GetUtcNow()
            };
            db.TeacherScheduleRules.Add(rule);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return new(TeacherScheduleRuleStatus.Created, View(rule));
        }
        catch (PostgresException e) when (e.SqlState is "40001" or "23505")
        {
            return new(TeacherScheduleRuleStatus.Conflict);
        }
        catch (DbUpdateException e) when (e.InnerException is PostgresException p &&
            p.SqlState is "40001" or "23505")
        {
            return new(TeacherScheduleRuleStatus.Conflict);
        }
    }

    public async Task<TeacherScheduleRuleResult> UpdateAsync(
        Guid workspaceId, Guid ruleId, TeacherScheduleRuleUpdateRequest request, CancellationToken ct)
    {
        var errors = Validate(request.DaysMask, request.StartMinute, request.DurationMinutes, request.TimeZoneId);
        if (request.ExpectedRevision < 1)
            errors["expectedRevision"] = ["Current revision is required."];
        if (errors.Count > 0) return new(TeacherScheduleRuleStatus.Invalid, Errors: errors);
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            var rule = await Scoped(workspaceId).SingleOrDefaultAsync(x => x.Id == ruleId, ct);
            if (rule is null) return new(TeacherScheduleRuleStatus.NotFound);
            if (rule.Revision != request.ExpectedRevision)
                return new(TeacherScheduleRuleStatus.Conflict);
            var kind = rule.IndividualClassId.HasValue ? "individual" : "group";
            var classId = rule.IndividualClassId ?? rule.GroupClassId!.Value;
            if (!await ClassActiveAsync(workspaceId, classId, kind, ct))
                return new(TeacherScheduleRuleStatus.Conflict);
            var zone = request.TimeZoneId!.Trim();
            if (request.IsActive && await ConflictsAsync(workspaceId, classId, kind, rule.Id,
                request.DaysMask, request.StartMinute, request.DurationMinutes, zone, ct))
                return new(TeacherScheduleRuleStatus.Conflict);
            if (rule.DaysMask == request.DaysMask && rule.StartMinute == request.StartMinute &&
                rule.DurationMinutes == request.DurationMinutes && rule.TimeZoneId == zone &&
                rule.IsActive == request.IsActive)
                return new(TeacherScheduleRuleStatus.Unchanged, View(rule));
            rule.DaysMask = request.DaysMask;
            rule.StartMinute = request.StartMinute;
            rule.DurationMinutes = request.DurationMinutes;
            rule.TimeZoneId = zone;
            rule.IsActive = request.IsActive;
            rule.Revision++;
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return new(TeacherScheduleRuleStatus.Updated, View(rule));
        }
        catch (DbUpdateConcurrencyException) { return new(TeacherScheduleRuleStatus.Conflict); }
        catch (PostgresException e) when (e.SqlState == "40001")
        {
            return new(TeacherScheduleRuleStatus.Conflict);
        }
    }

    public async Task<TeacherScheduleRuleResult> DisableAsync(
        Guid workspaceId, Guid ruleId, int expectedRevision, CancellationToken ct)
    {
        if (expectedRevision < 1)
            return new(TeacherScheduleRuleStatus.Invalid,
                Errors: new() { ["expectedRevision"] = ["Current revision is required."] });
        var rule = await Scoped(workspaceId).SingleOrDefaultAsync(x => x.Id == ruleId, ct);
        if (rule is null) return new(TeacherScheduleRuleStatus.NotFound);
        if (rule.Revision != expectedRevision) return new(TeacherScheduleRuleStatus.Conflict);
        if (!rule.IsActive) return new(TeacherScheduleRuleStatus.Unchanged, View(rule));
        rule.IsActive = false;
        rule.Revision++;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return new(TeacherScheduleRuleStatus.Conflict); }
        return new(TeacherScheduleRuleStatus.Updated, View(rule));
    }
}
