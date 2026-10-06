using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.Homework;

public sealed class HomeworkCatalogItem
{
    public Guid Id { get; init; }
    public Guid WorkspaceId { get; init; }
    public Guid ProgramId { get; init; }
    public required string HomeworkId { get; init; }
    public int TaskNumber { get; init; }
    public required string Name { get; init; }
    public required string Url { get; init; }
    public bool IsActive { get; set; }
    public int SortOrder { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public Workspace Workspace { get; init; } = null!;
    public LearningProgram Program { get; init; } = null!;
}
