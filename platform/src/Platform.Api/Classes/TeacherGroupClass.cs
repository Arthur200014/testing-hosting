using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.Classes;

// A separate permanent class type keeps existing individual-class FKs and imported history untouched.
public sealed class TeacherGroupClass
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid RequestId { get; set; }
    public required string Title { get; set; }
    public string Description { get; set; } = string.Empty;
    public string CoverStyle { get; set; } = "lavender";
    public int Capacity { get; set; } = 20;
    public bool AutoApproveInvites { get; set; } = true;
    public int? DurationMinutes { get; set; }
    public decimal? PriceAmount { get; set; }
    public string? PriceCurrency { get; set; }
    public string? PriceBasis { get; set; }
    public bool AllowLessonChat { get; set; }
    public bool AllowPrivateMessages { get; set; }
    public bool IsArchived { get; set; }
    public int Revision { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
    public byte[]? InvitationCodeHash { get; set; }
    public DateTimeOffset? InvitationExpiresAt { get; set; }
    public string? InvitationStatus { get; set; }
    public Workspace Workspace { get; set; } = null!;
    public List<TeacherGroupEnrollment> Members { get; set; } = [];
}

public sealed class TeacherGroupEnrollment
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid GroupClassId { get; set; }
    public Guid MembershipId { get; set; }
    public Guid StudentId { get; set; }
    public bool IsApproved { get; set; } = true;
    public DateTimeOffset JoinedAt { get; set; }
    public TeacherGroupClass GroupClass { get; set; } = null!;
    public WorkspaceStudentMembership Membership { get; set; } = null!;
}
