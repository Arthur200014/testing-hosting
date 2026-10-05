namespace TestingHosting.Platform.IdentityAccess;

public sealed class TeacherUser
{
    public Guid Id { get; set; }
    public required string Email { get; set; }
    public required string NormalizedEmail { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<WorkspaceMembership> WorkspaceMemberships { get; set; } = [];
}
