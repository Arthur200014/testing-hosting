namespace TestingHosting.Platform.IdentityAccess;

public sealed class WorkspaceMembership
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid TeacherUserId { get; set; }
    public required string Role { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Workspace Workspace { get; set; } = null!;
    public TeacherUser TeacherUser { get; set; } = null!;
}
