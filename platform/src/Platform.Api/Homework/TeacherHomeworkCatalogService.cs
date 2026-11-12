using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Homework;

public sealed record TeacherCreateHomeworkCatalogRequest(
    Guid RequestId, Guid ProgramId, int TaskNumber, string? Name, string? Url);

public enum TeacherCreateHomeworkCatalogStatus { Created, Duplicate, Conflict, NotFound, InvalidRequest }

public sealed record TeacherCreateHomeworkCatalogResult(
    TeacherCreateHomeworkCatalogStatus Status, TeacherHomeworkCatalogView? Response = null,
    Dictionary<string, string[]>? Errors = null);

public sealed class TeacherHomeworkCatalogService(PlatformDbContext db)
{
    public async Task<TeacherCreateHomeworkCatalogResult> CreateAsync(
        Guid workspaceId, TeacherCreateHomeworkCatalogRequest request, CancellationToken cancellationToken)
    {
        var name = request.Name?.Trim() ?? "";
        var url = request.Url?.Trim() ?? "";
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty) errors["requestId"] = ["A request ID is required."];
        if (request.ProgramId == Guid.Empty) errors["programId"] = ["A program is required."];
        if (request.TaskNumber is < 1 or > 1000) errors["taskNumber"] = ["Task number must be between 1 and 1000."];
        if (name.Length is < 1 or > 200) errors["name"] = ["Name must contain 1 to 200 characters."];
        if (url.Length is < 1 or > 2048 || !Uri.TryCreate(url, UriKind.Absolute, out var link) ||
            link.Scheme != Uri.UriSchemeHttps)
            errors["url"] = ["An absolute HTTPS URL is required (up to 2048 characters)."];
        if (errors.Count > 0) return new(TeacherCreateHomeworkCatalogStatus.InvalidRequest, Errors: errors);

        var homeworkId = "teacher-" + request.RequestId.ToString("N");
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var lockKey = workspaceId.ToString("N") + ":catalog:" + request.RequestId.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))", cancellationToken);

        var existing = await db.HomeworkCatalogItems.AsNoTracking()
            .SingleOrDefaultAsync(x => x.WorkspaceId == workspaceId && x.HomeworkId == homeworkId,
                cancellationToken);
        if (existing is not null)
            return existing.ProgramId == request.ProgramId && existing.TaskNumber == request.TaskNumber &&
                existing.Name == name && existing.Url == url
                ? new(TeacherCreateHomeworkCatalogStatus.Duplicate, View(existing))
                : new(TeacherCreateHomeworkCatalogStatus.Conflict);

        if (!await db.Programs.AsNoTracking().AnyAsync(x => x.WorkspaceId == workspaceId &&
            x.Id == request.ProgramId && x.IsActive, cancellationToken))
            return new(TeacherCreateHomeworkCatalogStatus.NotFound);

        var item = new HomeworkCatalogItem
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, ProgramId = request.ProgramId,
            HomeworkId = homeworkId, TaskNumber = request.TaskNumber, Name = name, Url = url,
            IsActive = true, SortOrder = 0, CreatedAt = DateTimeOffset.UtcNow
        };
        db.HomeworkCatalogItems.Add(item);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new(TeacherCreateHomeworkCatalogStatus.Created, View(item));
    }

    private static TeacherHomeworkCatalogView View(HomeworkCatalogItem x) =>
        new(x.Id, x.ProgramId, x.HomeworkId, x.TaskNumber, x.Name, x.Url, x.IsActive, x.SortOrder);
}
