namespace TestingHosting.Platform.TestAttempts;

public sealed record TestAttemptRequest(
    string? EventId,
    string? TestId,
    string? Topic,
    int? TaskNumber,
    int? Correct,
    int? Total,
    int? Percent,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt,
    int? DurationSeconds,
    string? SchemaVersion);

public sealed record TestAttemptResponse(
    Guid AttemptId,
    string EventId,
    bool Duplicate,
    DateTimeOffset CreatedAt,
    MonthlyBestResponse MonthlyBest);

public sealed record MonthlyBestResponse(
    Guid AttemptId,
    int Percent,
    int DurationSeconds,
    DateTimeOffset CompletedAt);

public enum TestAttemptWriteStatus
{
    Created,
    Duplicate,
    Conflict,
    InvalidRequest,
    InvalidIdentity
}

public sealed record TestAttemptWriteResult(
    TestAttemptWriteStatus Status,
    TestAttemptResponse? Response = null,
    IReadOnlyDictionary<string, string[]>? Errors = null);
