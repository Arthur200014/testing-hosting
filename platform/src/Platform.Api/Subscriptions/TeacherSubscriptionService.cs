using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Subscriptions;

public sealed record TeacherSubscriptionWriteRequest(
    int PackageSize, DateTimeOffset? ResetAt, decimal? LessonPrice,
    int? BaseLessonCount, DateTimeOffset? ExpectedUpdatedAt);

public enum TeacherSubscriptionWriteStatus { Created, Updated, Duplicate, Conflict, NotFound, InvalidRequest }

public sealed record TeacherSubscriptionWriteResult(
    TeacherSubscriptionWriteStatus Status, TeacherSubscriptionView? Response = null,
    Dictionary<string, string[]>? Errors = null);

public sealed class TeacherSubscriptionService(PlatformDbContext db, TimeProvider clock)
{
    public async Task<TeacherSubscriptionWriteResult> SaveAsync(
        Guid workspaceId, Guid membershipId, TeacherSubscriptionWriteRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.PackageSize is < 1 or > 1000)
            errors["packageSize"] = ["PackageSize must be between 1 and 1000."];
        if (request.BaseLessonCount is < 0)
            errors["baseLessonCount"] = ["BaseLessonCount cannot be negative."];
        if (request.LessonPrice is < 0 or > 9_999_999_999.99m ||
            request.LessonPrice is { } price && decimal.Round(price, 2) != price)
            errors["lessonPrice"] = ["LessonPrice must be nonnegative with at most two decimal places."];
        if (errors.Count > 0) return new(TeacherSubscriptionWriteStatus.InvalidRequest, Errors: errors);

        var member = await db.WorkspaceStudentMemberships.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && x.Id == membershipId &&
                x.IsActive && x.Student.IsActive && x.Program.IsActive)
            .Select(x => new { x.StudentId, x.ProgramId })
            .SingleOrDefaultAsync(cancellationToken);
        if (member is null) return new(TeacherSubscriptionWriteStatus.NotFound);

        var resetAt = request.ResetAt is null ? null : Truncate(request.ResetAt.Value);
        var expected = request.ExpectedUpdatedAt is null ? null : Truncate(request.ExpectedUpdatedAt.Value);
        var existing = await FindAsync(workspaceId, membershipId, cancellationToken);
        if (existing is not null)
        {
            if (Matches(existing, request, resetAt))
                return new(TeacherSubscriptionWriteStatus.Duplicate, View(existing));
            if (expected is null || expected != existing.UpdatedAt)
                return new(TeacherSubscriptionWriteStatus.Conflict);

            var now = Truncate(clock.GetUtcNow());
            var updatedAt = now > existing.UpdatedAt ? now : existing.UpdatedAt.AddTicks(10);
            var changed = await db.SubscriptionSnapshots
                .Where(x => x.Id == existing.Id && x.WorkspaceId == workspaceId &&
                    x.MembershipId == membershipId && x.UpdatedAt == existing.UpdatedAt &&
                    x.Membership.IsActive && x.Membership.Student.IsActive && x.Membership.Program.IsActive)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(x => x.PackageSize, request.PackageSize)
                    .SetProperty(x => x.ResetAt, resetAt)
                    .SetProperty(x => x.LessonPrice, request.LessonPrice)
                    .SetProperty(x => x.BaseLessonCount, request.BaseLessonCount)
                    .SetProperty(x => x.UpdatedAt, updatedAt), cancellationToken);
            if (changed == 0)
            {
                var winner = await FindAsync(workspaceId, membershipId, cancellationToken);
                return winner is not null && Matches(winner, request, resetAt)
                    ? new(TeacherSubscriptionWriteStatus.Duplicate, View(winner))
                    : new(TeacherSubscriptionWriteStatus.Conflict);
            }
            return new(TeacherSubscriptionWriteStatus.Updated,
                new(membershipId, member.StudentId, member.ProgramId, request.PackageSize,
                    resetAt, updatedAt, request.LessonPrice, request.BaseLessonCount));
        }

        if (expected is not null) return new(TeacherSubscriptionWriteStatus.Conflict);
        var snapshot = new SubscriptionSnapshot
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = membershipId,
            StudentId = member.StudentId, ProgramId = member.ProgramId,
            PackageSize = request.PackageSize, ResetAt = resetAt,
            LessonPrice = request.LessonPrice, BaseLessonCount = request.BaseLessonCount,
            UpdatedAt = Truncate(clock.GetUtcNow())
        };
        db.SubscriptionSnapshots.Add(snapshot);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (
            exception.InnerException is PostgresException postgres &&
            postgres.SqlState == PostgresErrorCodes.UniqueViolation &&
            postgres.ConstraintName == "IX_SubscriptionSnapshots_WorkspaceId_MembershipId")
        {
            db.ChangeTracker.Clear();
            var winner = await FindAsync(workspaceId, membershipId, cancellationToken);
            if (winner is null) throw;
            return Matches(winner, request, resetAt)
                ? new(TeacherSubscriptionWriteStatus.Duplicate, View(winner))
                : new(TeacherSubscriptionWriteStatus.Conflict);
        }
        return new(TeacherSubscriptionWriteStatus.Created, View(snapshot));
    }

    private Task<SubscriptionSnapshot?> FindAsync(
        Guid workspaceId, Guid membershipId, CancellationToken cancellationToken) =>
        db.SubscriptionSnapshots.AsNoTracking().SingleOrDefaultAsync(x =>
            x.WorkspaceId == workspaceId && x.MembershipId == membershipId, cancellationToken);

    private static bool Matches(SubscriptionSnapshot current, TeacherSubscriptionWriteRequest request,
        DateTimeOffset? resetAt) =>
        current.PackageSize == request.PackageSize && current.ResetAt == resetAt &&
        current.LessonPrice == request.LessonPrice && current.BaseLessonCount == request.BaseLessonCount;

    private static TeacherSubscriptionView View(SubscriptionSnapshot snapshot) =>
        new(snapshot.MembershipId, snapshot.StudentId, snapshot.ProgramId,
            snapshot.PackageSize, snapshot.ResetAt, snapshot.UpdatedAt,
            snapshot.LessonPrice, snapshot.BaseLessonCount);

    private static DateTimeOffset Truncate(DateTimeOffset date) =>
        new(date.ToUniversalTime().Ticks - date.ToUniversalTime().Ticks % 10, TimeSpan.Zero);
}
