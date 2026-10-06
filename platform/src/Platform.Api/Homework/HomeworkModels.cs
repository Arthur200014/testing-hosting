namespace TestingHosting.Platform.Homework;

public sealed record HomeworkAssignmentResponse(
    Guid AssignmentRecordId,
    string HomeworkId,
    int TaskNumber,
    string Name,
    string Url,
    DateTimeOffset AssignedAt,
    DateTimeOffset DeadlineAt,
    DateTimeOffset? SubmittedAt,
    string Status,
    int? ScorePercent,
    string SchemaVersion);

public sealed record HomeworkSubmissionRequest(
    string? AssignmentId,
    string? EventId,
    int? ScorePercent,
    int? DurationSeconds,
    DateTimeOffset? CompletedAt,
    string? SchemaVersion);

public sealed record HomeworkSubmissionResponse(
    Guid SubmissionId,
    Guid AssignmentRecordId,
    string HomeworkId,
    string EventId,
    bool Duplicate,
    bool Late,
    string Status,
    int ScorePercent,
    DateTimeOffset CompletedAt,
    DateTimeOffset CreatedAt);

public enum HomeworkSubmissionWriteStatus
{
    Created,
    Duplicate,
    Conflict,
    InvalidRequest,
    InvalidIdentity,
    AssignmentNotFound
}

public sealed record HomeworkSubmissionWriteResult(
    HomeworkSubmissionWriteStatus Status,
    HomeworkSubmissionResponse? Response = null,
    IReadOnlyDictionary<string, string[]>? Errors = null);
