using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Students;

public sealed record TeacherStudentProfile(
    string? Grade = null, string? GroupId = null, string? TargetScore = null,
    string? TargetGrade = null, string? InitialScore = null,
    string? InitialPrimaryScore = null, string? InitialGrade = null,
    string? ParentName = null, string? Notes = null);

public sealed record TeacherCreateStudentRequest(
    Guid RequestId, Guid ProgramId, string? StudentName, TeacherStudentProfile? Profile = null);
public sealed record TeacherCreateStudentResponse(Guid MembershipId, Guid StudentId, string StudentName,
    Guid ProgramId, string InviteCode, TeacherStudentProfile Profile);
public enum TeacherCreateStudentStatus { Created, Duplicate, Conflict, InvalidRequest, ProgramNotFound }
public sealed record TeacherCreateStudentResult(TeacherCreateStudentStatus Status,
    TeacherCreateStudentResponse? Response = null, Dictionary<string, string[]>? Errors = null);

public sealed class TeacherInviteCodeIssuer(byte[] pepper)
{
    public string Issue(Guid workspaceId, Guid requestId)
    {
        var data = Encoding.UTF8.GetBytes($"teacher-invite-v1\n{workspaceId:N}\n{requestId:N}");
        return Convert.ToHexString(HMACSHA256.HashData(pepper, data).AsSpan(0, 16));
    }
}

public sealed class TeacherStudentCreator(
    PlatformDbContext db, IStudentCodeHasher hasher, TeacherInviteCodeIssuer codes, TimeProvider clock)
{
    public async Task<TeacherCreateStudentResult> CreateAsync(
        Guid workspaceId, TeacherCreateStudentRequest request, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty)
            errors["requestId"] = ["A non-empty request ID is required."];
        if (request.ProgramId == Guid.Empty)
            errors["programId"] = ["A program is required."];
        var name = request.StudentName?.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Length > 200)
            errors["studentName"] = ["StudentName must be between 1 and 200 characters."];
        var profile = Normalize(request.Profile);
        foreach (var (field, value, max) in new (string, string?, int)[]
        {
            ("grade", profile.Grade, 32), ("groupId", profile.GroupId, 128),
            ("targetScore", profile.TargetScore, 32), ("targetGrade", profile.TargetGrade, 32),
            ("initialScore", profile.InitialScore, 32), ("initialPrimaryScore", profile.InitialPrimaryScore, 32),
            ("initialGrade", profile.InitialGrade, 32), ("parentName", profile.ParentName, 200),
            ("notes", profile.Notes, 4096)
        })
            if (value?.Length > max) errors[field] = [$"{field} cannot exceed {max} characters."];
        if (errors.Count > 0) return new(TeacherCreateStudentStatus.InvalidRequest, Errors: errors);

        var workspace = await db.Workspaces.AsNoTracking()
            .SingleAsync(x => x.Id == workspaceId, cancellationToken);
        var inviteCode = codes.Issue(workspaceId, request.RequestId);
        var hash = hasher.Hash(workspace.Slug, inviteCode);
        var externalId = request.RequestId.ToString("N");
        var existing = await FindAsync(workspaceId, externalId, cancellationToken);
        if (existing is not null) return Compare(existing, name!, request.ProgramId, hash, inviteCode, profile);

        var program = await db.Programs.AsNoTracking().AnyAsync(x =>
            x.Id == request.ProgramId && x.WorkspaceId == workspaceId && x.IsActive, cancellationToken);
        if (!program) return new(TeacherCreateStudentStatus.ProgramNotFound);

        var now = clock.GetUtcNow();
        var student = new Student { Id = Guid.NewGuid(), DisplayName = name!, CreatedAt = now };
        var membership = new WorkspaceStudentMembership
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, ProgramId = request.ProgramId,
            Student = student, CodeHash = hash, ImportSource = "teacher-api",
            ImportExternalId = externalId, CreatedAt = now,
            Grade = profile.Grade, GroupId = profile.GroupId,
            TargetScore = profile.TargetScore, TargetGrade = profile.TargetGrade,
            InitialScore = profile.InitialScore, InitialPrimaryScore = profile.InitialPrimaryScore,
            InitialGrade = profile.InitialGrade, ParentName = profile.ParentName, Notes = profile.Notes
        };
        db.WorkspaceStudentMemberships.Add(membership);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (
            exception.InnerException is PostgresException postgres &&
            postgres.SqlState == PostgresErrorCodes.UniqueViolation &&
            postgres.ConstraintName is
                "IX_WorkspaceStudentMemberships_WorkspaceId_ImportSource_Import~" or
                "IX_WorkspaceStudentMemberships_WorkspaceId_CodeHash")
        {
            db.ChangeTracker.Clear();
            var winner = await FindAsync(workspaceId, externalId, cancellationToken);
            if (winner is null) throw;
            return Compare(winner, name!, request.ProgramId, hash, inviteCode, profile);
        }
        return new(TeacherCreateStudentStatus.Created,
            new(membership.Id, student.Id, student.DisplayName, request.ProgramId, inviteCode, profile));
    }

    private Task<WorkspaceStudentMembership?> FindAsync(
        Guid workspaceId, string externalId, CancellationToken cancellationToken) =>
        db.WorkspaceStudentMemberships.AsNoTracking().Include(x => x.Student)
            .SingleOrDefaultAsync(x => x.WorkspaceId == workspaceId &&
                x.ImportSource == "teacher-api" && x.ImportExternalId == externalId,
                cancellationToken);

    private static TeacherCreateStudentResult Compare(
        WorkspaceStudentMembership existing, string name, Guid programId, byte[] hash,
        string inviteCode, TeacherStudentProfile profile) =>
        existing.IsActive && existing.Student.IsActive && existing.Student.DisplayName == name &&
        existing.ProgramId == programId && CryptographicOperations.FixedTimeEquals(existing.CodeHash, hash) &&
        From(existing) == profile
            ? new(TeacherCreateStudentStatus.Duplicate,
                new(existing.Id, existing.StudentId, name, programId, inviteCode, profile))
            : new(TeacherCreateStudentStatus.Conflict);

    private static TeacherStudentProfile From(WorkspaceStudentMembership member) => new(
        member.Grade, member.GroupId, member.TargetScore, member.TargetGrade,
        member.InitialScore, member.InitialPrimaryScore, member.InitialGrade,
        member.ParentName, member.Notes);

    private static TeacherStudentProfile Normalize(TeacherStudentProfile? profile)
    {
        profile ??= new();
        static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        return new(Clean(profile.Grade), Clean(profile.GroupId), Clean(profile.TargetScore),
            Clean(profile.TargetGrade), Clean(profile.InitialScore), Clean(profile.InitialPrimaryScore),
            Clean(profile.InitialGrade), Clean(profile.ParentName), Clean(profile.Notes));
    }
}
