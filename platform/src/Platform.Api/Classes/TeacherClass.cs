using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.Classes;

public sealed class TeacherClass
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid RequestId { get; set; }
    public Guid StudentMembershipId { get; set; }
    public Guid StudentId { get; set; }
    public required string Title { get; set; }
    public string Description { get; set; } = string.Empty;
    // Preferences only; do not create lessons, invoices or chat sessions.
    public int? DurationMinutes { get; set; }
    public decimal? PriceAmount { get; set; }
    public string? PriceCurrency { get; set; }
    public string? PriceBasis { get; set; }
    public bool AllowLessonChat { get; set; }
    public bool AllowPrivateMessages { get; set; }
    public string Kind { get; set; } = "individual";
    public bool IsArchived { get; set; }
    public int Revision { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Workspace Workspace { get; set; } = null!;
    public WorkspaceStudentMembership StudentMembership { get; set; } = null!;
}
