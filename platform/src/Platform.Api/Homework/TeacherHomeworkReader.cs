using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Homework;

public sealed record TeacherHomeworkCatalogView(
    Guid Id, Guid ProgramId, string HomeworkId, int TaskNumber,
    string Name, string Url, bool IsActive, int SortOrder);

public sealed record TeacherHomeworkAssignmentView(
    Guid Id, Guid MembershipId, Guid StudentId, Guid ProgramId,
    string AssignmentRecordId, string HomeworkId, int TaskNumber,
    string Name, string Url, DateTimeOffset AssignedAt, DateTimeOffset DeadlineAt,
    DateTimeOffset? SubmittedAt, string Status, int? ScorePercent, string? LegacyLessonId);

public sealed record TeacherHomeworkSubmissionView(
    Guid Id, Guid AssignmentId, Guid MembershipId, Guid StudentId, Guid ProgramId,
    int ScorePercent, int DurationSeconds, DateTimeOffset CompletedAt, bool IsLate);

public sealed class TeacherHomeworkReader(PlatformDbContext db)
{
    public Task<List<TeacherHomeworkCatalogView>> CatalogAsync(
        Guid workspaceId, CancellationToken cancellationToken) =>
        db.HomeworkCatalogItems.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId)
            .OrderBy(x => x.ProgramId).ThenBy(x => x.SortOrder).ThenBy(x => x.Id)
            .Select(x => new TeacherHomeworkCatalogView(
                x.Id, x.ProgramId, x.HomeworkId, x.TaskNumber,
                x.Name, x.Url, x.IsActive, x.SortOrder))
            .ToListAsync(cancellationToken);

    public Task<List<TeacherHomeworkAssignmentView>> AssignmentsAsync(
        Guid workspaceId, Guid? membershipId, CancellationToken cancellationToken) =>
        db.HomeworkAssignments.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId &&
                (!membershipId.HasValue || x.MembershipId == membershipId.Value))
            .OrderByDescending(x => x.AssignedAt).ThenBy(x => x.Id)
            .Select(x => new TeacherHomeworkAssignmentView(
                x.Id, x.MembershipId, x.StudentId, x.ProgramId,
                x.AssignmentRecordId, x.HomeworkId, x.TaskNumber,
                x.Name, x.Url, x.AssignedAt, x.DeadlineAt,
                x.SubmittedAt, x.Status, x.ScorePercent, x.LegacyLessonId))
            .ToListAsync(cancellationToken);

    public Task<List<TeacherHomeworkSubmissionView>> SubmissionsAsync(
        Guid workspaceId, Guid? membershipId, CancellationToken cancellationToken) =>
        db.HomeworkSubmissions.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId &&
                (!membershipId.HasValue || x.MembershipId == membershipId.Value))
            .OrderByDescending(x => x.CompletedAt).ThenBy(x => x.Id)
            .Select(x => new TeacherHomeworkSubmissionView(
                x.Id, x.AssignmentId, x.MembershipId, x.StudentId, x.ProgramId,
                x.ScorePercent, x.DurationSeconds, x.CompletedAt, x.IsLate))
            .ToListAsync(cancellationToken);
}
