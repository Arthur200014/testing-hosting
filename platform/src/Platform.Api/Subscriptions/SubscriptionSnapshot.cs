using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.Subscriptions;

// Historical source records only current package state; payment events are NOT inferred.
public sealed class SubscriptionSnapshot
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid MembershipId { get; set; }
    public Guid StudentId { get; set; }
    public Guid ProgramId { get; set; }
    public int PackageSize { get; set; }
    public DateTimeOffset? ResetAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public decimal? LessonPrice { get; set; }
    public int? BaseLessonCount { get; set; }
    public WorkspaceStudentMembership Membership { get; set; } = null!;
}
