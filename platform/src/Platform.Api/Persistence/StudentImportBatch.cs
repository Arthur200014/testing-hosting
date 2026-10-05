using TestingHosting.Platform.IdentityAccess;

namespace TestingHosting.Platform.Persistence;

public sealed class StudentImportBatch
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public required string Source { get; set; }
    public required string WorkbookDigest { get; set; }
    public required string ProgramMapDigest { get; set; }
    public required string Status { get; set; }
    public int RowCount { get; set; }
    public int CreatedStudentCount { get; set; }
    public int UnchangedStudentCount { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset CompletedAt { get; set; } = DateTimeOffset.UtcNow;
    public Workspace Workspace { get; set; } = null!;
}
