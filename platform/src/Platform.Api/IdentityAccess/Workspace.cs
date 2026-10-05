namespace TestingHosting.Platform.IdentityAccess;

public sealed class Workspace
{
    public Guid Id { get; set; }
    public required string Slug { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<WorkspaceMembership> TeacherMemberships { get; set; } = [];
}
