using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Homework;

public sealed class NativeHomeworkService(PlatformDbContext db, TimeProvider clock)
{
    public Task<List<NativeTaskView>> TasksAsync(Guid workspace, CancellationToken ct) =>
        db.NativeHomeworkTasks.AsNoTracking().Where(x => x.WorkspaceId == workspace)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new NativeTaskView(x.Id, x.ProgramId, x.Title, x.Prompt, x.CreatedAt))
            .ToListAsync(ct);

    public async Task<(int Status, object? Value)> CreateAsync(Guid workspace, CreateNativeTaskRequest request, CancellationToken ct)
    {
        var title = request.Title?.Trim() ?? "";
        var prompt = request.Prompt?.Trim() ?? "";
        if (request.RequestId == Guid.Empty || request.ProgramId == Guid.Empty || title.Length is < 1 or > 200 ||
            prompt.Length is < 1 or > 10000) return (400, "Fill in the program, title (1–200) and task text (1–10000).");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockAsync(workspace, request.RequestId, ct);
        var existing = await db.NativeHomeworkTasks.AsNoTracking().SingleOrDefaultAsync(x =>
            x.WorkspaceId == workspace && x.RequestId == request.RequestId, ct);
        if (existing is not null)
            return existing.ProgramId == request.ProgramId && existing.Title == title && existing.Prompt == prompt
                ? (200, new NativeTaskView(existing.Id, existing.ProgramId, existing.Title, existing.Prompt, existing.CreatedAt))
                : (409, "Request ID already used for another task.");
        if (!await db.Programs.AnyAsync(x => x.WorkspaceId == workspace && x.Id == request.ProgramId && x.IsActive, ct))
            return (404, null);
        var task = new NativeHomeworkTask { Id = Guid.NewGuid(), WorkspaceId = workspace,
            ProgramId = request.ProgramId, RequestId = request.RequestId, Title = title, Prompt = prompt,
            CreatedAt = clock.GetUtcNow() };
        db.NativeHomeworkTasks.Add(task);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return (201, new NativeTaskView(task.Id, task.ProgramId, task.Title, task.Prompt, task.CreatedAt));
    }

    public async Task<(int Status, object? Value)> AssignAsync(Guid workspace, AssignNativeTaskRequest request, CancellationToken ct)
    {
        var ids = request.MembershipIds?.Distinct().Order().ToArray() ?? [];
        if (request.RequestId == Guid.Empty || request.TaskId == Guid.Empty || ids.Length is < 1 or > 100 ||
            ids.Any(x => x == Guid.Empty) || request.DeadlineHours is not (24 or 48 or 72))
            return (400, "Choose a task, students and a 24/48/72 hour deadline.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockAsync(workspace, request.RequestId, ct);
        var existing = await db.NativeHomeworkAssignments.AsNoTracking()
            .Where(x => x.WorkspaceId == workspace && x.RequestId == request.RequestId).ToListAsync(ct);
        if (existing.Count > 0)
            return existing.Count == ids.Length && existing.All(x => x.TaskId == request.TaskId &&
                ids.Contains(x.MembershipId) && (x.DeadlineAt - x.AssignedAt).TotalHours == request.DeadlineHours)
                ? (200, existing.Select(x => x.Id).ToArray()) : (409, "Request ID already used for another assignment.");
        var task = await db.NativeHomeworkTasks.AsNoTracking().SingleOrDefaultAsync(x =>
            x.WorkspaceId == workspace && x.Id == request.TaskId, ct);
        if (task is null) return (404, null);
        var members = await db.WorkspaceStudentMemberships.AsNoTracking().Where(x =>
            x.WorkspaceId == workspace && x.ProgramId == task.ProgramId && x.IsActive && ids.Contains(x.Id))
            .Select(x => new { x.Id, x.StudentId }).ToListAsync(ct);
        if (members.Count != ids.Length) return (404, null);
        var now = clock.GetUtcNow();
        var items = members.Select(m => new NativeHomeworkAssignment { Id = Guid.NewGuid(),
            WorkspaceId = workspace, TaskId = task.Id, ProgramId = task.ProgramId,
            MembershipId = m.Id, StudentId = m.StudentId, RequestId = request.RequestId,
            AssignedAt = now, DeadlineAt = now.AddHours(request.DeadlineHours) }).ToArray();
        db.NativeHomeworkAssignments.AddRange(items);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return (201, items.Select(x => x.Id).ToArray());
    }

    public async Task<List<NativeAssignmentView>> TeacherAssignmentsAsync(Guid workspace, CancellationToken ct) =>
        await Query(workspace).OrderByDescending(x => x.AssignedAt).Take(300)
            .Select(x => new NativeAssignmentView(x.Id, x.TaskId, x.MembershipId, x.ProgramId,
                db.NativeHomeworkTasks.Where(t => t.Id == x.TaskId && t.WorkspaceId == workspace).Select(t => t.Title).First(),
                db.NativeHomeworkTasks.Where(t => t.Id == x.TaskId && t.WorkspaceId == workspace).Select(t => t.Prompt).First(),
                x.AssignedAt, x.DeadlineAt, x.Answer, x.SubmittedAt, x.ScorePercent, x.TeacherFeedback, x.GradedAt)).ToListAsync(ct);

    public async Task<List<NativeAssignmentView>?> StudentAssignmentsAsync(ClaimsPrincipal principal, CancellationToken ct)
    {
        var identity = await StudentAsync(principal, ct);
        if (identity is null) return null;
        var (workspace, membership, student) = identity.Value;
        return await Query(workspace).Where(x => x.MembershipId == membership &&
            x.StudentId == student).OrderByDescending(x => x.AssignedAt).Take(100)
            .Select(x => new NativeAssignmentView(x.Id, x.TaskId, x.MembershipId, x.ProgramId,
                db.NativeHomeworkTasks.Where(t => t.Id == x.TaskId && t.WorkspaceId == x.WorkspaceId).Select(t => t.Title).First(),
                db.NativeHomeworkTasks.Where(t => t.Id == x.TaskId && t.WorkspaceId == x.WorkspaceId).Select(t => t.Prompt).First(),
                x.AssignedAt, x.DeadlineAt, x.Answer, x.SubmittedAt, x.ScorePercent, x.TeacherFeedback, x.GradedAt)).ToListAsync(ct);
    }

    public async Task<(int Status, object? Value)> SubmitAsync(ClaimsPrincipal principal, SubmitNativeAnswerRequest request, CancellationToken ct)
    {
        var answer = request.Answer?.Trim() ?? "";
        if (request.AssignmentId == Guid.Empty || request.SubmissionId == Guid.Empty || answer.Length is < 1 or > 10000)
            return (400, "Answer must contain 1–10000 characters.");
        var identity = await StudentAsync(principal, ct);
        if (identity is null) return (401, null);
        var (workspace, membership, student) = identity.Value;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockAsync(workspace, request.AssignmentId, ct);
        var assignment = await Query(workspace).SingleOrDefaultAsync(x =>
            x.Id == request.AssignmentId && x.MembershipId == membership &&
            x.StudentId == student, ct);
        if (assignment is null) return (404, null);
        if (assignment.SubmissionId is not null)
            return assignment.SubmissionId == request.SubmissionId && assignment.Answer == answer
                ? (200, new { assignment.Id, assignment.SubmittedAt })
                : (409, "This assignment has already been submitted.");
        assignment.Answer = answer;
        assignment.SubmissionId = request.SubmissionId;
        assignment.SubmittedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return (201, new { assignment.Id, assignment.SubmittedAt });
    }

    public async Task<(int Status, object? Value)> GradeAsync(Guid workspace, GradeNativeAnswerRequest request, CancellationToken ct)
    {
        var feedback = string.IsNullOrWhiteSpace(request.Feedback) ? null : request.Feedback.Trim();
        if (request.RequestId == Guid.Empty || request.AssignmentId == Guid.Empty ||
            request.ScorePercent is < 0 or > 100 || feedback?.Length > 2000)
            return (400, "Score must be 0–100; feedback must be at most 2000 characters.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockAsync(workspace, request.AssignmentId, ct);
        var assignment = await Query(workspace).SingleOrDefaultAsync(x => x.Id == request.AssignmentId, ct);
        if (assignment is null) return (404, null);
        if (assignment.SubmittedAt is null || assignment.SubmissionId is null)
            return (409, "Student has not submitted an answer.");
        if (assignment.GradeRequestId is not null)
            return assignment.GradeRequestId == request.RequestId &&
                   assignment.ScorePercent == request.ScorePercent &&
                   assignment.TeacherFeedback == feedback
                ? (200, new { assignment.Id, assignment.ScorePercent, assignment.TeacherFeedback, assignment.GradedAt })
                : (409, "This answer has already been graded. Refresh the assignment.");
        assignment.ScorePercent = request.ScorePercent;
        assignment.TeacherFeedback = feedback;
        assignment.GradedAt = clock.GetUtcNow();
        assignment.GradeRequestId = request.RequestId;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return (201, new { assignment.Id, assignment.ScorePercent, assignment.TeacherFeedback, assignment.GradedAt });
    }

    private IQueryable<NativeHomeworkAssignment> Query(Guid workspace) =>
        db.NativeHomeworkAssignments.Where(x => x.WorkspaceId == workspace);

    private async Task<(Guid Workspace, Guid Membership, Guid Student)?> StudentAsync(ClaimsPrincipal principal, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirst("workspace_id")?.Value, out var workspace) ||
            !Guid.TryParse(principal.FindFirst("membership_id")?.Value, out var membership) ||
            !Guid.TryParse(principal.FindFirst("sub")?.Value, out var student)) return null;
        return await db.WorkspaceStudentMemberships.AsNoTracking().AnyAsync(x => x.WorkspaceId == workspace &&
            x.Id == membership && x.StudentId == student && x.IsActive, ct)
            ? (workspace, membership, student) : null;
    }

    private async Task LockAsync(Guid workspace, Guid request, CancellationToken ct)
    {
        var key = "native-homework:" + workspace.ToString("N") + ":" + request.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))", ct);
    }
}
