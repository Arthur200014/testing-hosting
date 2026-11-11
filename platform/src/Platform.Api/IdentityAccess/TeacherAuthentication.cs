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

        var now = clock.GetUtcNow();
        var session = new TeacherSession
        {
            Id = Guid.NewGuid(), MembershipId = membership.Id,
            CreatedAt = now, ExpiresAt = now.AddMinutes(tokens.LifetimeMinutes)
        };
        db.TeacherSessions.Add(session);
        await db.SaveChangesAsync(cancellationToken);
        return tokens.Issue(session, membership);
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

public sealed class ActiveTeacherSessionRequirement : IAuthorizationRequirement;

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

        var active = await db.TeacherSessions.AsNoTracking().AnyAsync(s =>
            s.Id == sessionId && s.MembershipId == membershipId &&
            s.RevokedAt == null && s.ExpiresAt > clock.GetUtcNow() &&
            s.Membership.TeacherUserId == teacherId &&
            s.Membership.WorkspaceId == workspaceId &&
            s.Membership.IsActive && s.Membership.TeacherUser.IsActive &&
            s.Membership.Workspace.IsActive &&
            (s.Membership.Role == "owner" || s.Membership.Role == "teacher"));

        if (active) context.Succeed(requirement);
    }
}
