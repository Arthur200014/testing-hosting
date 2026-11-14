using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

public sealed record TeacherClassView(
    Guid Id, string Title, string Kind, Guid StudentMembershipId,
    string StudentName, Guid ProgramId, string ProgramName,
    bool IsArchived, DateTimeOffset CreatedAt);

public sealed record TeacherCreateClassRequest(Guid RequestId, Guid StudentMembershipId, string? Title);

public enum TeacherCreateClassStatus
{
    Created, Duplicate, Conflict, InvalidRequest, MembershipNotFound
}

public sealed record TeacherCreateClassResult(
    TeacherCreateClassStatus Status, TeacherClassView? Response = null,
    Dictionary<string, string[]>? Errors = null);

public sealed class TeacherClassService(PlatformDbContext db, TimeProvider clock)
{
    public Task<List<TeacherClassView>> ListAsync(
        Guid workspaceId, CancellationToken cancellationToken) =>
        Project(db.TeacherClasses.AsNoTracking().Where(x => x.WorkspaceId == workspaceId)
            .OrderBy(x => x.IsArchived).ThenBy(x => x.Title).ThenBy(x => x.Id))
            .ToListAsync(cancellationToken);

    public async Task<TeacherCreateClassResult> CreateAsync(
        Guid workspaceId, TeacherCreateClassRequest request, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty)
            errors["requestId"] = ["A non-empty request ID is required."];
        if (request.StudentMembershipId == Guid.Empty)
            errors["studentMembershipId"] = ["An active student is required."];
        var title = request.Title?.Trim();
        if (string.IsNullOrWhiteSpace(title) || title.Length > 200)
            errors["title"] = ["Title must be between 1 and 200 characters."];
        if (errors.Count > 0)
            return new(TeacherCreateClassStatus.InvalidRequest, Errors: errors);

        var existing = await FindByRequestAsync(workspaceId, request.RequestId, cancellationToken);
        if (existing is not null)
            return Compare(existing, request.StudentMembershipId, title!);

        var member = await db.WorkspaceStudentMemberships.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && x.Id == request.StudentMembershipId &&
                x.IsActive && x.Student.IsActive && x.Program.IsActive)
            .Select(x => new { x.StudentId })
            .SingleOrDefaultAsync(cancellationToken);
        if (member is null)
            return new(TeacherCreateClassStatus.MembershipNotFound);

        var item = new TeacherClass
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, RequestId = request.RequestId,
            StudentMembershipId = request.StudentMembershipId, StudentId = member.StudentId,
            Title = title!,
            CreatedAt = clock.GetUtcNow()
        };
        db.TeacherClasses.Add(item);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (
            exception.InnerException is PostgresException postgres &&
            postgres.SqlState == PostgresErrorCodes.UniqueViolation &&
            postgres.ConstraintName == "IX_TeacherClasses_WorkspaceId_RequestId")
        {
            db.ChangeTracker.Clear();
            var winner = await FindByRequestAsync(workspaceId, request.RequestId, cancellationToken);
            if (winner is null) throw;
            return Compare(winner, request.StudentMembershipId, title!);
        }

        var created = await FindByRequestAsync(workspaceId, request.RequestId, cancellationToken)
            ?? throw new InvalidOperationException("Created class could not be read back.");
        return new(TeacherCreateClassStatus.Created, ToView(created));
    }

    private Task<TeacherClass?> FindByRequestAsync(
        Guid workspaceId, Guid requestId, CancellationToken cancellationToken) =>
        db.TeacherClasses.AsNoTracking()
            .Include(x => x.StudentMembership).ThenInclude(x => x.Student)
            .Include(x => x.StudentMembership).ThenInclude(x => x.Program)
            .SingleOrDefaultAsync(x => x.WorkspaceId == workspaceId && x.RequestId == requestId,
                cancellationToken);

    private static IQueryable<TeacherClassView> Project(IQueryable<TeacherClass> classes) =>
        classes.Select(x => new TeacherClassView(
            x.Id, x.Title, x.Kind, x.StudentMembershipId,
            x.StudentMembership.Student.DisplayName, x.StudentMembership.ProgramId,
            x.StudentMembership.Program.DisplayName, x.IsArchived, x.CreatedAt));

    private static TeacherClassView ToView(TeacherClass item) => new(
        item.Id, item.Title, item.Kind, item.StudentMembershipId,
        item.StudentMembership.Student.DisplayName, item.StudentMembership.ProgramId,
        item.StudentMembership.Program.DisplayName, item.IsArchived, item.CreatedAt);

    private static TeacherCreateClassResult Compare(
        TeacherClass existing, Guid studentMembershipId, string title) =>
        existing.Kind == "individual" && !existing.IsArchived &&
        existing.StudentMembershipId == studentMembershipId && existing.Title == title
            ? new(TeacherCreateClassStatus.Duplicate, ToView(existing))
            : new(TeacherCreateClassStatus.Conflict);
}
