using TestingHosting.Platform.IdentityAccess;

namespace TestingHosting.Platform.Students;

public sealed class WorkspaceStudentMembership
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid StudentId { get; set; }
    public Guid ProgramId { get; set; }
    public required byte[] CodeHash { get; set; }
    public string? ImportSource { get; set; }
    public string? ImportExternalId { get; set; }
    public string? Grade { get; set; }
    public string? GroupId { get; set; }
    public string? TargetScore { get; set; }
    public string? TargetGrade { get; set; }
    public string? InitialScore { get; set; }
    public string? InitialPrimaryScore { get; set; }
    public string? InitialGrade { get; set; }
    public string? ParentName { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Workspace Workspace { get; set; } = null!;
    public Student Student { get; set; } = null!;
    public LearningProgram Program { get; set; } = null!;
}
