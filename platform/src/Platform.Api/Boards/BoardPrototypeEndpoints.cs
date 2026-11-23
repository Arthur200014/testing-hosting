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
        long iat, long exp, string jti, string member, string authRole, string session, string workspaceRole, Guid lesson, Guid? independentBoard = null, Guid? grant = null, Guid? classId = null, string? classKind = null);

    public static void Map(WebApplication app)
    {
        if (!app.Configuration.GetValue<bool>("BoardPrototype:Enabled")) return;
        var pilot = app.Services.GetRequiredService<HostedBoardPilot>();
        var hostedPilot = pilot.Enabled ? pilot : null;
        Guid? stagingWorkspace = null;
        if (app.Environment.IsStaging())
        {
            if (!Guid.TryParse(app.Configuration["BoardPrototype:StagingWorkspaceId"], out var workspace)
                || workspace == Guid.Empty)
                throw new InvalidOperationException("A dedicated board staging workspace is required.");
            stagingWorkspace = workspace;
        }
        else if (hostedPilot is null && !app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("IntegrationTests"))
            throw new InvalidOperationException("Board prototype requires an isolated development or staging environment.");
        var key = Convert.FromBase64String(app.Configuration["BoardPrototype:SigningKey"] ?? "");
        var sceneRoot = Convert.FromBase64String(app.Configuration["BoardPrototype:SceneRootKey"] ?? "");
        var apiKey = Convert.FromBase64String(app.Configuration["Jwt:SigningKey"] ?? "");
        if (key.Length < 32 || sceneRoot.Length < 32
            || CryptographicOperations.FixedTimeEquals(key, apiKey)
            || CryptographicOperations.FixedTimeEquals(sceneRoot, apiKey)
            || CryptographicOperations.FixedTimeEquals(sceneRoot, key))
            throw new InvalidOperationException("Distinct board signing, scene-root and API keys required.");
        // Short lifetimes exercise real expiry/reconnect in the isolated integration runner.
        var lifetime = app.Configuration.GetValue<int?>("BoardPrototype:PermitLifetimeSeconds") ?? 120;
        if (lifetime is < 5 or > 120) throw new InvalidOperationException("Board permit lifetime must be 5–120 seconds.");
        RouteGroupBuilder BoardRoutes(string role)
        {
            var routes = app.MapGroup((hostedPilot is null ? "" : HostedBoardPilot.Prefix)
                + "/api/v1/" + role + "/board-prototype").RequireAuthorization(role);
            if (stagingWorkspace.HasValue)
                routes.AddEndpointFilter((context, next) =>
                {
                    context.HttpContext.Response.Headers.CacheControl = "no-store";
                    return WorkspaceAllowed(context.HttpContext.User.FindFirstValue("workspace_id"))
                        ? next(context) : ValueTask.FromResult<object?>(Results.NotFound());
                });
            return routes;
        }

        bool WorkspaceAllowed(string? workspaceId) => !stagingWorkspace.HasValue
            || (Guid.TryParse(workspaceId, out var workspace) && workspace == stagingWorkspace.Value);

        var teacherRoutes = BoardRoutes("teacher");
        var studentRoutes = BoardRoutes("student");
        foreach (var (routes, policy) in new[] { (teacherRoutes, "teacher"), (studentRoutes, "student") })
        {
            routes.MapGet("/classes", async (ClaimsPrincipal principal, PlatformDbContext db, CancellationToken ct) =>
                Results.Ok(await ClassBoardAccess.ListAsync(principal, policy, db, ct)));
            routes.MapPost("/classes/{kind}/{classId:guid}/permit", async (string kind, Guid classId,
                ClaimsPrincipal principal, PlatformDbContext db, TimeProvider clock, HttpContext http, CancellationToken ct) =>
            {
                http.Response.Headers.CacheControl = "no-store";
                if (!await ClassBoardAccess.CanAccessAsync(principal, policy, kind, classId, db, ct)) return Results.NotFound();
                return Issue(principal, policy, Guid.Empty, null, clock, classId:classId, classKind:kind);
            });
            routes.MapPost("/lessons/{lessonId:guid}/permit",
                async (Guid lessonId, ClaimsPrincipal principal, PlatformDbContext db, TimeProvider clock, HttpContext http, CancellationToken ct) =>
                {
                    http.Response.Headers.CacheControl = "no-store";
                    if (!await CanAccess(principal, policy, lessonId, db, ct)) return Results.NotFound();
                    return Issue(principal, policy, lessonId, null, clock);
                });
        }
        IndependentBoardEndpoints.Map(teacherRoutes,
            async (Guid boardId, ClaimsPrincipal principal, PlatformDbContext db, TimeProvider clock, HttpContext http, CancellationToken ct) =>
            {
                http.Response.Headers.CacheControl = "no-store";
                if (!await IndependentBoardEndpoints.OwnsAsync(principal, boardId, db, ct)) return Results.NotFound();
                return Issue(principal, "teacher", Guid.Empty, boardId, clock);
            });
        IndependentBoardSharing.Map(teacherRoutes, studentRoutes,
            async (Guid boardId, ClaimsPrincipal principal, PlatformDbContext db, TimeProvider clock, HttpContext http, CancellationToken ct) =>
            {
                http.Response.Headers.CacheControl = "no-store";
                var shared = await IndependentBoardSharing.Granted(db, principal).SingleOrDefaultAsync(x => x.BoardId == boardId, ct);
                if (shared is null) return Results.NotFound();
                return Issue(principal, "student", Guid.Empty, boardId, clock, shared.GrantId, shared.Role);
            });
        IResult Issue(ClaimsPrincipal principal, string policy, Guid lessonId, Guid? boardId, TimeProvider clock, Guid? grant = null, string role = "editor", Guid? classId = null, string? classKind = null)
        {
            var now = clock.GetUtcNow().ToUnixTimeSeconds();
            if (!long.TryParse(principal.FindFirstValue("exp"), out var authExpiry) || authExpiry <= now) return Results.Unauthorized();
            var workspace = Guid.Parse(principal.FindFirstValue("workspace_id")!);
            var user = Guid.Parse(principal.FindFirstValue("sub")!);
            var room = classId.HasValue ? "class-" + classKind + "-" + classId.Value.ToString("N") : boardId.HasValue ? "board-" + boardId.Value.ToString("N") : "lesson-" + lessonId.ToString("N");
            var claims = new Permit(workspace.ToString("N"), room, user.ToString("N"),
                role, "tas-board-prototype", now, Math.Min(now + lifetime, authExpiry), Guid.NewGuid().ToString("N"),
                principal.FindFirstValue("membership_id")!, policy, principal.FindFirstValue("jti") ?? "",
                principal.FindFirstValue("workspace_role") ?? "", lessonId, boardId, grant, classId, classKind);
            var body = Base64Url(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(claims)));
            var token = body + "." + Base64Url(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(body)));
            var context = Encoding.UTF8.GetBytes("tas-board-scene:v1\n" + claims.workspace + "\n" + claims.board);
            var sceneKey = Convert.ToBase64String(HMACSHA256.HashData(sceneRoot, context));
            return Results.Ok(new { token, claims.workspace, claims.board, expiresAt = claims.exp, sceneKey, keyVersion = 1, role });
        }
        // A valid room permit is the credential here, never an API JWT or a key in a URL.
        // Feature/environment guards above apply to this route too. Nothing is cached.
        app.MapPost("/api/v1/board-prototype/access", async (AccessRequest request, PlatformDbContext db,
            TimeProvider clock, IAuthorizationService authorization, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            if (hostedPilot is not null && !hostedPilot.IsRelay(http)) return Results.NotFound();
            var permit = ReadPermit(key, request.Token, clock.GetUtcNow().ToUnixTimeSeconds());
            if (permit is null || !WorkspaceAllowed(permit.workspace)) return Results.NotFound();
            var principal = new ClaimsPrincipal(new ClaimsIdentity(new[] {
                new Claim("sub", permit.user), new Claim("workspace_id", permit.workspace),
                new Claim("membership_id", permit.member), new Claim("role", permit.authRole),
                new Claim("jti", permit.session), new Claim("workspace_role", permit.workspaceRole)
            }, "board-permit"));
            if (!(await authorization.AuthorizeAsync(principal, null, permit.authRole)).Succeeded
                || !(permit.classId is Guid classId
                    ? await ClassBoardAccess.CanAccessAsync(principal, permit.authRole, permit.classKind ?? "", classId, db, ct)
                    : permit.independentBoard is Guid board
                    ? (permit.authRole == "teacher"
                        ? await IndependentBoardEndpoints.OwnsAsync(principal, board, db, ct)
                        : await IndependentBoardSharing.Granted(db, principal).AnyAsync(x => x.BoardId == board && x.GrantId == permit.grant && x.Role == permit.role, ct))
                    : await CanAccess(principal, permit.authRole, permit.lesson, db, ct))) return Results.NotFound();
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
            if (c is null || c.aud != "tas-board-prototype" || c.role is not ("editor" or "viewer")
                || c.session is null || c.workspaceRole is null
                || c.authRole is not ("teacher" or "student") || c.iat > now || c.exp <= now || c.exp <= c.iat || c.exp - c.iat > 120
                || !Guid.TryParse(c.workspace, out _) || !Guid.TryParse(c.user, out _) || !Guid.TryParse(c.member, out _)
                || !Guid.TryParse(c.jti, out _)
                || (c.classId is Guid classId
                    ? classId == Guid.Empty || c.classKind is not ("individual" or "group") || c.lesson != Guid.Empty || c.independentBoard != null ||
                        c.grant != null || c.role != "editor" || c.board != "class-" + c.classKind + "-" + classId.ToString("N")
                    : c.independentBoard is Guid board
                    ? board == Guid.Empty || c.lesson != Guid.Empty || c.board != "board-" + board.ToString("N")
                        || (c.authRole == "teacher" ? c.grant != null || c.role != "editor" : c.grant is null || c.grant == Guid.Empty)
                    : c.role != "editor" || c.grant != null || c.lesson == Guid.Empty || c.board != "lesson-" + c.lesson.ToString("N"))
                || (c.authRole == "teacher" && !Guid.TryParse(c.session, out _))) return null;
            return c;
        }
        catch (Exception e) when (e is FormatException or JsonException or ArgumentException) { return null; }
    }
    private static async Task<bool> CanAccess(ClaimsPrincipal principal, string role, Guid lessonId, PlatformDbContext db, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("workspace_id"), out var workspace)
            || !Guid.TryParse(principal.FindFirstValue("sub"), out var user)) return false;
        if (role is not ("teacher" or "student")) return false;
        var student = role == "student";
        var membership = Guid.Empty;
        if (student && !Guid.TryParse(principal.FindFirstValue("membership_id"), out membership)) return false;
        // One fresh, parameterized SQL snapshot per check; no authorization cache.
        // Preserve every workspace/class/participant/enrollment predicate while
        // avoiding six sequential round trips on each live student validation.
        return await db.Lessons.AsNoTracking().AnyAsync(lesson =>
            lesson.WorkspaceId == workspace && lesson.Id == lessonId &&
            db.Workspaces.Any(x => x.Id == workspace && x.IsActive) &&
            (lesson.IndividualClassId == null || db.TeacherClasses.Any(x =>
                x.WorkspaceId == workspace && x.Id == lesson.IndividualClassId && !x.IsArchived)) &&
            (lesson.GroupClassId == null || db.TeacherGroupClasses.Any(x =>
                x.WorkspaceId == workspace && x.Id == lesson.GroupClassId && !x.IsArchived)) &&
            (!student ||
                db.WorkspaceStudentMemberships.Any(x => x.Id == membership && x.WorkspaceId == workspace && x.StudentId == user && x.IsActive) &&
                db.LessonParticipants.Any(x => x.WorkspaceId == workspace && x.LessonId == lesson.Id && x.MembershipId == membership && x.StudentId == user) &&
                (lesson.GroupClassId == null || db.TeacherGroupEnrollments.Any(x =>
                    x.WorkspaceId == workspace && x.GroupClassId == lesson.GroupClassId && x.MembershipId == membership && x.IsApproved))), ct);
    }
    private static string Base64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
