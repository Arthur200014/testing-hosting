using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.Mocks;

// Independent source events: some task rows have no matching summary row.
public sealed class HistoricalMockResult
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid MembershipId { get; set; }
    public Guid StudentId { get; set; }
    public Guid ProgramId { get; set; }
    public required string EventId { get; set; }
    public required string MockId { get; set; }
    public DateOnly MockDate { get; set; }
    public required string VariantName { get; set; }
    public int? Score { get; set; }
    public int PrimaryScore { get; set; }
    public int DurationSeconds { get; set; }
    public DateTimeOffset ServerSubmittedAt { get; set; }
    public required string SchemaVersion { get; set; }
    public int? GradeMark { get; set; }
    public int MaxPrimaryScore { get; set; }
    public int ScorePercent { get; set; }
    public WorkspaceStudentMembership Membership { get; set; } = null!;
    public LearningProgram Program { get; set; } = null!;
}

public sealed class HistoricalMockTaskResult
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid MembershipId { get; set; }
    public Guid StudentId { get; set; }
    public Guid ProgramId { get; set; }
    public required string EventId { get; set; }
    public required string MockId { get; set; }
    public DateOnly MockDate { get; set; }
    public int TaskNumber { get; set; }
    public required string TopicId { get; set; }
    public required string TopicName { get; set; }
    public bool IsCorrect { get; set; }
    public bool Answered { get; set; }
    public DateTimeOffset ServerSubmittedAt { get; set; }
    public required string SchemaVersion { get; set; }
    public int? EarnedPoints { get; set; }
    public int? MaxPoints { get; set; }
    public WorkspaceStudentMembership Membership { get; set; } = null!;
    public LearningProgram Program { get; set; } = null!;
}

public sealed class HistoricalMockSession
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid MembershipId { get; set; }
    public Guid StudentId { get; set; }
    public Guid ProgramId { get; set; }
    public required string SessionId { get; set; }
    public required string MockId { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset DeadlineAt { get; set; }
    public required string AnswersJson { get; set; }
    public required string Status { get; set; }
    public DateTimeOffset? SubmittedAt { get; set; }
    public int? PrimaryScore { get; set; }
    public int? TestScore { get; set; }
    public int? DurationSeconds { get; set; }
    public string? EventId { get; set; }
    public required string SchemaVersion { get; set; }
    public required string MockConfigJson { get; set; }
    public int? GradeMark { get; set; }
    public int? MaxPrimaryScore { get; set; }
    public int? ScorePercent { get; set; }
    public WorkspaceStudentMembership Membership { get; set; } = null!;
    public LearningProgram Program { get; set; } = null!;
}

public sealed class HistoricalMockVariant
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid ProgramId { get; set; }
    public required string MockId { get; set; }
    public required string VariantName { get; set; }
    public int DurationSeconds { get; set; }
    public int TaskCount { get; set; }
    public required string ConfigJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public required string SchemaVersion { get; set; }
    public LearningProgram Program { get; set; } = null!;
}
