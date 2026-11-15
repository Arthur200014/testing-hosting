using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

public sealed record TeacherGroupMemberView(Guid MembershipId, string StudentName, string ProgramName, bool IsApproved);
public sealed record TeacherGroupClassView(
    Guid Id, string Title, string Description, string Kind, bool IsArchived, int Revision,
    DateTimeOffset CreatedAt, string CoverStyle, int Capacity, bool AutoApproveInvites,
    int? DurationMinutes, decimal? PriceAmount, string? PriceCurrency, string? PriceBasis,
    bool AllowLessonChat, bool AllowPrivateMessages,
    string? InvitationStatus, DateTimeOffset? InvitationExpiresAt, List<TeacherGroupMemberView> Members);

public sealed record TeacherCreateGroupRequest(
    Guid RequestId, string? Title, List<Guid>? MemberIds = null, string? Description = null,
    string? CoverStyle = null, int Capacity = 20, bool AutoApproveInvites = true,
    int? DurationMinutes = null, decimal? PriceAmount = null, string? PriceCurrency = null,
    string? PriceBasis = null, bool AllowLessonChat = false, bool AllowPrivateMessages = false);

public sealed record TeacherUpdateGroupRequest(
    int ExpectedRevision, string? Title, List<Guid>? MemberIds = null, string? Description = null,
    string? CoverStyle = null, int Capacity = 20, bool AutoApproveInvites = true,
    int? DurationMinutes = null, decimal? PriceAmount = null, string? PriceCurrency = null,
    string? PriceBasis = null, bool AllowLessonChat = false, bool AllowPrivateMessages = false);

public enum TeacherGroupStatus { Created, Updated, Unchanged, NotFound, Conflict, InvalidRequest }
public sealed record TeacherGroupResult(TeacherGroupStatus Status,
    TeacherGroupClassView? Response = null, Dictionary<string, string[]>? Errors = null);
public sealed record GroupInviteResult(TeacherGroupStatus Status, object? Response = null);

public sealed class TeacherGroupService(PlatformDbContext db, TimeProvider clock)
{
    private IQueryable<TeacherGroupClass> Groups(Guid workspaceId) =>
        db.TeacherGroupClasses.Where(x => x.WorkspaceId == workspaceId);
    private IQueryable<TeacherGroupClass> WithMembers(IQueryable<TeacherGroupClass> source) =>
        source.Include(x => x.Members).ThenInclude(x => x.Membership).ThenInclude(x => x.Student)
            .Include(x => x.Members).ThenInclude(x => x.Membership).ThenInclude(x => x.Program)
            .AsSplitQuery();
    private Task<TeacherGroupClass?> FindAsync(Guid workspaceId, Guid id, bool track, CancellationToken ct) =>
        (track ? WithMembers(Groups(workspaceId)) : WithMembers(Groups(workspaceId).AsNoTracking()))
            .SingleOrDefaultAsync(x => x.Id == id, ct);
    private static TeacherGroupClassView View(TeacherGroupClass item) => new(
        item.Id, item.Title, item.Description, "group", item.IsArchived, item.Revision,
        item.CreatedAt, item.CoverStyle, item.Capacity, item.AutoApproveInvites,
        item.DurationMinutes, item.PriceAmount, item.PriceCurrency, item.PriceBasis,
        item.AllowLessonChat, item.AllowPrivateMessages, item.InvitationStatus,
        item.InvitationExpiresAt,
        item.Members.OrderBy(x => x.Membership.Student.DisplayName)
            .Select(x => new TeacherGroupMemberView(x.MembershipId, x.Membership.Student.DisplayName,
                x.Membership.Program.DisplayName, x.IsApproved)).ToList());

    public async Task<List<TeacherGroupClassView>> ListAsync(Guid workspaceId, CancellationToken ct) =>
        (await WithMembers(Groups(workspaceId).AsNoTracking())
            .OrderBy(x => x.IsArchived).ThenBy(x => x.Title).ToListAsync(ct)).Select(View).ToList();

    private static Dictionary<string, string[]> Validate(
        string? title, string? description, string? cover, int capacity, IReadOnlyList<Guid>? memberIds,
        int? duration, decimal? price, string? currency, string? basis)
    {
        var e = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(title) || title.Trim().Length > 50)
            e["title"] = ["Name must contain 1–50 characters."];
        if ((description?.Trim().Length ?? 0) > 200)
            e["description"] = ["Description must contain at most 200 characters."];
        if (!TeacherClassService.AllowedCover(TeacherClassService.NormalizeCover(cover)))
            e["coverStyle"] = ["Unknown cover style."];
        if (capacity is < 1 or > 20) e["capacity"] = ["Capacity must be between 1 and 20."];
        if (memberIds is not null && (memberIds.Any(id => id == Guid.Empty) ||
            memberIds.Distinct().Count() != memberIds.Count))
            e["memberIds"] = ["Select distinct valid student memberships."];
        if (memberIds?.Count > capacity) e["capacity"] = ["Capacity cannot be less than the group size."];
        if (duration is int minutes && (minutes < 15 || minutes > 240 || minutes % 5 != 0))
            e["durationMinutes"] = ["Duration must be 15–240 minutes in 5-minute increments."];
        if (price is decimal amount)
        {
            if (amount < 0 || amount > 10000000m || amount != decimal.Round(amount, 2))
                e["priceAmount"] = ["Price must be nonnegative with at most two decimal places."];
            if (currency?.Trim().ToUpperInvariant() is not ("RUB" or "EUR" or "USD"))
                e["priceCurrency"] = ["Currency must be RUB, EUR or USD."];
            if (basis?.Trim().ToLowerInvariant() is not ("lesson" or "month"))
                e["priceBasis"] = ["Basis must be lesson or month."];
        }
        else if (!string.IsNullOrWhiteSpace(currency) || !string.IsNullOrWhiteSpace(basis))
            e["priceAmount"] = ["Price amount is required with currency or basis."];
        return e;
    }

    private async Task<Dictionary<Guid, Guid>?> ValidateMembersAsync(
        Guid workspaceId, IReadOnlyList<Guid> ids, CancellationToken ct)
    {
        var found = await db.WorkspaceStudentMemberships.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && ids.Contains(x.Id) &&
                x.IsActive && x.Student.IsActive && x.Program.IsActive)
            .Select(x => new { x.Id, x.StudentId }).ToListAsync(ct);
        return found.Count == ids.Count ? found.ToDictionary(x => x.Id, x => x.StudentId) : null;
    }

    public async Task<TeacherGroupResult> CreateAsync(
        Guid workspaceId, TeacherCreateGroupRequest request, CancellationToken ct)
    {
        var ids = request.MemberIds ?? [];
        var errors = Validate(request.Title, request.Description, request.CoverStyle, request.Capacity, ids,
            request.DurationMinutes, request.PriceAmount, request.PriceCurrency, request.PriceBasis);
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["Request ID is required."];
        if (errors.Count != 0) return new(TeacherGroupStatus.InvalidRequest, Errors: errors);
        var existing = await WithMembers(Groups(workspaceId).AsNoTracking())
            .SingleOrDefaultAsync(x => x.RequestId == request.RequestId, ct);
        if (existing is not null) return Compare(existing, request);
        var members = await ValidateMembersAsync(workspaceId, ids, ct);
        if (members is null) return new(TeacherGroupStatus.NotFound);

        var item = new TeacherGroupClass {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, RequestId = request.RequestId,
            Title = request.Title!.Trim(), Description = request.Description?.Trim() ?? "",
            CoverStyle = TeacherClassService.NormalizeCover(request.CoverStyle),
            Capacity = request.Capacity, AutoApproveInvites = request.AutoApproveInvites,
            DurationMinutes = request.DurationMinutes, PriceAmount = request.PriceAmount,
            PriceCurrency = request.PriceAmount is null ? null : request.PriceCurrency!.Trim().ToUpperInvariant(),
            PriceBasis = request.PriceAmount is null ? null : request.PriceBasis!.Trim().ToLowerInvariant(),
            AllowLessonChat = request.AllowLessonChat, AllowPrivateMessages = request.AllowPrivateMessages,
            CreatedAt = clock.GetUtcNow()
        };
        item.Members = ids.Select(id => new TeacherGroupEnrollment {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, GroupClassId = item.Id,
            MembershipId = id, StudentId = members[id], IsApproved = true,
            JoinedAt = clock.GetUtcNow()
        }).ToList();
        db.TeacherGroupClasses.Add(item);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg &&
            pg.SqlState == PostgresErrorCodes.UniqueViolation &&
            pg.ConstraintName == "IX_TeacherGroupClasses_WorkspaceId_RequestId")
        {
            db.ChangeTracker.Clear();
            var winner = await WithMembers(Groups(workspaceId).AsNoTracking())
                .SingleOrDefaultAsync(x => x.RequestId == request.RequestId, ct);
            if (winner is null) throw;
            return Compare(winner, request);
        }
        return new(TeacherGroupStatus.Created, View(
            (await FindAsync(workspaceId, item.Id, false, ct))!));
    }

    private static TeacherGroupResult Compare(TeacherGroupClass original, TeacherCreateGroupRequest request)
    {
        var expected = (request.MemberIds ?? []).Order().ToArray();
        var actual = original.Members.Select(x => x.MembershipId).Order().ToArray();
        return !original.IsArchived && original.Title == request.Title?.Trim() &&
            original.Description == (request.Description?.Trim() ?? "") &&
            original.CoverStyle == TeacherClassService.NormalizeCover(request.CoverStyle) &&
            original.Capacity == request.Capacity && original.AutoApproveInvites == request.AutoApproveInvites &&
            original.DurationMinutes == request.DurationMinutes && original.PriceAmount == request.PriceAmount &&
            original.PriceCurrency == (request.PriceAmount is null ? null : request.PriceCurrency?.Trim().ToUpperInvariant()) &&
            original.PriceBasis == (request.PriceAmount is null ? null : request.PriceBasis?.Trim().ToLowerInvariant()) &&
            original.AllowLessonChat == request.AllowLessonChat &&
            original.AllowPrivateMessages == request.AllowPrivateMessages &&
            expected.SequenceEqual(actual)
                ? new(TeacherGroupStatus.Unchanged, View(original)) : new(TeacherGroupStatus.Conflict);
    }

    public async Task<TeacherGroupResult> UpdateAsync(
        Guid workspaceId, Guid id, TeacherUpdateGroupRequest request, CancellationToken ct)
    {
        if (request.ExpectedRevision < 1) return InvalidRevision();
        var group = await FindAsync(workspaceId, id, true, ct);
        if (group is null) return new(TeacherGroupStatus.NotFound);
        if (group.IsArchived || group.Revision != request.ExpectedRevision)
            return new(TeacherGroupStatus.Conflict);
        var ids = request.MemberIds ?? group.Members.Select(m => m.MembershipId).ToList();
        var errors = Validate(request.Title, request.Description,
            request.CoverStyle ?? group.CoverStyle, request.Capacity, ids,
            request.DurationMinutes, request.PriceAmount, request.PriceCurrency, request.PriceBasis);
        if (errors.Count != 0) return new(TeacherGroupStatus.InvalidRequest, Errors: errors);
        // Keep already-enrolled historical students even when their membership becomes inactive.
        // Validate active status only for newly added students.
        var previous = group.Members.Select(x => x.MembershipId).ToHashSet();
        var additions = ids.Where(id => !previous.Contains(id)).ToList();
        var newMembers = await ValidateMembersAsync(workspaceId, additions, ct);
        if (newMembers is null) return new(TeacherGroupStatus.NotFound);
        var wanted = ids.ToHashSet();
        var priceCurrency = request.PriceAmount is null ? null : request.PriceCurrency!.Trim().ToUpperInvariant();
        var priceBasis = request.PriceAmount is null ? null : request.PriceBasis!.Trim().ToLowerInvariant();
        var cover = request.CoverStyle is null ? group.CoverStyle : TeacherClassService.NormalizeCover(request.CoverStyle);
        var changed = group.Title != request.Title!.Trim() ||
            group.Description != (request.Description?.Trim() ?? "") ||
            group.CoverStyle != cover || group.Capacity != request.Capacity ||
            group.AutoApproveInvites != request.AutoApproveInvites ||
            group.DurationMinutes != request.DurationMinutes || group.PriceAmount != request.PriceAmount ||
            group.PriceCurrency != priceCurrency || group.PriceBasis != priceBasis ||
            group.AllowLessonChat != request.AllowLessonChat ||
            group.AllowPrivateMessages != request.AllowPrivateMessages ||
            !wanted.SetEquals(previous);
        if (!changed) return new(TeacherGroupStatus.Unchanged, View(group));
        group.Title = request.Title!.Trim();
        group.Description = request.Description?.Trim() ?? "";
        group.CoverStyle = cover;
        group.Capacity = request.Capacity;
        group.AutoApproveInvites = request.AutoApproveInvites;
        group.DurationMinutes = request.DurationMinutes;
        group.PriceAmount = request.PriceAmount;
        group.PriceCurrency = priceCurrency;
        group.PriceBasis = priceBasis;
        group.AllowLessonChat = request.AllowLessonChat;
        group.AllowPrivateMessages = request.AllowPrivateMessages;
        foreach (var member in group.Members.Where(m => !wanted.Contains(m.MembershipId)).ToList())
        { group.Members.Remove(member); db.TeacherGroupEnrollments.Remove(member); }
        foreach (var memberId in ids.Where(memberId => !previous.Contains(memberId)))
        {
            var enrollment = new TeacherGroupEnrollment {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId, GroupClassId = group.Id,
                MembershipId = memberId, StudentId = newMembers[memberId],
                JoinedAt = clock.GetUtcNow(), IsApproved = true
            };
            group.Members.Add(enrollment);
            db.TeacherGroupEnrollments.Add(enrollment);
        }
        group.Revision++;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return new(TeacherGroupStatus.Conflict); }
        return new(TeacherGroupStatus.Updated, View(group));
    }

    private static TeacherGroupResult InvalidRevision() => new(TeacherGroupStatus.InvalidRequest,
        Errors: new() { ["expectedRevision"] = ["Positive revision required."] });

    public async Task<TeacherGroupResult> ArchiveAsync(
        Guid workspaceId, Guid id, TeacherClassRevisionRequest request, bool archived, CancellationToken ct)
    {
        if (request.ExpectedRevision < 1) return InvalidRevision();
        var group = await FindAsync(workspaceId, id, true, ct);
        if (group is null) return new(TeacherGroupStatus.NotFound);
        if (group.Revision != request.ExpectedRevision) return new(TeacherGroupStatus.Conflict);
        if (group.IsArchived == archived) return new(TeacherGroupStatus.Unchanged, View(group));
        group.IsArchived = archived;
        if (archived && group.InvitationStatus == "pending")
        { group.InvitationStatus = "revoked"; group.InvitationCodeHash = null; }
        group.Revision++;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return new(TeacherGroupStatus.Conflict); }
        return new(TeacherGroupStatus.Updated, View(group));
    }

    public async Task<GroupInviteResult> InviteAsync(
        Guid workspaceId, Guid id, TeacherClassRevisionRequest request, bool revoke, CancellationToken ct)
    {
        if (request.ExpectedRevision < 1) return new(TeacherGroupStatus.InvalidRequest);
        var group = await FindAsync(workspaceId, id, true, ct);
        if (group is null) return new(TeacherGroupStatus.NotFound);
        if (group.IsArchived || group.Revision != request.ExpectedRevision ||
            (revoke && group.InvitationStatus != "pending")) return new(TeacherGroupStatus.Conflict);
        string? code = null;
        if (revoke)
        { group.InvitationStatus = "revoked"; group.InvitationCodeHash = null; }
        else
        {
            code = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            group.InvitationCodeHash = SHA256.HashData(Convert.FromHexString(code));
            group.InvitationStatus = "pending";
            group.InvitationExpiresAt = clock.GetUtcNow().AddDays(7);
        }
        group.Revision++;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return new(TeacherGroupStatus.Conflict); }
        return new(TeacherGroupStatus.Updated, revoke
            ? new { status = "revoked", revision = group.Revision }
            : new { code, expiresAt = group.InvitationExpiresAt, revision = group.Revision });
    }

    public async Task<GroupInviteResult> JoinAsync(
        Guid workspaceId, Guid membershipId, Guid studentId, string? code, CancellationToken ct)
    {
        if (code?.Length != 64 || !code.All(Uri.IsHexDigit))
            return new(TeacherGroupStatus.InvalidRequest);
        var member = await db.WorkspaceStudentMemberships.AsNoTracking().AnyAsync(x =>
            x.Id == membershipId && x.WorkspaceId == workspaceId && x.StudentId == studentId &&
            x.IsActive && x.Student.IsActive && x.Program.IsActive, ct);
        if (!member) return new(TeacherGroupStatus.NotFound);
        var hash = SHA256.HashData(Convert.FromHexString(code));
        var groups = await WithMembers(Groups(workspaceId))
            .Where(x => !x.IsArchived && x.InvitationStatus == "pending" &&
                x.InvitationExpiresAt > clock.GetUtcNow()).ToListAsync(ct);
        var group = groups.FirstOrDefault(x => x.InvitationCodeHash is { Length: 32 } &&
            CryptographicOperations.FixedTimeEquals(x.InvitationCodeHash, hash));
        if (group is null) return new(TeacherGroupStatus.NotFound);
        var existing = group.Members.FirstOrDefault(x => x.MembershipId == membershipId);
        if (existing is not null)
            return new(TeacherGroupStatus.Unchanged, new { status = existing.IsApproved ? "approved" : "pending" });
        if (group.Members.Count >= group.Capacity)
            return new(TeacherGroupStatus.Conflict);
        var enrollment = new TeacherGroupEnrollment {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, GroupClassId = group.Id,
            MembershipId = membershipId, StudentId = studentId,
            IsApproved = group.AutoApproveInvites, JoinedAt = clock.GetUtcNow()
        };
        group.Members.Add(enrollment);
        db.TeacherGroupEnrollments.Add(enrollment);
        group.Revision++;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return new(TeacherGroupStatus.Conflict); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg &&
            pg.SqlState == PostgresErrorCodes.UniqueViolation) { return new(TeacherGroupStatus.Conflict); }
        return new(TeacherGroupStatus.Updated,
            new { status = group.AutoApproveInvites ? "approved" : "pending" });
    }

    public async Task<TeacherGroupResult> ApproveAsync(
        Guid workspaceId, Guid groupId, Guid membershipId, TeacherClassRevisionRequest request, CancellationToken ct)
    {
        if (request.ExpectedRevision < 1) return InvalidRevision();
        var group = await FindAsync(workspaceId, groupId, true, ct);
        if (group is null) return new(TeacherGroupStatus.NotFound);
        if (group.IsArchived || group.Revision != request.ExpectedRevision)
            return new(TeacherGroupStatus.Conflict);
        var enrollment = group.Members.SingleOrDefault(x => x.MembershipId == membershipId);
        if (enrollment is null) return new(TeacherGroupStatus.NotFound);
        if (enrollment.IsApproved) return new(TeacherGroupStatus.Unchanged, View(group));
        enrollment.IsApproved = true;
        group.Revision++;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return new(TeacherGroupStatus.Conflict); }
        return new(TeacherGroupStatus.Updated, View(group));
    }
}
