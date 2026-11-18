using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Boards;

internal static class IndependentBoardSharing
{
    public sealed record SharedBoard(Guid BoardId, string Title, Guid GrantId);

    public static void Map(WebApplication app, Delegate permit)
    {
        var roster = app.MapGroup("/api/v1/teacher/board-prototype/boards/{boardId:guid}/members").RequireAuthorization("teacher");
        roster.MapGet("", async (Guid boardId, ClaimsPrincipal principal, PlatformDbContext db, CancellationToken ct) =>
        {
            if (!await IndependentBoardEndpoints.OwnsAsync(principal, boardId, db, ct)) return Results.NotFound();
            return Results.Ok(await db.Database.SqlQuery<Guid>($"""
                SELECT g."MembershipId" AS "Value" FROM platform."IndependentBoardGrants" g
                WHERE g."BoardId"={boardId}
                """).ToListAsync(ct));
        });

        roster.MapPut("/{membershipId:guid}", async (Guid boardId, Guid membershipId, ClaimsPrincipal principal,
            PlatformDbContext db, CancellationToken ct) =>
        {
            if (!await IndependentBoardEndpoints.OwnsAsync(principal, boardId, db, ct)) return Results.NotFound();
            var workspace = Guid.Parse(principal.FindFirstValue("workspace_id")!);
            if (!await db.WorkspaceStudentMemberships.AnyAsync(x => x.Id == membershipId && x.WorkspaceId == workspace && x.IsActive, ct))
                return Results.NotFound();
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO platform."IndependentBoardGrants" ("BoardId","MembershipId","GrantId")
                VALUES ({boardId},{membershipId},{Guid.NewGuid()})
                ON CONFLICT ("BoardId","MembershipId") DO NOTHING
                """, ct);
            return Results.NoContent();
        });

        roster.MapDelete("/{membershipId:guid}", async (Guid boardId, Guid membershipId, ClaimsPrincipal principal,
            PlatformDbContext db, CancellationToken ct) =>
        {
            if (!await IndependentBoardEndpoints.OwnsAsync(principal, boardId, db, ct)) return Results.NotFound();
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                DELETE FROM platform."IndependentBoardGrants" WHERE "BoardId"={boardId} AND "MembershipId"={membershipId}
                """, ct);
            return Results.NoContent();
        });

        var student = app.MapGroup("/api/v1/student/board-prototype/boards").RequireAuthorization("student");
        student.MapGet("", async (ClaimsPrincipal principal, PlatformDbContext db, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            var boards = await Granted(db, principal).OrderBy(x => x.Title).ThenBy(x => x.BoardId)
                .Select(x => new { id = x.BoardId, x.Title }).ToListAsync(ct);
            return Results.Ok(boards);
        });
        student.MapPost("/{boardId:guid}/permit", permit);
    }

    public static IQueryable<SharedBoard> Granted(PlatformDbContext db, ClaimsPrincipal principal)
    {
        Guid.TryParse(principal.FindFirstValue("workspace_id"), out var workspace);
        Guid.TryParse(principal.FindFirstValue("membership_id"), out var membership);
        Guid.TryParse(principal.FindFirstValue("sub"), out var student);
        return db.Database.SqlQuery<SharedBoard>($"""
            SELECT b."Id" AS "BoardId", b."Title", g."GrantId"
            FROM platform."IndependentBoards" b
            JOIN platform."IndependentBoardGrants" g ON g."BoardId"=b."Id"
            JOIN platform."WorkspaceStudentMemberships" m ON m."Id"=g."MembershipId" AND m."WorkspaceId"=b."WorkspaceId"
            JOIN platform."Workspaces" w ON w."Id"=b."WorkspaceId" AND w."IsActive"
            WHERE b."WorkspaceId"={workspace} AND m."Id"={membership} AND m."StudentId"={student} AND m."IsActive"
            """);
    }
}
