using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.TestAttempts;

// Legacy rows may contain only a percentage: missing counts/timestamps remain null.
public sealed class HistoricalTestResult
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid MembershipId { get; set; }
    public Guid StudentId { get; set; }
    public Guid ProgramId { get; set; }
    public required string EventId { get; set; }
    public required string TestId { get; set; }
    public DateOnly TestDate { get; set; }
    public required string TopicId { get; set; }
    public required string TopicName { get; set; }
    public int TaskNumber { get; set; }
    public int? CorrectCount { get; set; }
    public int? TotalCount { get; set; }
    public int ScorePercent { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }
    public int DurationSeconds { get; set; }
    public DateTimeOffset ServerSubmittedAt { get; set; }
    public required string SchemaVersion { get; set; }
    public WorkspaceStudentMembership Membership { get; set; } = null!;
    public LearningProgram Program { get; set; } = null!;
}
