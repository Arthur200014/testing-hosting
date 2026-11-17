using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Boards;

public static class BoardPrototypeEndpoints
{
    public static void Map(WebApplication app)
    {
        if (!app.Configuration.GetValue<bool>("BoardPrototype:Enabled")) return;
        // The prototype can never register endpoints in a production environment.
        if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("IntegrationTests"))
            throw new InvalidOperationException("Board prototype requires an isolated development environment.");
        var key = Convert.FromBase64String(app.Configuration["BoardPrototype:SigningKey"] ?? "");
        if (key.Length < 32 || app.Configuration["BoardPrototype:SigningKey"] == app.Configuration["Jwt:SigningKey"])
            throw new InvalidOperationException("Dedicated board signing key required.");
        foreach (var role in new[] { "teacher", "student" })
        {
            var policy = role;
            app.MapPost("/api/v1/" + policy + "/board-prototype/lessons/{lessonId:guid}/permit",
                async (Guid lessonId, ClaimsPrincipal principal, PlatformDbContext db, TimeProvider clock, HttpContext http, CancellationToken ct) =>
                {
                    if (!Guid.TryParse(principal.FindFirstValue("workspace_id"), out var workspace)
                        || !Guid.TryParse(principal.FindFirstValue("sub"), out var user)) return Results.Unauthorized();
                    var lesson = await db.Lessons.AsNoTracking().Where(x => x.WorkspaceId == workspace && x.Id == lessonId)
                        .Select(x => new { x.IndividualClassId, x.GroupClassId }).SingleOrDefaultAsync(ct);
                    if (lesson is null) return Results.NotFound();
                    if (lesson.IndividualClassId is Guid individual && !await db.TeacherClasses.AnyAsync(x => x.WorkspaceId == workspace && x.Id == individual && !x.IsArchived, ct))
                        return Results.NotFound();
                    if (lesson.GroupClassId is Guid group && !await db.TeacherGroupClasses.AnyAsync(x => x.WorkspaceId == workspace && x.Id == group && !x.IsArchived, ct))
                        return Results.NotFound();
                    if (policy == "student")
                    {
                        if (!Guid.TryParse(principal.FindFirstValue("membership_id"), out var membership)
                            || !await db.WorkspaceStudentMemberships.AnyAsync(x => x.Id == membership && x.WorkspaceId == workspace && x.StudentId == user && x.IsActive, ct)
                            || !await db.LessonParticipants.AnyAsync(x => x.WorkspaceId == workspace && x.LessonId == lessonId && x.MembershipId == membership && x.StudentId == user, ct))
                            return Results.NotFound();
                        if (lesson.GroupClassId is Guid groupId && !await db.TeacherGroupEnrollments.AnyAsync(x => x.WorkspaceId == workspace && x.GroupClassId == groupId && x.MembershipId == membership && x.IsApproved, ct))
                            return Results.NotFound();
                    }
                    var now = clock.GetUtcNow().ToUnixTimeSeconds();
                    var claims = new { workspace = workspace.ToString("N"), board = "lesson-" + lessonId.ToString("N"),
                        user = user.ToString("N"), role = "editor", aud = "tas-board-prototype", iat = now, exp = now + 120, jti = Guid.NewGuid().ToString("N") };
                    var body = Base64Url(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(claims)));
                    var token = body + "." + Base64Url(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(body)));
                    http.Response.Headers.CacheControl = "no-store";
                    return Results.Ok(new { token, claims.workspace, claims.board, expiresAt = claims.exp });
                }).RequireAuthorization(policy);
        }
    }
    private static string Base64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
