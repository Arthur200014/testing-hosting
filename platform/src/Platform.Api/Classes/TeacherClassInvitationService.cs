using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

public sealed record AcceptClassInvitationRequest(string? Code);
public sealed record ClassInviteIssueResponse(string Code, DateTimeOffset ExpiresAt, int Revision);
public sealed record ClassInviteStateResponse(string Status, int Revision, DateTimeOffset? AcceptedAt);
public enum ClassInviteStatus { Created, Updated, NotFound, Conflict, Invalid }
public sealed record ClassInviteResult(ClassInviteStatus Status, object? Response = null);

/// <summary>Single active invitation per existing class. Only a SHA256 digest is persisted.</summary>
public sealed class TeacherClassInvitationService(PlatformDbContext db, TimeProvider clock)
{
    private static byte[] Hash(string code) => SHA256.HashData(Convert.FromHexString(code));

    public async Task<ClassInviteResult> IssueAsync(Guid workspaceId, Guid classId, int revision, CancellationToken ct)
    {
        if (revision < 1) return new(ClassInviteStatus.Invalid);
        var item = await db.TeacherClasses.SingleOrDefaultAsync(
            x => x.WorkspaceId == workspaceId && x.Id == classId, ct);
        if (item is null) return new(ClassInviteStatus.NotFound);
        if (item.IsArchived || item.Revision != revision) return new(ClassInviteStatus.Conflict);
        var code = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        item.InvitationCodeHash = Hash(code);
        item.InvitationStatus = "pending";
        item.InvitationIssuedAt = clock.GetUtcNow();
        item.InvitationExpiresAt = clock.GetUtcNow().AddDays(7);
        item.InvitationAcceptedAt = null;
        item.Revision++;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return new(ClassInviteStatus.Conflict); }
        return new(ClassInviteStatus.Created,
            new ClassInviteIssueResponse(code, item.InvitationExpiresAt.Value, item.Revision));
    }

    public async Task<ClassInviteResult> RevokeAsync(Guid workspaceId, Guid classId, int revision, CancellationToken ct)
    {
        if (revision < 1) return new(ClassInviteStatus.Invalid);
        var item = await db.TeacherClasses.SingleOrDefaultAsync(
            x => x.WorkspaceId == workspaceId && x.Id == classId, ct);
        if (item is null) return new(ClassInviteStatus.NotFound);
        if (item.IsArchived || item.Revision != revision || item.InvitationStatus != "pending")
            return new(ClassInviteStatus.Conflict);
        item.InvitationStatus = "revoked";
        item.InvitationCodeHash = null;
        item.Revision++;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return new(ClassInviteStatus.Conflict); }
        return new(ClassInviteStatus.Updated,
            new ClassInviteStateResponse("revoked", item.Revision, null));
    }

    public async Task<ClassInviteResult> AcceptAsync(
        Guid workspaceId, Guid membershipId, Guid studentId, string? code, CancellationToken ct)
    {
        if (code?.Length != 64 || !code.All(Uri.IsHexDigit)) return new(ClassInviteStatus.Invalid);
        var hash = Hash(code);
        var candidates = await db.TeacherClasses
            .Where(x => x.WorkspaceId == workspaceId && x.StudentMembershipId == membershipId &&
                x.StudentId == studentId && !x.IsArchived && x.InvitationStatus == "pending" &&
                x.InvitationExpiresAt > clock.GetUtcNow() && x.StudentMembership.IsActive &&
                x.StudentMembership.Student.IsActive && x.StudentMembership.Program.IsActive &&
                x.StudentMembership.Workspace.IsActive)
            .ToListAsync(ct);
        var item = candidates.FirstOrDefault(x => x.InvitationCodeHash is { Length: 32 } &&
            CryptographicOperations.FixedTimeEquals(x.InvitationCodeHash, hash));
        if (item is null) return new(ClassInviteStatus.NotFound);
        item.InvitationStatus = "accepted";
        item.InvitationCodeHash = null;
        item.InvitationAcceptedAt = clock.GetUtcNow();
        item.Revision++;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return new(ClassInviteStatus.Conflict); }
        return new(ClassInviteStatus.Updated,
            new ClassInviteStateResponse("accepted", item.Revision, item.InvitationAcceptedAt));
    }
}
