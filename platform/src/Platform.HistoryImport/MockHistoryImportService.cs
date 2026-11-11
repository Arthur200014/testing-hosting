using System.Data;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Mocks;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.StudentImport;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.HistoryImport;

public sealed record MockHistoryIssue(string Sheet, int RowNumber, string Reason);
public sealed record MockHistoryReport(string Mode, bool CanApply,
    int ResultsCreated, int ResultsUnchanged, int TasksCreated, int TasksUnchanged,
    int SessionsCreated, int SessionsUnchanged, int VariantsCreated, int VariantsUnchanged,
    IReadOnlyList<MockHistoryIssue> Skipped, IReadOnlyList<MockHistoryIssue> Conflicts);

public sealed class MockHistoryImportService(Func<PlatformDbContext> dbFactory)
{
    private const int MaxWorkbookBytes = 32 * 1024 * 1024;
    private const int MaxJsonChars = 1_000_000;

    public async Task<MockHistoryReport> ImportAsync(string xlsx, string mapPath, string workspaceSlug,
        bool apply, CancellationToken cancellationToken = default)
    {
        var skipped = new List<MockHistoryIssue>();
        var conflicts = new List<MockHistoryIssue>();
        var file = new FileInfo(xlsx);
        if (!file.Exists || file.Length > MaxWorkbookBytes)
            throw new InvalidDataException("XLSX is missing or exceeds the size limit.");
        using var book = new XLWorkbook(xlsx);
        var results = Sheet(book, "Пробники", ["eventId", "studentId", "mockId", "mockDate", "variantName",
            "score", "primaryScore", "durationSeconds", "serverSubmittedAt", "schemaVersion", "programId",
            "gradeMark", "maxPrimaryScore", "scorePercent"]);
        var tasks = Sheet(book, "Пробник_Задания", ["eventId", "studentId", "mockId", "mockDate",
            "taskNumber", "topicId", "topicName", "isCorrect", "answered", "serverSubmittedAt",
            "schemaVersion", "programId", "earnedPoints", "maxPoints"]);
        var sessions = Sheet(book, "Пробник_Сессии", ["sessionId", "studentId", "mockId", "startedAt",
            "deadlineAt", "answersJson", "status", "submittedAt", "primaryScore", "testScore",
            "durationSeconds", "eventId", "schemaVersion", "mockConfigJson", "programId",
            "gradeMark", "maxPrimaryScore", "scorePercent"]);
        var variants = Sheet(book, "Пробник_Конфигурации", ["mockId", "variantName", "durationSeconds",
            "taskCount", "configJson", "createdAt", "schemaVersion", "programId"]);

        var map = new ProgramMapParser().Parse(mapPath);
        foreach (var issue in map.Diagnostics)
            conflicts.Add(new("program-map", issue.RowNumber, issue.Category));
        await using var db = dbFactory();
        var workspace = await db.Workspaces.AsNoTracking().SingleOrDefaultAsync(x =>
            x.Slug == workspaceSlug.Trim().ToLowerInvariant() && x.IsActive, cancellationToken);
        if (workspace is null) conflicts.Add(new("database", 0, "workspace_not_found"));
        if (conflicts.Count > 0) return Report(false, 0, 0, 0, 0, 0, 0, 0, 0);
        var workspaceId = workspace!.Id;
        var members = (await db.WorkspaceStudentMemberships.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && x.ImportSource == StudentImportService.ImportSource)
            .ToListAsync(cancellationToken)).Where(x => x.ImportExternalId is not null)
            .ToDictionary(x => x.ImportExternalId!, StringComparer.Ordinal);
        var programs = (await db.Programs.AsNoTracking().Where(x => x.WorkspaceId == workspaceId)
            .ToListAsync(cancellationToken)).ToDictionary(x => x.Code, StringComparer.Ordinal);

        var oldResults = (await db.HistoricalMockResults.AsNoTracking().Where(x => x.WorkspaceId == workspaceId)
            .ToListAsync(cancellationToken)).ToDictionary(x => x.EventId, StringComparer.Ordinal);
        var oldTasks = (await db.HistoricalMockTaskResults.AsNoTracking().Where(x => x.WorkspaceId == workspaceId)
            .ToListAsync(cancellationToken)).ToDictionary(x => (x.EventId, x.TaskNumber));
        var oldSessions = (await db.HistoricalMockSessions.AsNoTracking().Where(x => x.WorkspaceId == workspaceId)
            .ToListAsync(cancellationToken)).ToDictionary(x => x.SessionId, StringComparer.Ordinal);
        var oldVariants = (await db.HistoricalMockVariants.AsNoTracking().Where(x => x.WorkspaceId == workspaceId)
            .ToListAsync(cancellationToken)).ToDictionary(x => (x.ProgramId, x.MockId, x.VariantName));
        var newResults = new List<HistoricalMockResult>();
        var newTasks = new List<HistoricalMockTaskResult>();
        var newSessions = new List<HistoricalMockSession>();
        var newVariants = new List<HistoricalMockVariant>();
        var sameResults = 0; var sameTasks = 0; var sameSessions = 0; var sameVariants = 0;

        foreach (var (n, r) in Rows(results))
        {
            if (!Identity("Пробники", n, Text(r.Cell(2)), Text(r.Cell(11)), out var member, out var program)) continue;
            if (!Required(r, (1, 128), (3, 128), (5, 200), (10, 64)) ||
                !TryDate(r.Cell(4), out var date) || !TryOptionalInt(r.Cell(6), 0, 100, out var score) ||
                !TryInt(r.Cell(7), 0, 1000, out var primary) ||
                !TryInt(r.Cell(8), 0, 86400, out var duration) ||
                !TryInstant(r.Cell(9), out var submitted) ||
                !TryOptionalInt(r.Cell(12), 0, 10, out var grade) ||
                !TryInt(r.Cell(13), 1, 1000, out var maxPrimary) ||
                !TryInt(r.Cell(14), 0, 100, out var percent))
            { skipped.Add(new("Пробники", n, "invalid_source_fields")); continue; }
            var item = new HistoricalMockResult
            {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member!.Id,
                StudentId = member.StudentId, ProgramId = program!.Id,
                EventId = Text(r.Cell(1)), MockId = Text(r.Cell(3)), MockDate = date,
                VariantName = Text(r.Cell(5)), Score = score, PrimaryScore = primary,
                DurationSeconds = duration, ServerSubmittedAt = submitted,
                SchemaVersion = Text(r.Cell(10)), GradeMark = grade,
                MaxPrimaryScore = maxPrimary, ScorePercent = percent
            };
            if (oldResults.TryGetValue(item.EventId, out var prior))
            { if (SameResult(prior, item)) sameResults++; else conflicts.Add(new("Пробники", n, "event_conflict")); }
            else { oldResults.Add(item.EventId, item); newResults.Add(item); }
        }

        foreach (var (n, r) in Rows(tasks))
        {
            if (!Identity("Пробник_Задания", n, Text(r.Cell(2)), Text(r.Cell(12)), out var member, out var program)) continue;
            if (!Required(r, (1, 128), (3, 128), (6, 200), (7, 200), (11, 64)) ||
                !TryDate(r.Cell(4), out var date) || !TryInt(r.Cell(5), 1, 1000, out var task) ||
                !TryBool(r.Cell(8), out var correct) || !TryBool(r.Cell(9), out var answered) ||
                !TryInstant(r.Cell(10), out var submitted) ||
                !TryOptionalInt(r.Cell(13), 0, 1000, out var earned) ||
                !TryOptionalInt(r.Cell(14), 1, 1000, out var maxPoints) ||
                (earned is not null && maxPoints is not null && earned > maxPoints))
            { skipped.Add(new("Пробник_Задания", n, "invalid_source_fields")); continue; }
            var item = new HistoricalMockTaskResult
            {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member!.Id,
                StudentId = member.StudentId, ProgramId = program!.Id,
                EventId = Text(r.Cell(1)), MockId = Text(r.Cell(3)), MockDate = date,
                TaskNumber = task, TopicId = Text(r.Cell(6)), TopicName = Text(r.Cell(7)),
                IsCorrect = correct, Answered = answered, ServerSubmittedAt = submitted,
                SchemaVersion = Text(r.Cell(11)), EarnedPoints = earned, MaxPoints = maxPoints
            };
            var key = (item.EventId, item.TaskNumber);
            if (oldTasks.TryGetValue(key, out var prior))
            { if (SameTask(prior, item)) sameTasks++; else conflicts.Add(new("Пробник_Задания", n, "event_task_conflict")); }
            else { oldTasks.Add(key, item); newTasks.Add(item); }
        }

        foreach (var (n, r) in Rows(sessions))
        {
            if (!Identity("Пробник_Сессии", n, Text(r.Cell(2)), Text(r.Cell(15)), out var member, out var program)) continue;
            var answers = Raw(r.Cell(6)); var config = Raw(r.Cell(14));
            if (!Required(r, (1, 128), (3, 128), (7, 64), (13, 64)) ||
                answers.Length is 0 or > MaxJsonChars || config.Length is 0 or > MaxJsonChars ||
                Text(r.Cell(12)).Length > 128 ||
                !TryInstant(r.Cell(4), out var started) || !TryInstant(r.Cell(5), out var deadline) ||
                deadline < started || !TryOptionalInstant(r.Cell(8), out var submitted) ||
                !TryOptionalInt(r.Cell(9), 0, 1000, out var primary) ||
                !TryOptionalInt(r.Cell(10), 0, 100, out var testScore) ||
                !TryOptionalInt(r.Cell(11), 0, 86400, out var duration) ||
                !TryOptionalInt(r.Cell(16), 0, 10, out var grade) ||
                !TryOptionalInt(r.Cell(17), 1, 1000, out var maxPrimary) ||
                !TryOptionalInt(r.Cell(18), 0, 100, out var percent))
            { skipped.Add(new("Пробник_Сессии", n, "invalid_source_fields")); continue; }
            var item = new HistoricalMockSession
            {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member!.Id,
                StudentId = member.StudentId, ProgramId = program!.Id,
                SessionId = Text(r.Cell(1)), MockId = Text(r.Cell(3)),
                StartedAt = started, DeadlineAt = deadline, AnswersJson = answers,
                Status = Text(r.Cell(7)), SubmittedAt = submitted,
                PrimaryScore = primary, TestScore = testScore, DurationSeconds = duration,
                EventId = Optional(r.Cell(12)), SchemaVersion = Text(r.Cell(13)),
                MockConfigJson = config, GradeMark = grade,
                MaxPrimaryScore = maxPrimary, ScorePercent = percent
            };
            if (oldSessions.TryGetValue(item.SessionId, out var prior))
            { if (SameSession(prior, item)) sameSessions++; else conflicts.Add(new("Пробник_Сессии", n, "session_conflict")); }
            else { oldSessions.Add(item.SessionId, item); newSessions.Add(item); }
        }

        foreach (var (n, r) in Rows(variants))
        {
            if (!Program("Пробник_Конфигурации", n, Text(r.Cell(8)), out var program)) continue;
            var config = Raw(r.Cell(5));
            if (!Required(r, (1, 128), (2, 200), (7, 64)) ||
                config.Length is 0 or > MaxJsonChars ||
                !TryInt(r.Cell(3), 1, 86400, out var duration) ||
                !TryInt(r.Cell(4), 1, 1000, out var count) ||
                !TryInstant(r.Cell(6), out var created))
            { skipped.Add(new("Пробник_Конфигурации", n, "invalid_source_fields")); continue; }
            var item = new HistoricalMockVariant
            {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId, ProgramId = program!.Id,
                MockId = Text(r.Cell(1)), VariantName = Text(r.Cell(2)),
                DurationSeconds = duration, TaskCount = count, ConfigJson = config,
                CreatedAt = created, SchemaVersion = Text(r.Cell(7))
            };
            var key = (item.ProgramId, item.MockId, item.VariantName);
            if (oldVariants.TryGetValue(key, out var prior))
            { if (SameVariant(prior, item)) sameVariants++; else conflicts.Add(new("Пробник_Конфигурации", n, "variant_conflict")); }
            else { oldVariants.Add(key, item); newVariants.Add(item); }
        }

        if (conflicts.Count == 0 && apply)
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
            db.HistoricalMockResults.AddRange(newResults);
            db.HistoricalMockTaskResults.AddRange(newTasks);
            db.HistoricalMockSessions.AddRange(newSessions);
            db.HistoricalMockVariants.AddRange(newVariants);
            await db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
        }
        return Report(conflicts.Count == 0, newResults.Count, sameResults, newTasks.Count, sameTasks,
            newSessions.Count, sameSessions, newVariants.Count, sameVariants);

        bool Program(string sheet, int row, string sourceId, out LearningProgram? program)
        {
            program = null;
            if (!map.Entries.TryGetValue(StudentWorkbookParser.NormalizeExternalId(sourceId), out var mapped) ||
                !programs.TryGetValue(mapped.Code, out program))
            { skipped.Add(new(sheet, row, "program_not_found")); return false; }
            return true;
        }
        bool Identity(string sheet, int row, string studentId, string programId,
            out WorkspaceStudentMembership? member, out LearningProgram? program)
        {
            member = null; program = null;
            if (!members.TryGetValue(StudentWorkbookParser.NormalizeExternalId(studentId), out member))
            { skipped.Add(new(sheet, row, "student_not_imported")); return false; }
            return Program(sheet, row, programId, out program);
        }
        MockHistoryReport Report(bool allowed, int rc, int ru, int tc, int tu, int sc, int su, int vc, int vu) =>
            new(apply ? "apply" : "dry-run", allowed, rc, ru, tc, tu, sc, su, vc, vu, skipped, conflicts);
    }

    private static IXLWorksheet Sheet(XLWorkbook book, string name, IReadOnlyList<string> headers)
    {
        if (!book.TryGetWorksheet(name, out var sheet) ||
            sheet.Row(1).LastCellUsed()?.Address.ColumnNumber != headers.Count ||
            headers.Where((header, i) => Text(sheet.Cell(1, i + 1)) != header).Any())
            throw new InvalidDataException("Unexpected or missing mock sheet header.");
        return sheet;
    }
    private static IEnumerable<(int Row, IXLRow Cells)> Rows(IXLWorksheet sheet)
    {
        for (var n = 2; n <= (sheet.LastRowUsed()?.RowNumber() ?? 1); n++)
        {
            var r = sheet.Row(n);
            if (r.CellsUsed().Any(x => !x.IsEmpty())) yield return (n, r);
        }
    }
    private static bool Required(IXLRow row, params (int Column, int Max)[] fields) =>
        fields.All(x => Text(row.Cell(x.Column)).Length is > 0 && Text(row.Cell(x.Column)).Length <= x.Max);
    private static string Text(IXLCell cell) => cell.GetFormattedString().Normalize(NormalizationForm.FormKC).Trim();
    private static string Raw(IXLCell cell) => cell.GetString();
    private static string? Optional(IXLCell cell) => Text(cell) is { Length: > 0 } value ? value : null;
    private static bool TryInt(IXLCell cell, int min, int max, out int value) =>
        int.TryParse(Text(cell), NumberStyles.Integer, CultureInfo.InvariantCulture, out value) && value >= min && value <= max;
    private static bool TryOptionalInt(IXLCell cell, int min, int max, out int? value)
    {
        if (Text(cell).Length == 0) { value = null; return true; }
        if (TryInt(cell, min, max, out var parsed)) { value = parsed; return true; }
        value = null; return false;
    }
    private static bool TryBool(IXLCell cell, out bool value) => bool.TryParse(Text(cell), out value);
    private static bool TryDate(IXLCell cell, out DateOnly value)
    {
        value = default;
        try
        {
            if (cell.DataType == XLDataType.DateTime) value = DateOnly.FromDateTime(cell.GetDateTime());
            else if (cell.DataType == XLDataType.Number && cell.TryGetValue<double>(out var serial))
                value = DateOnly.FromDateTime(DateTime.FromOADate(serial));
            else
            {
                var source = Text(cell);
                if (Regex.IsMatch(source,
                        @"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4} \(.+\)$"))
                {
                    if (!DateTime.TryParseExact(source[..15], "ddd MMM dd yyyy",
                            CultureInfo.InvariantCulture, DateTimeStyles.None, out var javascriptDate)) return false;
                    value = DateOnly.FromDateTime(javascriptDate);
                }
                else if (!DateOnly.TryParseExact(source, ["yyyy-MM-dd", "dd.MM.yyyy"],
                             CultureInfo.InvariantCulture, DateTimeStyles.None, out value)) return false;
            }
            return value.Year is >= 2015 and <= 2100;
        }
        catch (Exception e) when (e is ArgumentException or FormatException or OverflowException) { return false; }
    }
    private static bool TryOptionalInstant(IXLCell cell, out DateTimeOffset? value)
    {
        if (Text(cell).Length == 0) { value = null; return true; }
        if (TryInstant(cell, out var parsed)) { value = parsed; return true; }
        value = null; return false;
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
        catch (Exception e) when (e is ArgumentException or FormatException or OverflowException) { return false; }
    }

    private static bool SameResult(HistoricalMockResult a, HistoricalMockResult b) =>
        a.MembershipId == b.MembershipId && a.StudentId == b.StudentId && a.ProgramId == b.ProgramId &&
        a.MockId == b.MockId && a.MockDate == b.MockDate && a.VariantName == b.VariantName &&
        a.Score == b.Score && a.PrimaryScore == b.PrimaryScore && a.DurationSeconds == b.DurationSeconds &&
        a.ServerSubmittedAt == b.ServerSubmittedAt && a.SchemaVersion == b.SchemaVersion &&
        a.GradeMark == b.GradeMark && a.MaxPrimaryScore == b.MaxPrimaryScore && a.ScorePercent == b.ScorePercent;
    private static bool SameTask(HistoricalMockTaskResult a, HistoricalMockTaskResult b) =>
        a.MembershipId == b.MembershipId && a.StudentId == b.StudentId && a.ProgramId == b.ProgramId &&
        a.MockId == b.MockId && a.MockDate == b.MockDate && a.TopicId == b.TopicId &&
        a.TopicName == b.TopicName && a.IsCorrect == b.IsCorrect && a.Answered == b.Answered &&
        a.ServerSubmittedAt == b.ServerSubmittedAt && a.SchemaVersion == b.SchemaVersion &&
        a.EarnedPoints == b.EarnedPoints && a.MaxPoints == b.MaxPoints;
    private static bool SameSession(HistoricalMockSession a, HistoricalMockSession b) =>
        a.MembershipId == b.MembershipId && a.StudentId == b.StudentId && a.ProgramId == b.ProgramId &&
        a.MockId == b.MockId && a.StartedAt == b.StartedAt && a.DeadlineAt == b.DeadlineAt &&
        a.AnswersJson == b.AnswersJson && a.Status == b.Status && a.SubmittedAt == b.SubmittedAt &&
        a.PrimaryScore == b.PrimaryScore && a.TestScore == b.TestScore &&
        a.DurationSeconds == b.DurationSeconds && a.EventId == b.EventId &&
        a.SchemaVersion == b.SchemaVersion && a.MockConfigJson == b.MockConfigJson &&
        a.GradeMark == b.GradeMark && a.MaxPrimaryScore == b.MaxPrimaryScore && a.ScorePercent == b.ScorePercent;
    private static bool SameVariant(HistoricalMockVariant a, HistoricalMockVariant b) =>
        a.DurationSeconds == b.DurationSeconds && a.TaskCount == b.TaskCount &&
        a.ConfigJson == b.ConfigJson && a.CreatedAt == b.CreatedAt && a.SchemaVersion == b.SchemaVersion;
}
