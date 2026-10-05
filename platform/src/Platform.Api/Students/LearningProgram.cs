namespace TestingHosting.Platform.Students;

public sealed class LearningProgram
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public required string Code { get; set; }
    public required string DisplayName { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public IdentityAccess.Workspace Workspace { get; set; } = null!;
    public ICollection<WorkspaceStudentMembership> StudentMemberships { get; set; } = [];
}
