using TestingHosting.Platform.IdentityAccess;

namespace TestingHosting.Platform.Students;

public sealed class WorkspaceStudentMembership
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid StudentId { get; set; }
    public Guid ProgramId { get; set; }
    public required byte[] CodeHash { get; set; }
    public string? ImportSource { get; set; }
    public string? ImportExternalId { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Workspace Workspace { get; set; } = null!;
    public Student Student { get; set; } = null!;
    public LearningProgram Program { get; set; } = null!;
}
