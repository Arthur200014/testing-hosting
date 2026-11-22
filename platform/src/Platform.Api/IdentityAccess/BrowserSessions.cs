using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TestingHosting.Platform.Configuration;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.StudentSessions;

namespace TestingHosting.Platform.IdentityAccess;

public sealed class BrowserSessions(PlatformDbContext db, JwtOptions options, TimeProvider clock,
    TeacherTokenIssuer teachers, StudentTokenIssuer students, IWebHostEnvironment environment)
{
    public const int LifetimeDays = 14;
    private const string AudienceSuffix = ":browser-session:v1";
    private static string Name(string role) => "tas_" + role + "_session";
    private CookieOptions Cookie(string role, HttpContext http) => new()
    {
        HttpOnly = true, Secure = environment.IsProduction() || http.Request.IsHttps, SameSite = SameSiteMode.Strict,
        Path = "/api/v1/" + role + "-sessions", Expires = clock.GetUtcNow().AddDays(LifetimeDays)
    };
    public void Clear(HttpContext http, string role) => http.Response.Cookies.Delete(Name(role), Cookie(role, http));

    private void Write(HttpContext http, string role, IEnumerable<Claim> claims)
    {
        var jwt = new JwtSecurityToken(options.Issuer, options.Audience + AudienceSuffix, claims,
            clock.GetUtcNow().UtcDateTime, clock.GetUtcNow().AddDays(LifetimeDays).UtcDateTime,
            new SigningCredentials(new SymmetricSecurityKey(Convert.FromBase64String(options.SigningKey)), SecurityAlgorithms.HmacSha256));
        http.Response.Cookies.Append(Name(role), new JwtSecurityTokenHandler().WriteToken(jwt), Cookie(role, http));
    }
    public void WriteTeacher(HttpContext http, TeacherLoginResponse session)
    {
        Write(http, "teacher", new[] {
            new Claim("role", "teacher"), new Claim("session_id", new JwtSecurityTokenHandler().ReadJwtToken(session.AccessToken).Id),
            new Claim("membership_id", new JwtSecurityTokenHandler().ReadJwtToken(session.AccessToken).Claims.Single(c => c.Type == "membership_id").Value),
            new Claim("workspace_role", session.WorkspaceRole)
        });
    }
    public async Task WriteStudentAsync(HttpContext http, StudentSessionIdentity identity, CancellationToken ct)
    {
        var hash = await db.WorkspaceStudentMemberships.Where(x => x.Id == identity.MembershipId).Select(x => x.CodeHash).SingleAsync(ct);
        var session = Guid.NewGuid();
        var expires = clock.GetUtcNow().AddDays(LifetimeDays);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO platform."StudentBrowserSessions" ("Id", "MembershipId", "ExpiresAt")
            VALUES ({session}, {identity.MembershipId}, {expires})
            """, ct);
        Write(http, "student", new[] { new Claim("role", "student"), new Claim("session_id", session.ToString()), new Claim("membership_id", identity.MembershipId.ToString()),
            new Claim("credential_stamp", Stamp(hash)) });
    }
    private static string Stamp(byte[] hash) => Convert.ToHexString(SHA256.HashData(hash));
    private ClaimsPrincipal? Read(HttpContext http, string role)
    {
        if (!http.Request.Cookies.TryGetValue(Name(role), out var cookie)) return null;
        try
        {
            var handler = new JwtSecurityTokenHandler { MapInboundClaims = false };
            var principal = handler.ValidateToken(cookie, new TokenValidationParameters {
                ValidateIssuer = true, ValidIssuer = options.Issuer,
                ValidateAudience = true, ValidAudience = options.Audience + AudienceSuffix,
                ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Convert.FromBase64String(options.SigningKey)),
                ValidAlgorithms = [SecurityAlgorithms.HmacSha256], ValidateLifetime = true,
                LifetimeValidator = (start, end, _, _) => end.HasValue && end.Value > clock.GetUtcNow().UtcDateTime &&
                    (!start.HasValue || start.Value <= clock.GetUtcNow().UtcDateTime), ClockSkew = TimeSpan.Zero
            }, out _);
            return principal.FindFirstValue("role") == role ? principal : null;
        }
        catch (Exception e) when (e is SecurityTokenException or ArgumentException) { return null; }
    }
    public async Task<TeacherLoginResponse?> RestoreTeacherAsync(HttpContext http, CancellationToken ct)
    {
        var principal = Read(http, "teacher");
        if (principal is null || !Guid.TryParse(principal.FindFirstValue("session_id"), out var id) ||
            !Guid.TryParse(principal.FindFirstValue("membership_id"), out var membership)) return null;
        var role = principal.FindFirstValue("workspace_role");
        var session = await db.TeacherSessions.AsNoTracking().Include(x => x.Membership).ThenInclude(x => x.Workspace)
            .Where(x => x.Id == id && x.MembershipId == membership && x.RevokedAt == null && x.ExpiresAt > clock.GetUtcNow() &&
                x.Membership.IsActive && x.Membership.Workspace.IsActive && x.Membership.TeacherUser.IsActive &&
                x.Membership.Role == role && (role == "teacher" || role == "owner")).SingleOrDefaultAsync(ct);
        return session is null ? null : teachers.Issue(session, session.Membership);
    }
    public async Task<StudentSessionResponse?> RestoreStudentAsync(HttpContext http, CancellationToken ct)
    {
        var principal = Read(http, "student");
        if (principal is null || !Guid.TryParse(principal.FindFirstValue("membership_id"), out var id)) return null;
        if (!Guid.TryParse(principal.FindFirstValue("session_id"), out var session)) return null;
        var now = clock.GetUtcNow();
        var active = await db.Database.SqlQuery<bool>($"""
            SELECT EXISTS (SELECT 1 FROM platform."StudentBrowserSessions" WHERE "Id"={session}
                AND "MembershipId"={id} AND "RevokedAt" IS NULL AND "ExpiresAt">{now}) AS "Value"
            """).SingleAsync(ct);
        if (!active) return null;
        var row = await db.WorkspaceStudentMemberships.AsNoTracking().Where(x => x.Id == id && x.IsActive &&
            x.Workspace.IsActive && x.Program.IsActive && x.Student.IsActive)
            .Select(x => new {x.CodeHash, Identity = new StudentSessionIdentity(x.Id, x.StudentId, x.Student.DisplayName, x.Program.Code, x.WorkspaceId)})
            .SingleOrDefaultAsync(ct);
        return row is null || principal!.FindFirstValue("credential_stamp") != Stamp(row.CodeHash) ? null : students.Issue(row.Identity);
    }
    public async Task RevokeStudentAsync(HttpContext http, CancellationToken ct)
    {
        var principal = Read(http, "student");
        if (!Guid.TryParse(principal?.FindFirstValue("session_id"), out var session)) return;
        var now = clock.GetUtcNow();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE platform."StudentBrowserSessions" SET "RevokedAt"={now}
            WHERE "Id"={session} AND "RevokedAt" IS NULL
            """, ct);
    }

}
