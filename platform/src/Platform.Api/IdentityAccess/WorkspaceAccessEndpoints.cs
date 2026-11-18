using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.IdentityAccess;

internal static class WorkspaceAccessEndpoints
{
    public sealed record InvitationRow(Guid Id, string Email, DateTimeOffset ExpiresAt);
    public sealed record MemberRow(Guid Id, string Email, string Role, bool IsActive);
    public sealed record InviteRequest(string? Email);
    public sealed record AcceptRequest(string? Workspace, string? Email, string? Password, string? Code);
    public sealed record InvitationTarget(Guid Id, Guid WorkspaceId, string Email);

    public static void Map(WebApplication app)
    {
        var access = app.MapGroup("/api/v1/teacher/workspace-access").RequireAuthorization("workspace-owner");
        access.AddEndpointFilter(NoStore);
        access.MapGet("", ListAsync);
        access.MapPost("/invitations", InviteAsync);
        access.MapPost("/invitations/{id:guid}/revoke", RevokeInvitationAsync);
        access.MapPost("/members/{id:guid}/revoke", RevokeMemberAsync);

        app.MapPost("/api/v1/teacher-invitation-acceptance", AcceptAsync)
            .AddEndpointFilter(NoStore).RequireRateLimiting("teacher-invitation-acceptance");
    }

    private static ValueTask<object?> NoStore(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        context.HttpContext.Response.Headers.CacheControl = "no-store";
        return next(context);
    }

    private static Guid WorkspaceId(ClaimsPrincipal user) => Guid.Parse(user.FindFirstValue("workspace_id")!);
    private static bool ValidEmail(string email) => email.Length is >= 3 and <= 320 &&
        System.Net.Mail.MailAddress.TryCreate(email, out var parsed) && parsed.Address == email;
    private static IResult Invalid(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });
    private static IResult Conflict(string message) => Results.Conflict(new { title = message });
    private static Task LockEditsAsync(PlatformDbContext db, CancellationToken ct) =>
        db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(8175201964312)", ct);

    private static async Task<IResult> ListAsync(ClaimsPrincipal user, PlatformDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var workspace = WorkspaceId(user);
        var members = await db.WorkspaceMemberships.AsNoTracking().Where(m => m.WorkspaceId == workspace)
            .OrderBy(m => m.Role).ThenBy(m => m.TeacherUser.Email)
            .Select(m => new MemberRow(m.Id, m.TeacherUser.Email, m.Role, m.IsActive && m.TeacherUser.IsActive)).ToListAsync(ct);
        var now = clock.GetUtcNow();
        var invitations = await db.Database.SqlQuery<InvitationRow>($"""
            SELECT "Id", "Email", "ExpiresAt" FROM platform."WorkspaceTeacherInvitations"
            WHERE "WorkspaceId"={workspace} AND "UsedAt" IS NULL AND "RevokedAt" IS NULL AND "ExpiresAt">{now}
            """).OrderBy(i => i.ExpiresAt).ThenBy(i => i.Id).ToListAsync(ct);
        return Results.Ok(new { members, invitations });
    }

    private static async Task<IResult> InviteAsync(InviteRequest input, ClaimsPrincipal user, PlatformDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var email = input.Email?.Trim() ?? "";
        if (!ValidEmail(email)) return Invalid("email", "Введите адрес электронной почты.");
        var normalized = email.ToUpperInvariant();
        var workspace = WorkspaceId(user);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockEditsAsync(db, ct);
        if (await db.WorkspaceMemberships.AnyAsync(m => m.WorkspaceId == workspace &&
            m.TeacherUser.NormalizedEmail == normalized && (m.IsActive || m.Role == "owner"), ct))
            return Conflict("У этого пользователя уже есть доступ.");

        var now = clock.GetUtcNow();
        var id = Guid.NewGuid();
        var expiresAt = now.AddDays(2);
        var secret = RandomNumberGenerator.GetBytes(24);
        var hash = SHA256.HashData(secret);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE platform."WorkspaceTeacherInvitations" SET "RevokedAt"={now}
            WHERE "WorkspaceId"={workspace} AND "NormalizedEmail"={normalized}
                AND "UsedAt" IS NULL AND "RevokedAt" IS NULL AND "ExpiresAt">{now}
            """, ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO platform."WorkspaceTeacherInvitations" ("Id","WorkspaceId","Email","NormalizedEmail","CodeHash","CreatedAt","ExpiresAt")
            VALUES ({id},{workspace},{email},{normalized},{hash},{now},{expiresAt})
            """, ct);
        await transaction.CommitAsync(ct);
        return Results.Json(new { id, email, expiresAt, code = Convert.ToHexString(secret) }, statusCode: 201);
    }

    private static async Task<IResult> RevokeInvitationAsync(Guid id, ClaimsPrincipal user, PlatformDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var workspace = WorkspaceId(user);
        var now = clock.GetUtcNow();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockEditsAsync(db, ct);
        var updated = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE platform."WorkspaceTeacherInvitations" SET "RevokedAt"=COALESCE("RevokedAt",{now})
            WHERE "WorkspaceId"={workspace} AND "Id"={id} AND "UsedAt" IS NULL
            """, ct);
        await transaction.CommitAsync(ct);
        return updated == 1 ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> RevokeMemberAsync(Guid id, ClaimsPrincipal user, PlatformDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var workspace = WorkspaceId(user);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockEditsAsync(db, ct);
        var member = await db.WorkspaceMemberships.Where(m => m.WorkspaceId == workspace && m.Id == id && m.Role == "teacher")
            .Select(m => new { m.TeacherUser.NormalizedEmail }).SingleOrDefaultAsync(ct);
        if (member is null) return Results.NotFound();
        await db.WorkspaceMemberships.Where(m => m.WorkspaceId == workspace && m.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.IsActive, false), ct);
        var now = clock.GetUtcNow();
        await db.TeacherSessions.Where(s => s.MembershipId == id && s.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now), ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE platform."WorkspaceTeacherInvitations" SET "RevokedAt"={now}
            WHERE "WorkspaceId"={workspace} AND "NormalizedEmail"={member.NormalizedEmail} AND "UsedAt" IS NULL AND "RevokedAt" IS NULL
            """, ct);
        await transaction.CommitAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> AcceptAsync(AcceptRequest input, PlatformDbContext db, IStudentCodeHasher normalizer,
        IPasswordHasher<TeacherUser> passwordHasher, TimeProvider clock, CancellationToken ct)
    {
        var email = input.Email?.Trim() ?? "";
        var password = input.Password ?? "";
        var code = input.Code?.Trim() ?? "";
        if (!ValidEmail(email)) return Invalid("email", "Введите адрес электронной почты.");
        if (password.Length is < 1 or > 1024) return Invalid("password", "Введите пароль.");
        if (!normalizer.TryNormalizeWorkspace(input.Workspace, out var slug) ||
            code.Length != 48 || !code.All(Uri.IsHexDigit)) return Results.NotFound();

        var normalized = email.ToUpperInvariant();
        var hash = SHA256.HashData(Convert.FromHexString(code));
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await LockEditsAsync(db, ct);
        var now = clock.GetUtcNow();
        var invitation = await db.Database.SqlQuery<InvitationTarget>($"""
            SELECT i."Id", i."WorkspaceId", i."Email" FROM platform."WorkspaceTeacherInvitations" i
            JOIN platform."Workspaces" w ON w."Id"=i."WorkspaceId" AND w."IsActive"
            WHERE i."CodeHash"={hash} AND w."Slug"={slug} AND i."ExpiresAt">{now}
                AND i."UsedAt" IS NULL AND i."RevokedAt" IS NULL
            """).SingleOrDefaultAsync(ct);
        if (invitation is null || !string.Equals(invitation.Email.ToUpperInvariant(), normalized, StringComparison.Ordinal))
            return Results.NotFound();

        var teacher = await db.TeacherUsers.SingleOrDefaultAsync(t => t.NormalizedEmail == normalized, ct);
        if (teacher is null)
        {
            if (password.Length < 16) return Invalid("password", "Для нового аккаунта задайте пароль от 16 символов.");
            teacher = new TeacherUser { Id = Guid.NewGuid(), Email = invitation.Email, NormalizedEmail = normalized };
            teacher.PasswordHash = passwordHasher.HashPassword(teacher, password);
            db.TeacherUsers.Add(teacher);
        }
        else if (!teacher.IsActive || string.IsNullOrEmpty(teacher.PasswordHash) ||
            passwordHasher.VerifyHashedPassword(teacher, teacher.PasswordHash, password) == PasswordVerificationResult.Failed)
            return Invalid("password", "Проверьте пароль существующего аккаунта.");

        var membership = await db.WorkspaceMemberships.SingleOrDefaultAsync(m =>
            m.WorkspaceId == invitation.WorkspaceId && m.TeacherUserId == teacher.Id, ct);
        if (membership is null)
            db.WorkspaceMemberships.Add(new WorkspaceMembership { Id = Guid.NewGuid(), WorkspaceId = invitation.WorkspaceId,
                TeacherUserId = teacher.Id, Role = "teacher", IsActive = true });
        else if (membership.Role != "teacher") return Conflict("Доступ владельца меняется отдельно.");
        else membership.IsActive = true;

        await db.SaveChangesAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE platform."WorkspaceTeacherInvitations" SET "UsedAt"={now} WHERE "Id"={invitation.Id}
            """, ct);
        await transaction.CommitAsync(ct);
        return Results.NoContent();
    }
}
