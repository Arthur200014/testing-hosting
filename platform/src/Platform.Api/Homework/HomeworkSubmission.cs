using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.Homework;

public sealed class HomeworkSubmission
{
    public Guid Id { get; init; }
    public Guid WorkspaceId { get; init; }
    public Guid AssignmentId { get; init; }
    public Guid MembershipId { get; init; }
    public Guid StudentId { get; init; }
    public Guid ProgramId { get; init; }
    public required string EventId { get; init; }
    public int ScorePercent { get; init; }
    public int DurationSeconds { get; init; }
    public DateTimeOffset CompletedAt { get; init; }
    public bool IsLate { get; init; }
    public required string SchemaVersion { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public Workspace Workspace { get; init; } = null!;
    public HomeworkAssignment Assignment { get; init; } = null!;
    public WorkspaceStudentMembership Membership { get; init; } = null!;
    public LearningProgram Program { get; init; } = null!;
}
