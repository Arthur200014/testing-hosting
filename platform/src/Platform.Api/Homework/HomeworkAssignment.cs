using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.Homework;

public sealed class HomeworkAssignment
{
    public Guid Id { get; init; }
    public Guid WorkspaceId { get; init; }
    public Guid MembershipId { get; init; }
    public Guid StudentId { get; init; }
    public Guid ProgramId { get; init; }
    public Guid? CatalogItemId { get; init; }
    public required string AssignmentRecordId { get; init; }
    public required string HomeworkId { get; init; }
    public int TaskNumber { get; init; }
    public required string Name { get; init; }
    public required string Url { get; init; }
    public DateTimeOffset AssignedAt { get; init; }
    public DateTimeOffset DeadlineAt { get; init; }
    public DateTimeOffset? SubmittedAt { get; set; }
    public required string Status { get; set; }
    public int? ScorePercent { get; set; }
    public string? HomeworkEventId { get; set; }
    public string? LegacyLessonId { get; init; }
    public required string SchemaVersion { get; init; }
    public Workspace Workspace { get; init; } = null!;
    public WorkspaceStudentMembership Membership { get; init; } = null!;
    public LearningProgram Program { get; init; } = null!;
    public HomeworkCatalogItem? CatalogItem { get; init; }
}
