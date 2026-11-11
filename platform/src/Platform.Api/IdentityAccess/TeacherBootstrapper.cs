using System.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.IdentityAccess;

/// <summary>Privileged, opt-in owner setup. Never exposed as an HTTP route.</summary>
public static class TeacherBootstrapper
{
    public static async Task RunAsync(IServiceProvider services, IConfiguration configuration)
    {
        var email = configuration["TeacherBootstrap:Email"]?.Trim() ?? "";
        var password = configuration["TeacherBootstrap:Password"] ?? "";
        var workspaceSlug = configuration["TeacherBootstrap:Workspace"] ?? "";
        if (email.Length is < 3 or > 320 || !email.Contains('@') ||
            password.Length is < 16 or > 1024 ||
            password.Contains("REPLACE_", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Teacher bootstrap requires a valid email and strong password from environment secrets.");
        }

        await using var scope = services.CreateAsyncScope();
        var normalizer = scope.ServiceProvider.GetRequiredService<IStudentCodeHasher>();
        if (!normalizer.TryNormalizeWorkspace(workspaceSlug, out var slug))
            throw new InvalidOperationException("Teacher bootstrap workspace slug is invalid.");

        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<TeacherUser>>();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var workspace = await db.Workspaces.SingleOrDefaultAsync(x => x.Slug == slug);
        if (workspace is not null &&
            await db.WorkspaceMemberships.AnyAsync(x => x.WorkspaceId == workspace.Id && x.IsActive && x.Role == "owner"))
            throw new InvalidOperationException("Workspace already has an owner; use a future audited invitation flow.");

        var normalizedEmail = email.ToUpperInvariant();
        var teacher = await db.TeacherUsers.SingleOrDefaultAsync(x => x.NormalizedEmail == normalizedEmail);
        if (teacher?.PasswordHash is not null)
            throw new InvalidOperationException("Teacher account already provisioned; credential reset is not supported here.");
        if (teacher is not null && !teacher.IsActive)
            throw new InvalidOperationException("Inactive teacher account cannot be reactivated by bootstrap.");

        workspace ??= new Workspace { Id = Guid.NewGuid(), Slug = slug };
        teacher ??= new TeacherUser { Id = Guid.NewGuid(), Email = email, NormalizedEmail = normalizedEmail };
        teacher.PasswordHash = passwordHasher.HashPassword(teacher, password);

        var membership = await db.WorkspaceMemberships.SingleOrDefaultAsync(x =>
            x.WorkspaceId == workspace.Id && x.TeacherUserId == teacher.Id);
        if (membership is not null)
            throw new InvalidOperationException("Existing membership requires an audited role-change flow.");

        db.WorkspaceMemberships.Add(new WorkspaceMembership
        {
            Id = Guid.NewGuid(), Workspace = workspace, TeacherUser = teacher,
            Role = "owner", IsActive = true
        });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        Console.WriteLine("Teacher owner provisioned; no credentials printed.");
    }
}
