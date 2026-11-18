using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Boards;

internal static class IndependentBoardEndpoints
{
    public sealed record BoardInput(string? Title, Guid? IndividualClassId, Guid? GroupClassId, Guid? LessonId);
    public sealed record BoardRow(Guid Id, string Title, Guid? IndividualClassId, Guid? GroupClassId, Guid? LessonId, DateTimeOffset UpdatedAt);

    public static void Map(WebApplication app, Delegate permit)
    {
        var routes = app.MapGroup("/api/v1/teacher/board-prototype/boards").RequireAuthorization("teacher");

        routes.MapGet("", async (ClaimsPrincipal principal, PlatformDbContext db, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            if (!TryScope(principal, out var workspace, out var owner)) return Results.Unauthorized();
            return Results.Ok(await Owned(db, workspace, owner).OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id).ToListAsync(ct));
        });

        routes.MapPut("/{boardId:guid}", async (Guid boardId, BoardInput input, ClaimsPrincipal principal,
            PlatformDbContext db, TimeProvider clock, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-store";
            if (!TryScope(principal, out var workspace, out var owner)) return Results.Unauthorized();
            var title = input.Title?.Trim() ?? "";
            if (boardId == Guid.Empty || title.Length is < 1 or > 120 || title.Any(char.IsControl)
                || (input.IndividualClassId.HasValue && input.GroupClassId.HasValue))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["board"] = ["Укажите название до 120 символов и выберите один класс."] });

            var individual = input.IndividualClassId;
            var group = input.GroupClassId;
            if (input.LessonId is Guid lessonId)
            {
                var lesson = await db.Lessons.AsNoTracking().Where(x => x.WorkspaceId == workspace && x.Id == lessonId)
                    .Select(x => new { x.IndividualClassId, x.GroupClassId }).SingleOrDefaultAsync(ct);
                if (lesson is null) return Results.NotFound();
                if ((individual.HasValue && individual != lesson.IndividualClassId)
                    || (group.HasValue && group != lesson.GroupClassId))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["lesson"] = ["Занятие должно относиться к выбранному классу."] });
                individual = lesson.IndividualClassId;
                group = lesson.GroupClassId;
            }
            if (individual is Guid individualId && !await db.TeacherClasses.AnyAsync(x => x.WorkspaceId == workspace && x.Id == individualId && !x.IsArchived, ct))
                return Results.NotFound();
            if (group is Guid groupId && !await db.TeacherGroupClasses.AnyAsync(x => x.WorkspaceId == workspace && x.Id == groupId && !x.IsArchived, ct))
                return Results.NotFound();

            var updated = clock.GetUtcNow();
            var affected = await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO platform."IndependentBoards" AS b
                    ("Id","WorkspaceId","OwnerId","Title","IndividualClassId","GroupClassId","LessonId","UpdatedAt")
                VALUES ({boardId},{workspace},{owner},{title},CAST({individual} AS uuid),CAST({group} AS uuid),CAST({input.LessonId} AS uuid),{updated})
                ON CONFLICT ("Id") DO UPDATE SET
                    "Title"=EXCLUDED."Title", "IndividualClassId"=EXCLUDED."IndividualClassId",
                    "GroupClassId"=EXCLUDED."GroupClassId", "LessonId"=EXCLUDED."LessonId", "UpdatedAt"=EXCLUDED."UpdatedAt"
                WHERE b."WorkspaceId"=EXCLUDED."WorkspaceId" AND b."OwnerId"=EXCLUDED."OwnerId"
                """, ct);
            return affected == 1 ? Results.Ok(new BoardRow(boardId, title, individual, group, input.LessonId, updated)) : Results.NotFound();
        });

        routes.MapPost("/{boardId:guid}/permit", permit);
    }

    public static Task<bool> OwnsAsync(ClaimsPrincipal principal, Guid boardId, PlatformDbContext db, CancellationToken ct) =>
        TryScope(principal, out var workspace, out var owner)
            ? Owned(db, workspace, owner).AnyAsync(x => x.Id == boardId, ct) : Task.FromResult(false);

    private static IQueryable<BoardRow> Owned(PlatformDbContext db, Guid workspace, Guid owner) =>
        db.Database.SqlQuery<BoardRow>($"""
            SELECT b."Id", b."Title", b."IndividualClassId", b."GroupClassId", b."LessonId", b."UpdatedAt"
            FROM platform."IndependentBoards" b JOIN platform."Workspaces" w ON w."Id"=b."WorkspaceId" AND w."IsActive"
            WHERE b."WorkspaceId"={workspace} AND b."OwnerId"={owner}
            """);

    private static bool TryScope(ClaimsPrincipal principal, out Guid workspace, out Guid owner)
    {
        var hasWorkspace = Guid.TryParse(principal.FindFirstValue("workspace_id"), out workspace);
        return Guid.TryParse(principal.FindFirstValue("sub"), out owner) && hasWorkspace;
    }
}
