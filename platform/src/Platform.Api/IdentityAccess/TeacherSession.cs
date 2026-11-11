namespace TestingHosting.Platform.IdentityAccess;

public sealed class TeacherSession
{
    public Guid Id { get; set; }
    public Guid MembershipId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public WorkspaceMembership Membership { get; set; } = null!;
}
