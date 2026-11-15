using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.Lessons;

// One legacy lesson can be attended by multiple students; it is not duplicated per student.
public sealed class Lesson
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public required string LegacyLessonId { get; set; }
    public DateTimeOffset LessonAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    // Optional class link; existing imported lessons retain null links.
    public Guid? IndividualClassId { get; set; }
    public Guid? GroupClassId { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Workspace Workspace { get; set; } = null!;
    public ICollection<LessonParticipant> Participants { get; set; } = [];
}

public sealed class LessonParticipant
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public Guid LessonId { get; set; }
    public Guid MembershipId { get; set; }
    public Guid StudentId { get; set; }
    public Guid ProgramId { get; set; }
    public int DurationMinutes { get; set; }
    public string? TaskNumbers { get; set; }
    public string? TopicComment { get; set; }
    public required string AttendanceStatus { get; set; }
    public string? Reaction { get; set; }
    public string? Feedback { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Lesson Lesson { get; set; } = null!;
    public WorkspaceStudentMembership Membership { get; set; } = null!;
}
