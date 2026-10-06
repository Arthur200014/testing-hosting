using TestingHosting.Platform.IdentityAccess;

namespace TestingHosting.Platform.Homework;

public sealed class HomeworkImportBatch
{
    public Guid Id { get; init; }
    public Guid WorkspaceId { get; init; }
    public required string Source { get; init; }
    public required string WorkbookDigest { get; init; }
    public required string ProgramMapDigest { get; init; }
    public required string Status { get; init; }
    public int CatalogRowCount { get; init; }
    public int AssignmentRowCount { get; init; }
    public int SubmissionRowCount { get; init; }
    public int CatalogCreatedCount { get; init; }
    public int CatalogUnchangedCount { get; init; }
    public int AssignmentCreatedCount { get; init; }
    public int AssignmentUnchangedCount { get; init; }
    public int SubmissionCreatedCount { get; init; }
    public int SubmissionUnchangedCount { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset CompletedAt { get; init; }
    public Workspace Workspace { get; init; } = null!;
}
