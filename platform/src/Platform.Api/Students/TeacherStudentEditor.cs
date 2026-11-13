using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Students;

// The expected snapshot prevents overwriting changes from another teacher/tab.
// The student name is shared by memberships: do not rename a Student referenced
// by another workspace, even if that other membership has since been archived.
public sealed record TeacherEditStudentRequest(
    string? StudentName, TeacherStudentProfile? Profile,
    string? ExpectedStudentName, TeacherStudentProfile? ExpectedProfile);
public enum TeacherEditStudentStatus { Updated, Unchanged, Conflict, NotFound, InvalidRequest }
public sealed record TeacherEditStudentResult(
    TeacherEditStudentStatus Status, TeacherStudentView? Response = null,
    Dictionary<string, string[]>? Errors = null);

public sealed class TeacherStudentEditor(PlatformDbContext db, TeacherStudentDirectory directory)
{
    public async Task<TeacherEditStudentResult> EditAsync(
        Guid workspaceId, Guid membershipId, TeacherEditStudentRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        var name = request.StudentName?.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Length > 200)
            errors["studentName"] = ["StudentName must be between 1 and 200 characters."];
        if (string.IsNullOrWhiteSpace(request.ExpectedStudentName) || request.ExpectedProfile is null)
            errors["expectedProfile"] = ["An original student snapshot is required. Reload before editing."];

        var profile = Normalize(request.Profile);
        foreach (var (field, value, max) in new (string, string?, int)[]
        {
            ("grade", profile.Grade, 32), ("groupId", profile.GroupId, 128),
            ("targetScore", profile.TargetScore, 32), ("targetGrade", profile.TargetGrade, 32),
            ("initialScore", profile.InitialScore, 32),
            ("initialPrimaryScore", profile.InitialPrimaryScore, 32),
            ("initialGrade", profile.InitialGrade, 32),
            ("parentName", profile.ParentName, 200), ("notes", profile.Notes, 4096)
        })
            if (value?.Length > max) errors[field] = [$"{field} cannot exceed {max} characters."];
        if (errors.Count != 0) return new(TeacherEditStudentStatus.InvalidRequest, Errors: errors);

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var key = "teacher-student-edit:" + membershipId.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))", cancellationToken);
        var membership = await db.WorkspaceStudentMemberships
            .Include(x => x.Student)
            .SingleOrDefaultAsync(x => x.Id == membershipId && x.WorkspaceId == workspaceId &&
                x.IsActive && x.Student.IsActive && x.Program.IsActive, cancellationToken);
        if (membership is null) return new(TeacherEditStudentStatus.NotFound);

        var currentProfile = From(membership);
        if (membership.Student.DisplayName == name && currentProfile == profile)
        {
            await transaction.CommitAsync(cancellationToken);
            return new(TeacherEditStudentStatus.Unchanged,
                await directory.GetAsync(workspaceId, membershipId, cancellationToken));
        }
        if (membership.Student.DisplayName != request.ExpectedStudentName ||
            currentProfile != request.ExpectedProfile)
            return new(TeacherEditStudentStatus.Conflict);

        if (membership.Student.DisplayName != name && await db.WorkspaceStudentMemberships
                .AnyAsync(x => x.StudentId == membership.StudentId && x.WorkspaceId != workspaceId,
                    cancellationToken))
            return new(TeacherEditStudentStatus.Conflict);

        membership.Student.DisplayName = name!;
        membership.Grade = profile.Grade;
        membership.GroupId = profile.GroupId;
        membership.TargetScore = profile.TargetScore;
        membership.TargetGrade = profile.TargetGrade;
        membership.InitialScore = profile.InitialScore;
        membership.InitialPrimaryScore = profile.InitialPrimaryScore;
        membership.InitialGrade = profile.InitialGrade;
        membership.ParentName = profile.ParentName;
        membership.Notes = profile.Notes;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new(TeacherEditStudentStatus.Updated,
            await directory.GetAsync(workspaceId, membershipId, cancellationToken));
    }

    private static TeacherStudentProfile From(WorkspaceStudentMembership member) => new(
        member.Grade, member.GroupId, member.TargetScore, member.TargetGrade,
        member.InitialScore, member.InitialPrimaryScore, member.InitialGrade,
        member.ParentName, member.Notes);

    private static TeacherStudentProfile Normalize(TeacherStudentProfile? original)
    {
        original ??= new();
        static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        return new(Clean(original.Grade), Clean(original.GroupId), Clean(original.TargetScore),
            Clean(original.TargetGrade), Clean(original.InitialScore),
            Clean(original.InitialPrimaryScore), Clean(original.InitialGrade),
            Clean(original.ParentName), Clean(original.Notes));
    }
}
