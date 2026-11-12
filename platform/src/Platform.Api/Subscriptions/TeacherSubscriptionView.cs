namespace TestingHosting.Platform.Subscriptions;

public sealed record TeacherSubscriptionView(
    Guid MembershipId, Guid StudentId, Guid ProgramId,
    int PackageSize, DateTimeOffset? ResetAt, DateTimeOffset UpdatedAt,
    decimal? LessonPrice, int? BaseLessonCount);
