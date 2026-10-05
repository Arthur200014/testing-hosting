namespace TestingHosting.Platform.Students;

public sealed class Student
{
    public Guid Id { get; set; }
    public required string DisplayName { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<WorkspaceStudentMembership> WorkspaceMemberships { get; set; } = [];
}
