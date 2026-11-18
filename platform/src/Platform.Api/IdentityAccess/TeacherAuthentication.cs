using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TestingHosting.Platform.Configuration;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.IdentityAccess;

public sealed record TeacherLoginRequest(string? Workspace, string? Email, string? Password);

public sealed record TeacherLoginResponse(
    string AccessToken, string TokenType, DateTimeOffset ExpiresAt,
    Guid TeacherId, Guid WorkspaceId, string WorkspaceRole);

public sealed class TeacherSessionService(
    PlatformDbContext db,
    IStudentCodeHasher codeHasher,
    IPasswordHasher<TeacherUser> passwordHasher,
    TeacherTokenIssuer tokens,
    TimeProvider clock)
{
    private static readonly TeacherUser DummyUser = new()
    {
        Id = Guid.Empty, Email = "invalid@example.invalid", NormalizedEmail = "INVALID@EXAMPLE.INVALID"
    };
    private static readonly string DummyHash =
        new PasswordHasher<TeacherUser>().HashPassword(DummyUser, "unusable-synthetic-password-for-constant-work");

    public async Task<TeacherLoginResponse?> LoginAsync(TeacherLoginRequest request, CancellationToken cancellationToken)
    {
        var validWorkspace = codeHasher.TryNormalizeWorkspace(request.Workspace, out var slug);
        var email = request.Email?.Trim() ?? "";
        var normalizedEmail = email.ToUpperInvariant();
        var validEmail = email.Length is >= 3 and <= 320 && email.Contains('@');
        var validPassword = request.Password is { Length: > 0 and <= 1024 };

        // Do the same password verification work even when the identity does not exist.
        var membership = await db.WorkspaceMemberships
            .AsNoTracking()
            .Include(x => x.TeacherUser)
            .Include(x => x.Workspace)
            .SingleOrDefaultAsync(x =>
                x.Workspace.Slug == (validWorkspace ? slug : "invalid-workspace") &&
                x.TeacherUser.NormalizedEmail == (validEmail ? normalizedEmail : "INVALID@EXAMPLE.INVALID"),
                cancellationToken);

        var user = membership?.TeacherUser ?? DummyUser;
        var hash = membership?.TeacherUser.PasswordHash ?? DummyHash;
        var checkedPassword = passwordHasher.VerifyHashedPassword(user, hash, request.Password ?? "");
        if (!validWorkspace || !validEmail || !validPassword || membership is null ||
            checkedPassword == PasswordVerificationResult.Failed ||
            !membership.TeacherUser.IsActive || !membership.IsActive || !membership.Workspace.IsActive ||
            membership.Role is not ("owner" or "teacher") || string.IsNullOrWhiteSpace(membership.TeacherUser.PasswordHash))
        {
            return null;
        }

        // Recheck the verified hash under the same account lock used by password changes.
        // Take the account lock before the membership lock in both flows.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        if (!await LockPasswordAsync(user.Id, hash, cancellationToken)) return null;

        var membershipLock = await db.Database.SqlQuery<Guid>($"""
            SELECT "Id" AS "Value" FROM platform."WorkspaceMemberships"
            WHERE "Id"={membership.Id} AND "IsActive" AND "Role"={membership.Role} FOR UPDATE
            """).ToListAsync(cancellationToken);
        if (membershipLock.Count == 0) return null;

        var now = clock.GetUtcNow();
        var session = new TeacherSession
        {
            Id = Guid.NewGuid(), MembershipId = membership.Id,
            CreatedAt = now, ExpiresAt = now.AddMinutes(tokens.LifetimeMinutes)
        };
        db.TeacherSessions.Add(session);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return tokens.Issue(session, membership);
    }

    public async Task<bool> ChangePasswordAsync(
        ClaimsPrincipal principal, string currentPassword, string newPassword, CancellationToken ct)
    {
        var teacherId = Guid.Parse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub)!);
        var membershipId = Guid.Parse(principal.FindFirstValue("membership_id")!);
        var sessionId = Guid.Parse(principal.FindFirstValue(JwtRegisteredClaimNames.Jti)!);
        var role = principal.FindFirstValue("workspace_role")!;
        var user = await db.TeacherUsers.AsNoTracking().SingleOrDefaultAsync(t => t.Id == teacherId, ct);
        if (user?.PasswordHash is not { Length: > 0 } hash ||
            passwordHasher.VerifyHashedPassword(user, hash, currentPassword) == PasswordVerificationResult.Failed)
            return false;

        var nextHash = passwordHasher.HashPassword(user, newPassword);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        if (!await LockPasswordAsync(teacherId, hash, ct)) return false;

        var activeMembership = await db.Database.SqlQuery<Guid>($"""
            SELECT m."Id" AS "Value" FROM platform."WorkspaceMemberships" m
            JOIN platform."Workspaces" w ON w."Id"=m."WorkspaceId"
            WHERE m."Id"={membershipId} AND m."IsActive" AND m."Role"={role} AND w."IsActive"
            FOR UPDATE OF m
            """).ToListAsync(ct);
        if (activeMembership.Count == 0) return false;

        var now = clock.GetUtcNow();
        var activeSession = await db.Database.SqlQuery<Guid>($"""
            SELECT "Id" AS "Value" FROM platform."TeacherSessions"
            WHERE "Id"={sessionId} AND "MembershipId"={membershipId} AND "RevokedAt" IS NULL AND "ExpiresAt">{now}
            FOR UPDATE
            """).ToListAsync(ct);
        if (activeSession.Count == 0) return false;

        await db.TeacherUsers.Where(t => t.Id == teacherId)
            .ExecuteUpdateAsync(update => update.SetProperty(t => t.PasswordHash, nextHash), ct);
        await db.TeacherSessions.Where(s => s.Membership.TeacherUserId == teacherId && s.RevokedAt == null)
            .ExecuteUpdateAsync(update => update.SetProperty(s => s.RevokedAt, now), ct);
        await transaction.CommitAsync(ct);
        return true;
    }

    private async Task<bool> LockPasswordAsync(Guid teacherId, string verifiedHash, CancellationToken ct)
    {
        var users = await db.Database.SqlQuery<Guid>($"""
            SELECT "Id" AS "Value" FROM platform."TeacherUsers"
            WHERE "Id"={teacherId} AND "IsActive" AND "PasswordHash"={verifiedHash}
            FOR UPDATE
            """).ToListAsync(ct);
        return users.Count == 1;
    }

    public async Task RevokeCurrentAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Jti), out var sessionId))
            return;

        await db.TeacherSessions
            .Where(x => x.Id == sessionId && x.RevokedAt == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.RevokedAt, clock.GetUtcNow()), cancellationToken);
    }
}

public sealed class TeacherTokenIssuer(JwtOptions options)
{
    public int LifetimeMinutes => options.LifetimeMinutes;

    public TeacherLoginResponse Issue(TeacherSession session, WorkspaceMembership membership)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, membership.TeacherUserId.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, session.Id.ToString()),
            new Claim("workspace_id", membership.WorkspaceId.ToString()),
            new Claim("membership_id", membership.Id.ToString()),
            new Claim("role", "teacher"),
            new Claim("workspace_role", membership.Role)
        };
        var token = new JwtSecurityToken(
            issuer: options.Issuer, audience: options.Audience,
            claims: claims,
            notBefore: session.CreatedAt.UtcDateTime,
            expires: session.ExpiresAt.UtcDateTime,
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Convert.FromBase64String(options.SigningKey)),
                SecurityAlgorithms.HmacSha256));
        return new TeacherLoginResponse(
            new JwtSecurityTokenHandler().WriteToken(token), "Bearer", session.ExpiresAt,
            membership.TeacherUserId, membership.WorkspaceId, membership.Role);
    }
}

public sealed class ActiveTeacherSessionRequirement : IAuthorizationRequirement { }

public sealed class ActiveTeacherSessionHandler(PlatformDbContext db, TimeProvider clock)
    : AuthorizationHandler<ActiveTeacherSessionRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context, ActiveTeacherSessionRequirement requirement)
    {
        if (!Guid.TryParse(context.User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var teacherId) ||
            !Guid.TryParse(context.User.FindFirstValue(JwtRegisteredClaimNames.Jti), out var sessionId) ||
            !Guid.TryParse(context.User.FindFirstValue("workspace_id"), out var workspaceId) ||
            !Guid.TryParse(context.User.FindFirstValue("membership_id"), out var membershipId))
            return;

        var scopedRole = context.User.FindFirstValue("workspace_role");
        var active = await db.TeacherSessions.AsNoTracking().AnyAsync(s =>
            s.Id == sessionId && s.MembershipId == membershipId &&
            s.RevokedAt == null && s.ExpiresAt > clock.GetUtcNow() &&
            s.Membership.TeacherUserId == teacherId &&
            s.Membership.WorkspaceId == workspaceId &&
            s.Membership.IsActive && s.Membership.TeacherUser.IsActive &&
            s.Membership.Workspace.IsActive &&
            s.Membership.Role == scopedRole &&
            (s.Membership.Role == "owner" || s.Membership.Role == "teacher"));

        if (active) context.Succeed(requirement);
    }
}
