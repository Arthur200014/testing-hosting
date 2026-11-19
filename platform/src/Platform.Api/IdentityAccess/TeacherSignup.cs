using System.Net.Mail;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.IdentityAccess;

public sealed record TeacherSignupRequest(string? Email, string? Password);

public sealed class TeacherSignup(PlatformDbContext db, IPasswordHasher<TeacherUser> passwordHasher)
{
    public async Task<IResult> RegisterAsync(TeacherSignupRequest request, CancellationToken ct)
    {
        var email = request.Email?.Trim() ?? "";
        var password = request.Password ?? "";
        var errors = new Dictionary<string, string[]>();
        if (email.Length is < 3 or > 320 || !MailAddress.TryCreate(email, out var address) ||
            !string.Equals(address.Address, email, StringComparison.Ordinal))
            errors["email"] = ["Enter a valid email address."];
        if (password.Length is < 16 or > 1024)
            errors["password"] = ["Password must contain 16 to 1024 characters."];
        if (errors.Count != 0) return Results.ValidationProblem(errors);

        var workspace = new Workspace { Id = Guid.NewGuid(), Slug = $"teacher-{Guid.NewGuid():N}" };
        var teacher = new TeacherUser { Id = Guid.NewGuid(), Email = email, NormalizedEmail = email.ToUpperInvariant() };
        teacher.PasswordHash = passwordHasher.HashPassword(teacher, password);
        db.WorkspaceMemberships.Add(new WorkspaceMembership
        {
            Id = Guid.NewGuid(), Workspace = workspace, TeacherUser = teacher, Role = "owner", IsActive = true
        });
        db.Programs.Add(new LearningProgram
        {
            Id = Guid.NewGuid(), Workspace = workspace, Code = "GENERAL", DisplayName = "Основная программа"
        });

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException
            { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "IX_TeacherUsers_NormalizedEmail" })
        {
            return Results.Conflict();
        }

        return Results.Created("/api/v1/teacher-sessions", new { created = true });
    }
}
