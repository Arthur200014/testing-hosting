using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.IdentityAccess;

internal static class TeacherProfileEndpoints
{
    public sealed record ProfileRow(string Email, string Workspace, string Role, string? DisplayName);
    public sealed record UpdateRequest(string? DisplayName);

    public static void Map(WebApplication app)
    {
        var profile = app.MapGroup("/api/v1/teacher/profile").RequireAuthorization("teacher");
        profile.MapGet("", async (ClaimsPrincipal principal, PlatformDbContext db, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            var row = await Current(db, principal).SingleOrDefaultAsync(ct);
            return row is null ? Results.NotFound() : Results.Ok(row);
        });

        profile.MapPut("", async (UpdateRequest input, ClaimsPrincipal principal, PlatformDbContext db, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            var name = input.DisplayName?.Trim() ?? "";
            if (name.Length is < 1 or > 120 || name.Any(char.IsControl))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["displayName"] = ["Введите имя длиной от 1 до 120 символов."] });

            var row = await Current(db, principal).SingleOrDefaultAsync(ct);
            if (row is null) return Results.NotFound();
            var teacher = Guid.Parse(principal.FindFirstValue("sub")!);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO platform."TeacherProfiles" ("TeacherUserId","DisplayName") VALUES ({teacher},{name})
                ON CONFLICT ("TeacherUserId") DO UPDATE SET "DisplayName"=EXCLUDED."DisplayName"
                """, ct);
            return Results.Ok(row with { DisplayName = name });
        });
    }

    private static IQueryable<ProfileRow> Current(PlatformDbContext db, ClaimsPrincipal principal)
    {
        var id = Guid.Parse(principal.FindFirstValue("sub")!);
        var membership = Guid.Parse(principal.FindFirstValue("membership_id")!);
        var workspace = Guid.Parse(principal.FindFirstValue("workspace_id")!);
        return db.Database.SqlQuery<ProfileRow>($"""
            SELECT t."Email", w."Slug" AS "Workspace", m."Role", p."DisplayName"
            FROM platform."WorkspaceMemberships" m
            JOIN platform."TeacherUsers" t ON t."Id"=m."TeacherUserId" AND t."IsActive"
            JOIN platform."Workspaces" w ON w."Id"=m."WorkspaceId" AND w."IsActive"
            LEFT JOIN platform."TeacherProfiles" p ON p."TeacherUserId"=t."Id"
            WHERE t."Id"={id} AND m."Id"={membership} AND w."Id"={workspace} AND m."IsActive"
            """);
    }
}
