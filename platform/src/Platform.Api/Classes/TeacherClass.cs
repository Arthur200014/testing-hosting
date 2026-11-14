using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.Classes;

public sealed class TeacherClass
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid RequestId { get; set; }
    public Guid StudentMembershipId { get; set; }
    public required string Title { get; set; }
    public string Kind { get; set; } = "individual";
    public bool IsArchived { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Workspace Workspace { get; set; } = null!;
    public WorkspaceStudentMembership StudentMembership { get; set; } = null!;
}
