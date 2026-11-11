using System.Data;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.StudentImport;
using TestingHosting.Platform.TestAttempts;

namespace TestingHosting.Platform.HistoryImport;

public sealed record TestHistoryIssue(int RowNumber, string Reason);
public sealed record TestHistoryReport(string Mode, bool CanApply, int Created, int Unchanged,
    IReadOnlyList<TestHistoryIssue> Skipped, IReadOnlyList<TestHistoryIssue> Conflicts);

public sealed class TestHistoryImportService(Func<PlatformDbContext> dbFactory)
{
    private sealed record Row(int Number, string EventId, string StudentId, string ProgramSourceId,
        string TestId, DateOnly TestDate, string TopicId, string TopicName, int TaskNumber,
        int? CorrectCount, int? TotalCount, int ScorePercent, DateTimeOffset? StartedAt,
        DateTimeOffset? FinishedAt, int DurationSeconds, DateTimeOffset ServerSubmittedAt,
        string SchemaVersion);

    public async Task<TestHistoryReport> ImportAsync(string xlsx, string mapPath, string workspaceSlug,
        bool apply, CancellationToken cancellationToken = default)
    {
        var skipped = new List<TestHistoryIssue>();
        var conflicts = new List<TestHistoryIssue>();
        var rows = Parse(xlsx, skipped);
        var map = new ProgramMapParser().Parse(mapPath);
        foreach (var issue in map.Diagnostics)
            conflicts.Add(new(issue.RowNumber, "program_map_" + issue.Category));

        await using var db = dbFactory();
        var workspace = await db.Workspaces.AsNoTracking().SingleOrDefaultAsync(x =>
            x.Slug == workspaceSlug.Trim().ToLowerInvariant() && x.IsActive, cancellationToken);
        if (workspace is null) conflicts.Add(new(0, "workspace_not_found"));
        if (conflicts.Count > 0) return Report(false, 0, 0);
        var workspaceId = workspace!.Id;

        var memberships = await db.WorkspaceStudentMemberships.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && x.ImportSource == StudentImportService.ImportSource)
            .ToListAsync(cancellationToken);
        var byStudent = memberships.Where(x => x.ImportExternalId is not null)
            .ToDictionary(x => x.ImportExternalId!, StringComparer.Ordinal);
        var programs = (await db.Programs.AsNoTracking().Where(x => x.WorkspaceId == workspaceId)
            .ToListAsync(cancellationToken)).ToDictionary(x => x.Code, StringComparer.Ordinal);
        var existing = (await db.HistoricalTestResults.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId).ToListAsync(cancellationToken))
            .ToDictionary(x => x.EventId, StringComparer.Ordinal);
        var currentEventIds = (await db.TestAttempts.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId).Select(x => x.EventId)
            .ToListAsync(cancellationToken)).ToHashSet(StringComparer.Ordinal);
        var pending = new List<HistoricalTestResult>();
        var unchanged = 0;

        foreach (var row in rows)
        {
            if (!byStudent.TryGetValue(StudentWorkbookParser.NormalizeExternalId(row.StudentId), out var member))
            {
                skipped.Add(new(row.Number, "student_not_imported"));
                continue;
            }
            if (!map.Entries.TryGetValue(StudentWorkbookParser.NormalizeExternalId(row.ProgramSourceId), out var target) ||
                !programs.TryGetValue(target.Code, out var program))
            {
                skipped.Add(new(row.Number, "program_not_found"));
                continue;
            }
            if (currentEventIds.Contains(row.EventId))
            {
                conflicts.Add(new(row.Number, "event_in_current_attempts"));
                continue;
            }
            if (existing.TryGetValue(row.EventId, out var prior))
            {
                if (Equivalent(prior, row, member.Id, member.StudentId, program.Id)) unchanged++;
                else conflicts.Add(new(row.Number, "event_conflict"));
                continue;
            }

            var result = new HistoricalTestResult
            {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member.Id,
                StudentId = member.StudentId, ProgramId = program.Id,
                EventId = row.EventId, TestId = row.TestId, TestDate = row.TestDate,
                TopicId = row.TopicId, TopicName = row.TopicName, TaskNumber = row.TaskNumber,
                CorrectCount = row.CorrectCount, TotalCount = row.TotalCount,
                ScorePercent = row.ScorePercent, StartedAt = row.StartedAt,
                FinishedAt = row.FinishedAt, DurationSeconds = row.DurationSeconds,
                ServerSubmittedAt = row.ServerSubmittedAt, SchemaVersion = row.SchemaVersion
            };
            pending.Add(result);
            existing.Add(row.EventId, result);
        }

        if (conflicts.Count == 0 && apply)
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
            db.HistoricalTestResults.AddRange(pending);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        return Report(conflicts.Count == 0, pending.Count, unchanged);

        TestHistoryReport Report(bool canApply, int created, int same) =>
            new(apply ? "apply" : "dry-run", canApply, created, same, skipped, conflicts);
    }

    private static bool Equivalent(HistoricalTestResult result, Row row, Guid membershipId,
        Guid studentId, Guid programId) =>
        result.MembershipId == membershipId && result.StudentId == studentId &&
        result.ProgramId == programId && result.TestId == row.TestId &&
        result.TestDate == row.TestDate && result.TopicId == row.TopicId &&
        result.TopicName == row.TopicName && result.TaskNumber == row.TaskNumber &&
        result.CorrectCount == row.CorrectCount && result.TotalCount == row.TotalCount &&
        result.ScorePercent == row.ScorePercent && result.StartedAt == row.StartedAt &&
        result.FinishedAt == row.FinishedAt && result.DurationSeconds == row.DurationSeconds &&
        result.ServerSubmittedAt == row.ServerSubmittedAt && result.SchemaVersion == row.SchemaVersion;

    private static List<Row> Parse(string path, ICollection<TestHistoryIssue> skipped)
    {
        var file = new FileInfo(path);
        if (!file.Exists || file.Length > 32 * 1024 * 1024)
            throw new InvalidDataException("XLSX is missing or exceeds the size limit.");
        using var book = new XLWorkbook(path);
        if (!book.TryGetWorksheet("Тесты", out var sheet))
            throw new InvalidDataException("Tests sheet is missing.");
        string[] headers = ["eventId", "studentId", "testId", "testDate", "topicId", "topicName",
            "taskNumber", "correctCount", "totalCount", "scorePercent", "startedAt", "finishedAt",
            "durationSeconds", "serverSubmittedAt", "schemaVersion", "programId"];
        if (sheet.Row(1).LastCellUsed()?.Address.ColumnNumber != headers.Length ||
            headers.Where((header, i) => Text(sheet.Cell(1, i + 1)) != header).Any())
            throw new InvalidDataException("Unexpected tests header.");

        var rows = new List<Row>();
        for (var n = 2; n <= (sheet.LastRowUsed()?.RowNumber() ?? 1); n++)
        {
            var r = sheet.Row(n);
            if (r.CellsUsed().All(x => x.IsEmpty())) continue;
            var eventId = Text(r.Cell(1));
            var studentId = Text(r.Cell(2));
            var testId = Text(r.Cell(3));
            var topicId = Text(r.Cell(5));
            var topicName = Text(r.Cell(6));
            var schema = Text(r.Cell(15));
            var program = Text(r.Cell(16));
            if (eventId.Length is 0 or > 128 || studentId.Length is 0 or > 200 ||
                testId.Length is 0 or > 128 || topicId.Length is 0 or > 200 ||
                topicName.Length is 0 or > 200 || schema.Length is 0 or > 64 ||
                program.Length is 0 or > 200 || !TryDate(r.Cell(4), out var testDate) ||
                !TryInt(r.Cell(7), 1, 1000, out var task) ||
                !TryOptionalInt(r.Cell(8), 0, 10000, out var correct) ||
                !TryOptionalInt(r.Cell(9), 1, 10000, out var total) ||
                (correct is not null && total is not null && correct > total) ||
                !TryInt(r.Cell(10), 0, 100, out var percent) ||
                !TryOptionalInstant(r.Cell(11), out var started) ||
                !TryOptionalInstant(r.Cell(12), out var finished) ||
                (started is not null && finished is not null && finished < started) ||
                !TryInt(r.Cell(13), 0, 86400, out var duration) ||
                !TryInstant(r.Cell(14), out var submitted))
            {
                skipped.Add(new(n, "invalid_source_fields"));
                continue;
            }
            rows.Add(new(n, eventId, studentId, program, testId, testDate, topicId,
                topicName, task, correct, total, percent, started, finished, duration,
                submitted, schema));
        }
        return rows;
    }

    private static string Text(IXLCell cell) => cell.GetFormattedString().Normalize(NormalizationForm.FormKC).Trim();
    private static bool TryInt(IXLCell cell, int min, int max, out int value) =>
        int.TryParse(Text(cell), NumberStyles.Integer, CultureInfo.InvariantCulture, out value) &&
        value >= min && value <= max;
    private static bool TryOptionalInt(IXLCell cell, int min, int max, out int? value)
    {
        if (Text(cell).Length == 0) { value = null; return true; }
        if (TryInt(cell, min, max, out var parsed)) { value = parsed; return true; }
        value = null;
        return false;
    }
    private static bool TryDate(IXLCell cell, out DateOnly value)
    {
        value = default;
        try
        {
            if (cell.DataType == XLDataType.DateTime)
                value = DateOnly.FromDateTime(cell.GetDateTime());
            else if (cell.DataType == XLDataType.Number && cell.TryGetValue<double>(out var serial))
                value = DateOnly.FromDateTime(DateTime.FromOADate(serial));
            else if (!DateOnly.TryParseExact(Text(cell), ["yyyy-MM-dd", "dd.MM.yyyy"],
                         CultureInfo.InvariantCulture, DateTimeStyles.None, out value)) return false;
            return value.Year is >= 2015 and <= 2100;
        }
        catch (Exception e) when (e is ArgumentException or FormatException or OverflowException)
        {
            return false;
        }
    }
    private static bool TryOptionalInstant(IXLCell cell, out DateTimeOffset? value)
    {
        if (Text(cell).Length == 0) { value = null; return true; }
        if (TryInstant(cell, out var parsed)) { value = parsed; return true; }
        value = null;
        return false;
    }
    private static bool TryInstant(IXLCell cell, out DateTimeOffset value)
    {
        value = default;
        try
        {
            DateTime? local = cell.DataType switch
            {
                XLDataType.DateTime => cell.GetDateTime(),
                XLDataType.Number when cell.TryGetValue<double>(out var serial) => DateTime.FromOADate(serial),
                _ => null
            };
            if (local is not null)
            {
                var moscow = TimeZoneInfo.FindSystemTimeZoneById("Europe/Moscow");
                value = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(
                    DateTime.SpecifyKind(local.Value, DateTimeKind.Unspecified), moscow));
            }
            else
            {
                var text = Text(cell);
                if (!Regex.IsMatch(text, @"^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$") ||
                    !DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture,
                        DateTimeStyles.RoundtripKind, out value)) return false;
                value = value.ToUniversalTime();
            }
            return value.Year is >= 2015 and <= 2100;
        }
        catch (Exception e) when (e is ArgumentException or FormatException or OverflowException)
        {
            return false;
        }
    }
}
