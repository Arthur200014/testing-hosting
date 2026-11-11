using System.Data;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Lessons;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.StudentImport;
using TestingHosting.Platform.Subscriptions;

namespace TestingHosting.Platform.HistoryImport;

public sealed record HistoryImportIssue(string Sheet, int RowNumber, string Reason);
public sealed record HistoryImportReport(
    string Mode, bool CanApply, int LessonsCreated, int LessonsUnchanged,
    int ParticipantsCreated, int ParticipantsUnchanged,
    int SubscriptionsCreated, int SubscriptionsUnchanged,
    IReadOnlyList<HistoryImportIssue> Skipped, IReadOnlyList<HistoryImportIssue> Conflicts);

public sealed class HistoryImportService(Func<PlatformDbContext> dbFactory)
{
    private sealed record LessonRow(int Row, string LegacyId, string ExternalStudentId, string ProgramSourceId,
        DateTimeOffset LessonAt, int DurationMinutes, string? Tasks, string? Comment,
        string Attendance, DateTimeOffset CreatedAt);
    private sealed record SubscriptionRow(int Row, string ExternalStudentId, string ProgramSourceId,
        int PackageSize, DateTimeOffset? ResetAt, DateTimeOffset UpdatedAt,
        decimal? LessonPrice, int? BaseLessonCount);

    public async Task<HistoryImportReport> ImportAsync(
        string xlsx, string mapPath, string workspaceSlug, bool apply,
        CancellationToken cancellationToken = default)
    {
        var skipped = new List<HistoryImportIssue>();
        var conflicts = new List<HistoryImportIssue>();
        var (lessonRows, subscriptionRows) = ParseSource(xlsx, skipped);
        var programMap = new ProgramMapParser().Parse(mapPath);
        foreach (var diagnostic in programMap.Diagnostics)
            conflicts.Add(new("program-map", diagnostic.RowNumber, diagnostic.Category));

        await using var db = dbFactory();
        var workspace = await db.Workspaces.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Slug == workspaceSlug.Trim().ToLowerInvariant() && x.IsActive, cancellationToken);
        if (workspace is null)
            conflicts.Add(new("database", 0, "workspace_not_found"));

        if (conflicts.Count != 0)
            return Blocked();

        var memberships = await db.WorkspaceStudentMemberships.AsNoTracking()
            .Include(x => x.Program)
            .Where(x => x.WorkspaceId == workspace!.Id && x.ImportSource == StudentImportService.ImportSource)
            .ToListAsync(cancellationToken);
        var memberByExternalId = memberships
            .Where(x => x.ImportExternalId is not null)
            .ToDictionary(x => x.ImportExternalId!, StringComparer.Ordinal);

        var storedLessons = await db.Lessons.AsNoTracking()
            .Where(x => x.WorkspaceId == workspace!.Id).ToListAsync(cancellationToken);
        var lessonByLegacy = storedLessons.ToDictionary(x => x.LegacyLessonId, StringComparer.Ordinal);
        var participantByPair = (await db.LessonParticipants.AsNoTracking()
            .Where(x => x.WorkspaceId == workspace!.Id).ToListAsync(cancellationToken))
            .ToDictionary(x => (x.LessonId, x.StudentId));
        var snapshotByMember = (await db.SubscriptionSnapshots.AsNoTracking()
            .Where(x => x.WorkspaceId == workspace!.Id).ToListAsync(cancellationToken))
            .ToDictionary(x => x.MembershipId);

        var newLessons = new List<Lesson>();
        var newParticipants = new List<LessonParticipant>();
        var newSnapshots = new List<SubscriptionSnapshot>();
        var sameLessons = new HashSet<Guid>();
        var sameParticipants = 0;
        var sameSnapshots = 0;

        foreach (var source in lessonRows)
        {
            if (!TryMembership(source.ExternalStudentId, source.ProgramSourceId, "Занятия", source.Row,
                    out var membership)) continue;
            if (!lessonByLegacy.TryGetValue(source.LegacyId, out var lesson))
            {
                lesson = new Lesson
                {
                    Id = Guid.NewGuid(), WorkspaceId = workspace!.Id, LegacyLessonId = source.LegacyId,
                    LessonAt = source.LessonAt, CreatedAt = source.CreatedAt
                };
                newLessons.Add(lesson);
                lessonByLegacy.Add(source.LegacyId, lesson);
            }
            else if (lesson.LessonAt != source.LessonAt || lesson.CreatedAt != source.CreatedAt)
            {
                conflicts.Add(new("Занятия", source.Row, "lesson_identity_conflict"));
                continue;
            }
            else if (!newLessons.Contains(lesson))
            {
                sameLessons.Add(lesson.Id);
            }

            var pair = (lesson.Id, membership!.StudentId);
            if (participantByPair.TryGetValue(pair, out var previous))
            {
                if (previous.MembershipId == membership.Id &&
                    previous.ProgramId == membership.ProgramId &&
                    previous.DurationMinutes == source.DurationMinutes &&
                    previous.TaskNumbers == source.Tasks &&
                    previous.TopicComment == source.Comment &&
                    previous.AttendanceStatus == source.Attendance)
                    sameParticipants++;
                else conflicts.Add(new("Занятия", source.Row, "participant_conflict"));
                continue;
            }

            var participant = new LessonParticipant
            {
                Id = Guid.NewGuid(), WorkspaceId = workspace!.Id, LessonId = lesson.Id,
                MembershipId = membership.Id, StudentId = membership.StudentId, ProgramId = membership.ProgramId,
                DurationMinutes = source.DurationMinutes, TaskNumbers = source.Tasks,
                TopicComment = source.Comment, AttendanceStatus = source.Attendance,
                CreatedAt = source.CreatedAt
            };
            newParticipants.Add(participant);
            participantByPair.Add(pair, participant);
        }

        foreach (var source in subscriptionRows)
        {
            if (!TryMembership(source.ExternalStudentId, source.ProgramSourceId, "Абонементы", source.Row,
                    out var membership)) continue;
            if (snapshotByMember.TryGetValue(membership!.Id, out var prior))
            {
                if (prior.PackageSize == source.PackageSize && prior.ResetAt == source.ResetAt &&
                    prior.UpdatedAt == source.UpdatedAt && prior.LessonPrice == source.LessonPrice &&
                    prior.BaseLessonCount == source.BaseLessonCount)
                    sameSnapshots++;
                else conflicts.Add(new("Абонементы", source.Row, "existing_subscription_conflict"));
                continue;
            }
            var snapshot = new SubscriptionSnapshot
            {
                Id = Guid.NewGuid(), WorkspaceId = workspace!.Id, MembershipId = membership.Id,
                StudentId = membership.StudentId, ProgramId = membership.ProgramId,
                PackageSize = source.PackageSize, ResetAt = source.ResetAt, UpdatedAt = source.UpdatedAt,
                LessonPrice = source.LessonPrice, BaseLessonCount = source.BaseLessonCount
            };
            newSnapshots.Add(snapshot);
            snapshotByMember.Add(membership.Id, snapshot);
        }

        if (conflicts.Count == 0 && apply)
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
            db.Lessons.AddRange(newLessons);
            db.LessonParticipants.AddRange(newParticipants);
            db.SubscriptionSnapshots.AddRange(newSnapshots);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        return Report(conflicts.Count == 0);

        bool TryMembership(string externalId, string programSourceId, string sheet, int row,
            out TestingHosting.Platform.Students.WorkspaceStudentMembership? membership)
        {
            membership = null;
            if (!memberByExternalId.TryGetValue(StudentWorkbookParser.NormalizeExternalId(externalId), out var found))
            {
                skipped.Add(new(sheet, row, "student_not_imported"));
                return false;
            }
            if (!programMap.Entries.TryGetValue(StudentWorkbookParser.NormalizeExternalId(programSourceId), out var target) ||
                !string.Equals(target.Code, found.Program.Code, StringComparison.Ordinal))
            {
                skipped.Add(new(sheet, row, "program_mismatch"));
                return false;
            }
            membership = found;
            return true;
        }

        HistoryImportReport Blocked() => new(apply ? "apply" : "dry-run", false,
            0, 0, 0, 0, 0, 0, skipped, conflicts);

        HistoryImportReport Report(bool allowed) => new(apply ? "apply" : "dry-run", allowed,
            newLessons.Count, sameLessons.Count, newParticipants.Count, sameParticipants,
            newSnapshots.Count, sameSnapshots, skipped, conflicts);
    }

    private static (List<LessonRow>, List<SubscriptionRow>) ParseSource(
        string path, ICollection<HistoryImportIssue> skipped)
    {
        const int maxWorkbookBytes = 32 * 1024 * 1024;
        var file = new FileInfo(path);
        if (!file.Exists || file.Length > maxWorkbookBytes)
            throw new InvalidDataException("XLSX is missing or exceeds the size limit.");

        using var wb = new XLWorkbook(path);
        var lessons = new List<LessonRow>();
        var snapshots = new List<SubscriptionRow>();
        if (!wb.TryGetWorksheet("Занятия", out var lessonSheet) ||
            !wb.TryGetWorksheet("Абонементы", out var subscriptionSheet))
            throw new InvalidDataException("Required source sheets are missing.");

        RequireHeader(lessonSheet, ["lessonId", "studentId", "studentName", "lessonAt",
            "durationMinutes", "taskNumbers", "topicComment", "attendanceStatus", "createdAt", "programId"]);
        RequireHeader(subscriptionSheet, ["studentId", "studentName", "packageSize", "resetAt",
            "updatedAt", "programId", "lessonPrice", "baseLessonCount"]);

        for (var n = 2; n <= (lessonSheet.LastRowUsed()?.RowNumber() ?? 1); n++)
        {
            var r = lessonSheet.Row(n);
            if (r.Cell(1).IsEmpty() && r.CellsUsed().All(c => c.IsEmpty())) continue;
            var legacy = Text(r.Cell(1));
            var externalStudent = Text(r.Cell(2));
            var program = Text(r.Cell(10));
            var status = Text(r.Cell(8));
            if (legacy.Length is 0 or > 128 || externalStudent.Length is 0 or > 200 ||
                program.Length is 0 or > 200 || status.Length is 0 or > 128 ||
                !TryDate(r.Cell(4), out var lessonAt) ||
                !TryDate(r.Cell(9), out var createdAt) ||
                !TryInt(r.Cell(5), 1, 1440, out var duration) ||
                Text(r.Cell(6)).Length > 2048 || Text(r.Cell(7)).Length > 4096)
            {
                skipped.Add(new("Занятия", n, "invalid_source_fields"));
                continue;
            }
            lessons.Add(new(n, legacy, externalStudent, program, lessonAt, duration,
                Optional(r.Cell(6)), Optional(r.Cell(7)), status, createdAt));
        }

        for (var n = 2; n <= (subscriptionSheet.LastRowUsed()?.RowNumber() ?? 1); n++)
        {
            var r = subscriptionSheet.Row(n);
            if (r.Cell(1).IsEmpty() && r.CellsUsed().All(c => c.IsEmpty())) continue;
            var externalStudent = Text(r.Cell(1));
            var program = Text(r.Cell(6));
            var priceText = Text(r.Cell(7));
            var baseCountText = Text(r.Cell(8));
            if (externalStudent.Length is 0 or > 200 || program.Length is 0 or > 200 ||
                !TryInt(r.Cell(3), 1, 1000, out var package) ||
                !TryOptionalDate(r.Cell(4), out var resetAt) ||
                !TryDate(r.Cell(5), out var updatedAt) ||
                (priceText.Length > 0 && (!decimal.TryParse(priceText,
                    NumberStyles.Number, CultureInfo.InvariantCulture, out var price) ||
                    price is < 0 or > 9999999999m)) ||
                (baseCountText.Length > 0 && !TryInt(r.Cell(8), 0, 1000000, out _)))
            {
                skipped.Add(new("Абонементы", n, "invalid_source_fields"));
                continue;
            }
            snapshots.Add(new(n, externalStudent, program, package, resetAt, updatedAt,
                priceText.Length == 0 ? null : decimal.Parse(priceText, CultureInfo.InvariantCulture),
                baseCountText.Length == 0 ? null : int.Parse(baseCountText, CultureInfo.InvariantCulture)));
        }
        return (lessons, snapshots);
    }

    private static void RequireHeader(IXLWorksheet sheet, IReadOnlyList<string> expected)
    {
        if ((sheet.Row(1).LastCellUsed()?.Address.ColumnNumber ?? 0) != expected.Count)
            throw new InvalidDataException("Unexpected workbook header width.");
        for (var i = 0; i < expected.Count; i++)
            if (!string.Equals(Text(sheet.Cell(1, i + 1)), expected[i], StringComparison.Ordinal))
                throw new InvalidDataException("Unexpected workbook header.");
    }

    private static string Text(IXLCell cell) => cell.GetFormattedString().Normalize(NormalizationForm.FormKC).Trim();
    private static string? Optional(IXLCell cell) => Text(cell) is { Length: > 0 } value ? value : null;
    private static bool TryInt(IXLCell cell, int min, int max, out int value) =>
        int.TryParse(Text(cell), NumberStyles.Integer, CultureInfo.InvariantCulture, out value) &&
        value >= min && value <= max;
    private static bool TryOptionalDate(IXLCell cell, out DateTimeOffset? value)
    {
        if (Text(cell).Length == 0) { value = null; return true; }
        if (TryDate(cell, out var parsed)) { value = parsed; return true; }
        value = null;
        return false;
    }
    private static bool TryDate(IXLCell cell, out DateTimeOffset value)
    {
        value = default;
        try
        {
            DateTime? local = cell.DataType switch
            {
                XLDataType.DateTime => cell.GetDateTime(),
                XLDataType.Number when cell.TryGetValue<double>(out var serial) =>
                    DateTime.FromOADate(serial),
                _ => null
            };
            if (local is null)
            {
                var text = Text(cell);
                if (Regex.IsMatch(text, @"^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$") &&
                    DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture,
                        DateTimeStyles.RoundtripKind, out var offset))
                    value = offset.ToUniversalTime();
                else if (DateTime.TryParseExact(text,
                    ["dd.MM.yyyy HH:mm:ss", "dd.MM.yyyy HH:mm", "yyyy-MM-dd HH:mm:ss"],
                    CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
                    local = parsed;
                else return false;
            }
            if (local is not null)
            {
                var moscow = TimeZoneInfo.FindSystemTimeZoneById("Europe/Moscow");
                value = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(
                    DateTime.SpecifyKind(local.Value, DateTimeKind.Unspecified), moscow));
            }
            return value.Year is >= 2015 and <= 2100;
        }
        catch (Exception error) when (error is FormatException or ArgumentException or OverflowException)
        {
            return false;
        }
    }
}
