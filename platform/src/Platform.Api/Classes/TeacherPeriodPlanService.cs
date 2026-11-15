using System.Text.Json;
using System.Data;
using Npgsql;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Lessons;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

public sealed class TeacherPeriodPlan
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public required string RequestJson { get; set; }
    public required string ResultJson { get; set; }
}
public sealed record TeacherPeriodPlanRequest(Guid RequestId, TeacherPeriodPreviewRequest Period,
    List<TeacherPeriodCandidate> ExpectedCandidates);
public sealed record TeacherPeriodPlanResponse(List<Guid> CreatedLessonIds, int SkippedCount);
public sealed record TeacherPeriodPlanResult(int Status, TeacherPeriodPlanResponse? Response = null);

public sealed class TeacherPeriodPlanService(PlatformDbContext db,
    TeacherPeriodPreviewService preview, TeacherLessonService lessons)
{
    public async Task<TeacherPeriodPlanResult> SaveAsync(Guid workspaceId, TeacherPeriodPlanRequest request, CancellationToken ct)
    {
        try { return await SaveCoreAsync(workspaceId, request, ct); }
        catch (PostgresException e) when (e.SqlState is "40001" or "23505") { return new(409); }
        catch (DbUpdateException e) when (e.InnerException is PostgresException p && p.SqlState is "40001" or "23505") { return new(409); }
    }

    private async Task<TeacherPeriodPlanResult> SaveCoreAsync(Guid workspaceId, TeacherPeriodPlanRequest request, CancellationToken ct)
    {
        if (request.RequestId == Guid.Empty || request.Period is null || request.ExpectedCandidates is null)
            return new(400);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var key = "lesson-workspace:" + workspaceId.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))", ct);
        var json = JsonSerializer.Serialize(request);
        var previous = await db.Set<TeacherPeriodPlan>().AsNoTracking()
            .SingleOrDefaultAsync(x => x.WorkspaceId == workspaceId && x.Id == request.RequestId, ct);
        if (previous is not null)
            return previous.RequestJson == json
                ? new(200, JsonSerializer.Deserialize<TeacherPeriodPlanResponse>(previous.ResultJson)) : new(409);
        var current = await preview.PreviewAsync(workspaceId, request.Period, ct);
        if (current.NotFound) return new(404);
        if (current.Errors is not null) return new(400);
        if (JsonSerializer.Serialize(current.Candidates) != JsonSerializer.Serialize(request.ExpectedCandidates))
            return new(409);
        var candidates = current.Candidates!;
        var pending = candidates.Where(x => x.ExistingLessonIds.Length == 0).ToList();
        // Any overlap in this teacher workspace is rejected atomically, including
        // unrelated classes and legacy lessons. Exact existing class starts are skipped.
        var latest = pending.Count == 0 ? DateTimeOffset.MinValue : pending.Max(x => x.LessonAt.AddMinutes(x.DurationMinutes));
        var all = await db.Lessons.AsNoTracking().Where(x => x.WorkspaceId == workspaceId && x.LessonAt < latest)
            .Select(x => new { x.LessonAt, Durations = x.Participants.Select(p => p.DurationMinutes).ToList() }).ToListAsync(ct);
        for (var i = 0; i < pending.Count; i++)
        {
            var slot = pending[i];
            var end = slot.LessonAt.AddMinutes(slot.DurationMinutes);
            if (all.Any(x => x.LessonAt < end && x.LessonAt.AddMinutes(x.Durations.DefaultIfEmpty(60).Max()) > slot.LessonAt) ||
                pending.Take(i).Any(x => x.LessonAt < end && x.LessonAt.AddMinutes(x.DurationMinutes) > slot.LessonAt))
                return new(409);
        }
        var group = request.Period.ClassKind == "group";
        var memberIds = group
            ? await db.TeacherGroupEnrollments.Where(x => x.WorkspaceId == workspaceId && x.GroupClassId == request.Period.ClassId && x.IsApproved)
                .Select(x => x.MembershipId).ToListAsync(ct)
            : await db.TeacherClasses.Where(x => x.WorkspaceId == workspaceId && x.Id == request.Period.ClassId)
                .Select(x => x.StudentMembershipId).ToListAsync(ct);
        if (pending.Count > 0 && memberIds.Count == 0) return new(409);
        var created = new List<Guid>();
        foreach (var slot in pending)
        {
            var result = await lessons.SaveAsync(workspaceId, new(Guid.NewGuid(), slot.LessonAt,
                memberIds.Select(id => new TeacherLessonParticipantRequest(id, slot.DurationMinutes, null, null, "Unknown")).ToList(),
                IndividualClassId: group ? null : request.Period.ClassId,
                GroupClassId: group ? request.Period.ClassId : null), ct);
            if (result.Status != TeacherLessonWriteStatus.Created) return new(409);
            created.Add(result.Response!.LessonId);
        }
        var response = new TeacherPeriodPlanResponse(created, candidates.Count - pending.Count);
        db.Set<TeacherPeriodPlan>().Add(new() { Id = request.RequestId, WorkspaceId = workspaceId,
            RequestJson = json, ResultJson = JsonSerializer.Serialize(response) });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return new(200, response);
    }
}
