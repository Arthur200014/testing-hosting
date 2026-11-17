using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Boards;

public static class BoardPrototypeEndpoints
{
    public sealed record AccessRequest(string? Token);
    private sealed record Permit(string workspace, string board, string user, string role, string aud,
        long iat, long exp, string jti, string member, string authRole, string session, string workspaceRole, Guid lesson);

    public static void Map(WebApplication app)
    {
        if (!app.Configuration.GetValue<bool>("BoardPrototype:Enabled")) return;
        if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("IntegrationTests"))
            throw new InvalidOperationException("Board prototype requires an isolated development environment.");
        var key = Convert.FromBase64String(app.Configuration["BoardPrototype:SigningKey"] ?? "");
        var sceneRoot = Convert.FromBase64String(app.Configuration["BoardPrototype:SceneRootKey"] ?? "");
        var apiKey = Convert.FromBase64String(app.Configuration["Jwt:SigningKey"] ?? "");
        if (key.Length < 32 || sceneRoot.Length < 32
            || CryptographicOperations.FixedTimeEquals(key, apiKey)
            || CryptographicOperations.FixedTimeEquals(sceneRoot, apiKey)
            || CryptographicOperations.FixedTimeEquals(sceneRoot, key))
            throw new InvalidOperationException("Distinct board signing, scene-root and API keys required.");
        foreach (var role in new[] { "teacher", "student" })
        {
            var policy = role;
            app.MapPost("/api/v1/" + policy + "/board-prototype/lessons/{lessonId:guid}/permit",
                async (Guid lessonId, ClaimsPrincipal principal, PlatformDbContext db, TimeProvider clock, HttpContext http, CancellationToken ct) =>
                {
                    http.Response.Headers.CacheControl = "no-store";
                    if (!await CanAccess(principal, policy, lessonId, db, ct)) return Results.NotFound();
                    var now = clock.GetUtcNow().ToUnixTimeSeconds();
                    if (!long.TryParse(principal.FindFirstValue("exp"), out var authExpiry) || authExpiry <= now) return Results.Unauthorized();
                    var workspace = Guid.Parse(principal.FindFirstValue("workspace_id")!);
                    var user = Guid.Parse(principal.FindFirstValue("sub")!);
                    var claims = new Permit(workspace.ToString("N"), "lesson-" + lessonId.ToString("N"), user.ToString("N"),
                        "editor", "tas-board-prototype", now, Math.Min(now + 120, authExpiry), Guid.NewGuid().ToString("N"),
                        principal.FindFirstValue("membership_id")!, policy, principal.FindFirstValue("jti") ?? "",
                        principal.FindFirstValue("workspace_role") ?? "", lessonId);
                    var body = Base64Url(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(claims)));
                    var token = body + "." + Base64Url(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(body)));
                    // Stable, domain-separated per-workspace/lesson key. Never put it in the permit/relay.
                    var context = Encoding.UTF8.GetBytes("tas-board-scene:v1\n" + claims.workspace + "\n" + claims.board);
                    var sceneKey = Convert.ToBase64String(HMACSHA256.HashData(sceneRoot, context));
                    return Results.Ok(new { token, claims.workspace, claims.board, expiresAt = claims.exp, sceneKey, keyVersion = 1 });
                }).RequireAuthorization(policy);
        }
        // A valid room permit is the credential here, never an API JWT or a key in a URL.
        // Feature/environment guards above apply to this route too. Nothing is cached.
        app.MapPost("/api/v1/board-prototype/access", async (AccessRequest request, PlatformDbContext db,
            TimeProvider clock, IAuthorizationService authorization, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            var permit = ReadPermit(key, request.Token, clock.GetUtcNow().ToUnixTimeSeconds());
            if (permit is null) return Results.NotFound();
            var principal = new ClaimsPrincipal(new ClaimsIdentity(new[] {
                new Claim("sub", permit.user), new Claim("workspace_id", permit.workspace),
                new Claim("membership_id", permit.member), new Claim("role", permit.authRole),
                new Claim("jti", permit.session), new Claim("workspace_role", permit.workspaceRole)
            }, "board-permit"));
            if (!(await authorization.AuthorizeAsync(principal, null, permit.authRole)).Succeeded
                || !await CanAccess(principal, permit.authRole, permit.lesson, db, ct)) return Results.NotFound();
            return Results.NoContent();
        });
    }
    private static Permit? ReadPermit(byte[] key, string? token, long now)
    {
        if (token is null || token.Length > 2048) return null;
        var parts = token.Split('.');
        if (parts.Length != 2) return null;
        try
        {
            var expected = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(parts[0]));
            if (!CryptographicOperations.FixedTimeEquals(expected, Base64UrlEncoder.DecodeBytes(parts[1]))) return null;
            var c = JsonSerializer.Deserialize<Permit>(Base64UrlEncoder.DecodeBytes(parts[0]));
            if (c is null || c.aud != "tas-board-prototype" || c.role != "editor"
                || c.session is null || c.workspaceRole is null
                || c.authRole is not ("teacher" or "student") || c.iat > now || c.exp <= now || c.exp <= c.iat || c.exp - c.iat > 120
                || !Guid.TryParse(c.workspace, out _) || !Guid.TryParse(c.user, out _) || !Guid.TryParse(c.member, out _)
                || !Guid.TryParse(c.jti, out _) || c.lesson == Guid.Empty || c.board != "lesson-" + c.lesson.ToString("N")
                || (c.authRole == "teacher" && !Guid.TryParse(c.session, out _))) return null;
            return c;
        }
        catch (Exception e) when (e is FormatException or JsonException or ArgumentException) { return null; }
    }
    private static async Task<bool> CanAccess(ClaimsPrincipal principal, string role, Guid lessonId, PlatformDbContext db, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("workspace_id"), out var workspace)
            || !Guid.TryParse(principal.FindFirstValue("sub"), out var user)) return false;
        if (!await db.Workspaces.AnyAsync(x => x.Id == workspace && x.IsActive, ct)) return false;
        var lesson = await db.Lessons.AsNoTracking().Where(x => x.WorkspaceId == workspace && x.Id == lessonId)
            .Select(x => new { x.IndividualClassId, x.GroupClassId }).SingleOrDefaultAsync(ct);
        if (lesson is null) return false;
        if (lesson.IndividualClassId is Guid individual && !await db.TeacherClasses.AnyAsync(x => x.WorkspaceId == workspace && x.Id == individual && !x.IsArchived, ct)) return false;
        if (lesson.GroupClassId is Guid group && !await db.TeacherGroupClasses.AnyAsync(x => x.WorkspaceId == workspace && x.Id == group && !x.IsArchived, ct)) return false;
        if (role == "student")
        {
            if (!Guid.TryParse(principal.FindFirstValue("membership_id"), out var membership)
                || !await db.WorkspaceStudentMemberships.AnyAsync(x => x.Id == membership && x.WorkspaceId == workspace && x.StudentId == user && x.IsActive, ct)
                || !await db.LessonParticipants.AnyAsync(x => x.WorkspaceId == workspace && x.LessonId == lessonId && x.MembershipId == membership && x.StudentId == user, ct)) return false;
            if (lesson.GroupClassId is Guid groupId && !await db.TeacherGroupEnrollments.AnyAsync(x => x.WorkspaceId == workspace && x.GroupClassId == groupId && x.MembershipId == membership && x.IsApproved, ct)) return false;
        }
        return true;
    }
    private static string Base64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
