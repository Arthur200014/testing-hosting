using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

public sealed record TeacherPeriodPreviewRequest(Guid ClassId, string? ClassKind, DateOnly From, DateOnly To, int? Count = null);
public sealed record TeacherPeriodCandidate(Guid RuleId, DateTimeOffset LessonAt, int DurationMinutes,
    string TimeZoneId, Guid[] ExistingLessonIds);
public sealed record TeacherPeriodPreviewResult(bool NotFound = false,
    Dictionary<string, string[]>? Errors = null, List<TeacherPeriodCandidate>? Candidates = null);

public sealed class TeacherPeriodPreviewService(PlatformDbContext db, TimeProvider clock)
{
    public async Task<TeacherPeriodPreviewResult> PreviewAsync(Guid workspaceId,
        TeacherPeriodPreviewRequest request, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.ClassId == Guid.Empty) errors["classId"] = ["Class ID is required."];
        if (request.ClassKind is not ("individual" or "group"))
            errors["classKind"] = ["Select an individual or group class."];
        if (request.Count is < 1 or > 31) errors["count"] = ["Укажите от 1 до 31 занятия."];
        if (request.From == default || (request.Count is null && (request.To == default || request.To < request.From ||
            request.To.DayNumber - request.From.DayNumber >= 31)))
            errors["range"] = ["Choose an inclusive period of 1–31 days."];
        if (errors.Count > 0) return new(Errors: errors);

        var group = request.ClassKind == "group";
        var active = group
            ? await db.TeacherGroupClasses.AsNoTracking().AnyAsync(x => x.WorkspaceId == workspaceId &&
                x.Id == request.ClassId && !x.IsArchived, ct)
            : await db.TeacherClasses.AsNoTracking().AnyAsync(x => x.WorkspaceId == workspaceId &&
                x.Id == request.ClassId && !x.IsArchived, ct);
        if (!active) return new(NotFound: true);

        var rules = await db.TeacherScheduleRules.AsNoTracking().Where(x => x.WorkspaceId == workspaceId &&
            x.IsActive && (group ? x.GroupClassId == request.ClassId : x.IndividualClassId == request.ClassId))
            .OrderBy(x => x.StartMinute).ThenBy(x => x.Id).ToListAsync(ct);
        var candidates = new List<TeacherPeriodCandidate>();
        var lastDay = request.Count.HasValue ? Math.Min(DateOnly.MaxValue.DayNumber, request.From.DayNumber + 365) : request.To.DayNumber;
        for (var dayNumber = request.From.DayNumber; dayNumber <= lastDay; dayNumber++)
        {
            var day = DateOnly.FromDayNumber(dayNumber);
            var mask = 1 << (((int)day.DayOfWeek + 6) % 7);
            foreach (var rule in rules.Where(x => (x.DaysMask & mask) != 0))
            {
                var zone = TimeZoneInfo.FindSystemTimeZoneById(rule.TimeZoneId);
                var local = day.ToDateTime(TimeOnly.MinValue).AddMinutes(rule.StartMinute);
                // Do not silently guess a start when a zone changes its clocks.
                if (zone.IsInvalidTime(local) || zone.IsAmbiguousTime(local))
                    return new(Errors: new() { ["range"] = ["A scheduled time is ambiguous or invalid in its time zone."] });
                var instant = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, zone));
                if (request.Count.HasValue && instant <= clock.GetUtcNow()) continue;
                candidates.Add(new(rule.Id, instant,
                    rule.DurationMinutes, rule.TimeZoneId, []));
            }
            if (request.Count.HasValue && candidates.Count >= request.Count.Value) break;
        }
        if (request.Count.HasValue)
        {
            if (candidates.Count < request.Count.Value)
                return new(Errors: new() { ["count"] = ["Недостаточно будущих слотов в расписании на ближайшие 366 дней от выбранной даты."] });
            candidates = candidates.OrderBy(x => x.LessonAt).ThenBy(x => x.RuleId).Take(request.Count.Value).ToList();
        }
        if (candidates.Count == 0) return new(Candidates: candidates);
        var starts = candidates.Select(x => x.LessonAt).Distinct().ToArray();
        var existing = await db.Lessons.AsNoTracking().Where(x => x.WorkspaceId == workspaceId &&
            (group ? x.GroupClassId == request.ClassId : x.IndividualClassId == request.ClassId) &&
            starts.Contains(x.LessonAt)).Select(x => new { x.Id, x.LessonAt }).ToListAsync(ct);
        return new(Candidates: candidates.OrderBy(x => x.LessonAt).ThenBy(x => x.RuleId)
            .Select(x => x with { ExistingLessonIds = existing.Where(y => y.LessonAt == x.LessonAt)
                .Select(y => y.Id).Order().ToArray() }).ToList());
    }
}
