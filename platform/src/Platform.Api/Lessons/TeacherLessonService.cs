using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Lessons;

public sealed record TeacherLessonParticipantRequest(
    Guid MembershipId, int DurationMinutes, string? TaskNumbers,
    string? TopicComment, string? AttendanceStatus);

public sealed record TeacherLessonWriteRequest(
    Guid RequestId, DateTimeOffset? LessonAt,
    List<TeacherLessonParticipantRequest>? Participants);

public sealed record TeacherLessonWriteResponse(Guid LessonId, string LegacyLessonId, int ParticipantCount);

public enum TeacherLessonWriteStatus { Created, Duplicate, Conflict, InvalidRequest, MembershipNotFound }

public sealed record TeacherLessonWriteResult(
    TeacherLessonWriteStatus Status, TeacherLessonWriteResponse? Response = null,
    Dictionary<string, string[]>? Errors = null);

public sealed class TeacherLessonService(PlatformDbContext db, TimeProvider clock)
{
    public async Task<TeacherLessonWriteResult> SaveAsync(
        Guid workspaceId, TeacherLessonWriteRequest request, CancellationToken cancellationToken)
    {
        if (db.Database.CurrentTransaction is not null)
        {
            await LockRequestAsync(workspaceId, request.RequestId, cancellationToken);
            return await SaveCoreAsync(workspaceId, request, cancellationToken);
        }
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.ReadCommitted, cancellationToken);
        await LockRequestAsync(workspaceId, request.RequestId, cancellationToken);
        var result = await SaveCoreAsync(workspaceId, request, cancellationToken);
        if (result.Status == TeacherLessonWriteStatus.Created)
            await transaction.CommitAsync(cancellationToken);
        return result;
    }

    private async Task LockRequestAsync(Guid workspaceId, Guid requestId, CancellationToken cancellationToken)
    {
        var lockKey = workspaceId.ToString("N") + ":" + requestId.ToString("N");
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))", cancellationToken);
    }

    private async Task<TeacherLessonWriteResult> SaveCoreAsync(
        Guid workspaceId, TeacherLessonWriteRequest request, CancellationToken cancellationToken)
    {
        var validation = Validate(request);
        if (validation.Errors.Count > 0)
            return new(TeacherLessonWriteStatus.InvalidRequest, Errors: validation.Errors);

        var lessonId = "api:" + request.RequestId.ToString("N");
        var existing = await FindAsync(workspaceId, lessonId, cancellationToken);
        if (existing is not null) return Compare(existing, validation);

        var ids = validation.Participants.Select(x => x.MembershipId).ToList();
        var members = await db.WorkspaceStudentMemberships.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && ids.Contains(x.Id) &&
                x.IsActive && x.Student.IsActive && x.Program.IsActive)
            .Select(x => new { x.Id, x.StudentId, x.ProgramId })
            .ToListAsync(cancellationToken);
        if (members.Count != ids.Count)
            return new(TeacherLessonWriteStatus.MembershipNotFound);
        if (members.Select(x => x.ProgramId).Distinct().Count() != 1)
            return new(TeacherLessonWriteStatus.InvalidRequest, Errors: new()
            {
                ["participants"] = ["All participants must belong to one program."]
            });

        var now = Truncate(clock.GetUtcNow());
        var lesson = new Lesson
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, LegacyLessonId = lessonId,
            LessonAt = validation.LessonAt, CreatedAt = now
        };
        var byId = members.ToDictionary(x => x.Id);
        foreach (var item in validation.Participants)
        {
            var member = byId[item.MembershipId];
            lesson.Participants.Add(new LessonParticipant
            {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId,
                MembershipId = member.Id, StudentId = member.StudentId,
                ProgramId = member.ProgramId, DurationMinutes = item.DurationMinutes,
                TaskNumbers = item.TaskNumbers, TopicComment = item.TopicComment,
                AttendanceStatus = item.AttendanceStatus, CreatedAt = now
            });
        }
        db.Lessons.Add(lesson);
        try
        {
            // EF saves the lesson and all attendance rows in one database transaction.
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (
            exception.InnerException is PostgresException postgres &&
            postgres.SqlState == PostgresErrorCodes.UniqueViolation &&
            postgres.ConstraintName == "IX_Lessons_WorkspaceId_LegacyLessonId")
        {
            db.ChangeTracker.Clear();
            var winner = await FindAsync(workspaceId, lessonId, cancellationToken);
            if (winner is null) throw;
            return Compare(winner, validation);
        }

        return new(TeacherLessonWriteStatus.Created,
            new(lesson.Id, lesson.LegacyLessonId, lesson.Participants.Count));
    }

    private Task<Lesson?> FindAsync(Guid workspaceId, string lessonId, CancellationToken cancellationToken) =>
        db.Lessons.AsNoTracking().Include(x => x.Participants)
            .SingleOrDefaultAsync(x => x.WorkspaceId == workspaceId && x.LegacyLessonId == lessonId,
                cancellationToken);

    private static TeacherLessonWriteResult Compare(Lesson existing, CanonicalLesson canonical)
    {
        var actual = existing.Participants.OrderBy(x => x.MembershipId).ToList();
        var expected = canonical.Participants.OrderBy(x => x.MembershipId).ToList();
        if (existing.LessonAt != canonical.LessonAt || actual.Count != expected.Count ||
            actual.Where((item, i) => item.MembershipId != expected[i].MembershipId ||
                item.DurationMinutes != expected[i].DurationMinutes ||
                item.TaskNumbers != expected[i].TaskNumbers ||
                item.TopicComment != expected[i].TopicComment ||
                item.AttendanceStatus != expected[i].AttendanceStatus).Any())
            return new(TeacherLessonWriteStatus.Conflict);

        return new(TeacherLessonWriteStatus.Duplicate,
            new(existing.Id, existing.LegacyLessonId, actual.Count));
    }

    private static CanonicalLesson Validate(TeacherLessonWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty)
            errors["requestId"] = ["A non-empty request ID is required."];
        if (request.LessonAt is null || request.LessonAt == default)
            errors["lessonAt"] = ["LessonAt is required."];
        if (request.Participants is null or { Count: 0 or > 100 })
            errors["participants"] = ["Between 1 and 100 participants are required."];

        var participants = new List<CanonicalParticipant>();
        if (request.Participants is not null)
        {
            var seen = new HashSet<Guid>();
            foreach (var item in request.Participants)
            {
                var status = item.AttendanceStatus?.Trim();
                var tasks = string.IsNullOrWhiteSpace(item.TaskNumbers) ? null : item.TaskNumbers.Trim();
                var comment = string.IsNullOrWhiteSpace(item.TopicComment) ? null : item.TopicComment.Trim();
                if (item.MembershipId == Guid.Empty || !seen.Add(item.MembershipId) ||
                    item.DurationMinutes is < 1 or > 1440 ||
                    string.IsNullOrEmpty(status) || status.Length > 128 ||
                    tasks?.Length > 2048 || comment?.Length > 4096)
                {
                    errors["participants"] = ["Participant IDs, durations or attendance fields are invalid."];
                    break;
                }
                participants.Add(new(item.MembershipId, item.DurationMinutes, tasks, comment, status));
            }
        }
        return new(request.LessonAt is null ? default : Truncate(request.LessonAt.Value), participants, errors);
    }

    private static DateTimeOffset Truncate(DateTimeOffset date) =>
        new(date.ToUniversalTime().Ticks - date.ToUniversalTime().Ticks % 10, TimeSpan.Zero);

    private sealed record CanonicalParticipant(
        Guid MembershipId, int DurationMinutes, string? TaskNumbers,
        string? TopicComment, string AttendanceStatus);
    private sealed record CanonicalLesson(
        DateTimeOffset LessonAt, List<CanonicalParticipant> Participants,
        Dictionary<string, string[]> Errors);
}
