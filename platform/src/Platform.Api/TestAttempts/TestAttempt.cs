using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.TestAttempts;

public sealed class TestAttempt
{
    public Guid Id { get; init; }
    public Guid WorkspaceId { get; init; }
    public Guid MembershipId { get; init; }
    public Guid StudentId { get; init; }
    public Guid ProgramId { get; init; }
    public required string EventId { get; init; }
    public required string TestId { get; init; }
    public required string Topic { get; init; }
    public int TaskNumber { get; init; }
    public int Correct { get; init; }
    public int Total { get; init; }
    public int Percent { get; init; }
    public DateTimeOffset StartedAt { get; init; }
    public DateTimeOffset CompletedAt { get; init; }
    public int DurationSeconds { get; init; }
    public required string SchemaVersion { get; init; }
    public required string MoscowMonthKey { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public Workspace Workspace { get; init; } = null!;
    public WorkspaceStudentMembership Membership { get; init; } = null!;
    public LearningProgram Program { get; init; } = null!;
}
