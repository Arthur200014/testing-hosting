namespace TestingHosting.Platform.Homework;

public sealed class NativeHomeworkTask
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid ProgramId { get; set; }
    public Guid RequestId { get; set; }
    public required string Title { get; set; }
    public required string Prompt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class NativeHomeworkAssignment
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid TaskId { get; set; }
    public Guid ProgramId { get; set; }
    public Guid MembershipId { get; set; }
    public Guid StudentId { get; set; }
    public Guid RequestId { get; set; }
    public DateTimeOffset AssignedAt { get; set; }
    public DateTimeOffset DeadlineAt { get; set; }
    public string? Answer { get; set; }
    public Guid? SubmissionId { get; set; }
    public DateTimeOffset? SubmittedAt { get; set; }
    public int? ScorePercent { get; set; }
}

public sealed record CreateNativeTaskRequest(Guid RequestId, Guid ProgramId, string? Title, string? Prompt);
public sealed record AssignNativeTaskRequest(Guid RequestId, Guid TaskId, Guid[]? MembershipIds, int DeadlineHours);
public sealed record SubmitNativeAnswerRequest(Guid SubmissionId, Guid AssignmentId, string? Answer);
public sealed record NativeTaskView(Guid Id, Guid ProgramId, string Title, string Prompt, DateTimeOffset CreatedAt);
public sealed record NativeAssignmentView(Guid Id, Guid TaskId, Guid MembershipId, Guid ProgramId,
    string Title, string Prompt, DateTimeOffset AssignedAt, DateTimeOffset DeadlineAt,
    string? Answer, DateTimeOffset? SubmittedAt, int? ScorePercent);
