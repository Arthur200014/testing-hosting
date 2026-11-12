using System.Data;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.IdentityAccess;

public sealed record TeacherOwnerRegistrationRequest(
    string? Workspace, string? Email, string? Password, string? ClaimCode);

public enum TeacherOwnerRegistrationStatus { Created, Unavailable, InvalidCode, InvalidRequest, Conflict }

public sealed record TeacherOwnerRegistrationResult(
    TeacherOwnerRegistrationStatus Status, Dictionary<string, string[]>? Errors = null);

/// <summary>Claims an existing imported workspace once, using a private server-side setup code.</summary>
public sealed class TeacherOwnerRegistration(
    PlatformDbContext db, IConfiguration configuration, IStudentCodeHasher normalizer,
    IPasswordHasher<TeacherUser> passwordHasher)
{
    public async Task<TeacherOwnerRegistrationResult> RegisterAsync(
        TeacherOwnerRegistrationRequest request, CancellationToken cancellationToken)
    {
        var configuredCode = configuration["TeacherRegistration:ClaimCode"];
        var configuredWorkspace = configuration["TeacherRegistration:Workspace"];
        if (configuredCode is null || configuredCode.Length < 24 ||
            !normalizer.TryNormalizeWorkspace(configuredWorkspace, out var allowedSlug))
            return new(TeacherOwnerRegistrationStatus.Unavailable);

        var givenCode = request.ClaimCode ?? "";
        var codeMatches = givenCode.Length is >= 24 and <= 1024 &&
            CryptographicOperations.FixedTimeEquals(
                SHA256.HashData(Encoding.UTF8.GetBytes(givenCode)),
                SHA256.HashData(Encoding.UTF8.GetBytes(configuredCode)));
        if (!codeMatches || !normalizer.TryNormalizeWorkspace(request.Workspace, out var slug) ||
            slug != allowedSlug)
            return new(TeacherOwnerRegistrationStatus.InvalidCode);

        var email = request.Email?.Trim() ?? "";
        var password = request.Password ?? "";
        var errors = new Dictionary<string, string[]>();
        if (email.Length is < 3 or > 320 || !email.Contains('@'))
            errors["email"] = ["Enter a valid email address."];
        if (password.Length is < 16 or > 1024)
            errors["password"] = ["Password must contain 16 to 1024 characters."];
        if (errors.Count > 0) return new(TeacherOwnerRegistrationStatus.InvalidRequest, errors);

        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.ReadCommitted, cancellationToken);
        await db.Database.ExecuteSqlRawAsync(
            "SELECT pg_advisory_xact_lock(8175201964312)", cancellationToken);

        var workspace = await db.Workspaces.SingleOrDefaultAsync(
            x => x.Slug == slug && x.IsActive, cancellationToken);
        if (workspace is null || await db.WorkspaceMemberships.AnyAsync(
                x => x.WorkspaceId == workspace.Id && x.Role == "owner", cancellationToken))
            return new(TeacherOwnerRegistrationStatus.Conflict);

        var normalizedEmail = email.ToUpperInvariant();
        if (await db.TeacherUsers.AnyAsync(x => x.NormalizedEmail == normalizedEmail, cancellationToken))
            return new(TeacherOwnerRegistrationStatus.Conflict);

        var teacher = new TeacherUser
        {
            Id = Guid.NewGuid(), Email = email, NormalizedEmail = normalizedEmail, IsActive = true
        };
        teacher.PasswordHash = passwordHasher.HashPassword(teacher, password);
        db.WorkspaceMemberships.Add(new WorkspaceMembership
        {
            Id = Guid.NewGuid(), WorkspaceId = workspace.Id, TeacherUser = teacher,
            Role = "owner", IsActive = true
        });
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new(TeacherOwnerRegistrationStatus.Created);
    }
}
