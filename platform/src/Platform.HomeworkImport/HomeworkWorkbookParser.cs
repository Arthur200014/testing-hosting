using System.Globalization;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using ClosedXML.Excel;

namespace TestingHosting.Platform.HomeworkImport;

public sealed class HomeworkWorkbookParser
{
    private const int MaximumWorkbookBytes = 32 * 1024 * 1024;
    private static readonly string[] CatalogSheets = ["ДЗ_Каталог"];
    private static readonly string[] AssignmentSheets = ["ДЗ_Назначения"];
    private static readonly string[] MoscowDateFormats =
    [
        "d.M.yyyy",
        "dd.MM.yyyy",
        "d.M.yyyy H:mm",
        "dd.MM.yyyy HH:mm",
        "d.M.yyyy H:mm:ss",
        "dd.MM.yyyy HH:mm:ss",
        "yyyy-MM-dd",
        "yyyy-MM-dd H:mm:ss",
        "yyyy-MM-dd HH:mm:ss"
    ];
    private static readonly TimeZoneInfo MoscowTimeZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Moscow");

    public ParsedHomeworkWorkbook Parse(string path)
    {
        var snapshot = ReadSnapshot(path);
        var digest = Convert.ToHexString(SHA256.HashData(snapshot));
        var diagnostics = new List<HomeworkImportDiagnostic>();
        var catalog = new List<HomeworkCatalogImportRow>();
        var assignments = new List<HomeworkAssignmentImportRow>();

        using var stream = new MemoryStream(snapshot, writable: false);
        using var workbook = new XLWorkbook(stream);
        var catalogSheet = FindSheet(workbook, CatalogSheets);
        var assignmentSheet = FindSheet(workbook, AssignmentSheets);
        if (catalogSheet is null) diagnostics.Add(new(0, "ДЗ_Каталог", "sheet", "missing_sheet"));
        if (assignmentSheet is null) diagnostics.Add(new(0, "ДЗ_Назначения", "sheet", "missing_sheet"));
        if (catalogSheet is not null) ParseCatalog(catalogSheet, catalog, diagnostics);
        if (assignmentSheet is not null) ParseAssignments(assignmentSheet, assignments, diagnostics);
        return new(digest, catalog, assignments, diagnostics);
    }

    private static void ParseCatalog(
        IXLWorksheet sheet,
        ICollection<HomeworkCatalogImportRow> rows,
        ICollection<HomeworkImportDiagnostic> diagnostics)
    {
        var headers = Headers(sheet);
        var required = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["homeworkId"] = ["homeworkId", "homework"],
            ["taskNumber"] = ["taskNumber", "task"],
            ["name"] = ["name", "homeworkName"],
            ["url"] = ["url", "URL", "homeworkUrl"],
            ["active"] = ["active", "isActive"],
            ["order"] = ["order", "sortOrder"],
            ["createdAt"] = ["createdAt", "created"],
            ["programId"] = ["programId", "program"]
        };
        var columns = Resolve(headers, required, "ДЗ_Каталог", diagnostics);
        if (columns is null) return;

        foreach (var row in DataRows(sheet))
        {
            var rowNumber = row.RowNumber();
            var homeworkId = Text(row.Cell(columns["homeworkId"]));
            var name = Text(row.Cell(columns["name"]));
            var url = Text(row.Cell(columns["url"]));
            var programId = Text(row.Cell(columns["programId"]));
            var ok = true;
            ok &= Required(homeworkId, 128, rowNumber, "ДЗ_Каталог", "homeworkId", diagnostics);
            ok &= Required(name, 200, rowNumber, "ДЗ_Каталог", "name", diagnostics);
            ok &= Required(url, 2048, rowNumber, "ДЗ_Каталог", "url", diagnostics);
            ok &= Required(programId, 200, rowNumber, "ДЗ_Каталог", "programId", diagnostics);
            ok &= TryInt(row.Cell(columns["taskNumber"]), 1, 1000, out var task, rowNumber, "ДЗ_Каталог", "taskNumber", diagnostics);
            ok &= TryInt(row.Cell(columns["order"]), 0, int.MaxValue, out var order, rowNumber, "ДЗ_Каталог", "order", diagnostics);
            ok &= TryBool(row.Cell(columns["active"]), out var active, rowNumber, "ДЗ_Каталог", "active", diagnostics);
            ok &= TryDate(row.Cell(columns["createdAt"]), out var createdAt, rowNumber, "ДЗ_Каталог", "createdAt", diagnostics);
            if (ok) rows.Add(new(rowNumber, homeworkId, task, name, url, active, order, createdAt, programId));
        }

        foreach (var duplicate in rows.GroupBy(x => (x.ProgramExternalId, x.HomeworkId)).Where(x => x.Count() > 1))
            foreach (var row in duplicate) diagnostics.Add(new(row.RowNumber, "ДЗ_Каталог", "homeworkId", "duplicate_key"));
    }

    private static void ParseAssignments(
        IXLWorksheet sheet,
        ICollection<HomeworkAssignmentImportRow> rows,
        ICollection<HomeworkImportDiagnostic> diagnostics)
    {
        var headers = Headers(sheet);
        var required = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["assignmentRecordId"] = ["assignmentRecordId", "assignmentId", "assignment"],
            ["studentId"] = ["studentId", "student"],
            ["homeworkId"] = ["homeworkId", "homework"],
            ["taskNumber"] = ["taskNumber", "task"],
            ["name"] = ["homeworkName", "name"],
            ["url"] = ["homeworkUrl", "url", "URL"],
            ["assignedAt"] = ["assignedAt", "assigned"],
            ["deadlineAt"] = ["deadlineAt", "deadline"],
            ["submittedAt"] = ["submittedAt", "submitted"],
            ["status"] = ["status"],
            ["scorePercent"] = ["scorePercent", "score"],
            ["homeworkEventId"] = ["homeworkEventId", "eventId", "event"],
            ["lessonId"] = ["lessonId", "lesson"],
            ["schemaVersion"] = ["schemaVersion", "schema"],
            ["programId"] = ["programId", "program"]
        };
        var columns = Resolve(headers, required, "ДЗ_Назначения", diagnostics);
        if (columns is null) return;

        foreach (var row in DataRows(sheet))
        {
            var n = row.RowNumber();
            var assignmentId = Text(row.Cell(columns["assignmentRecordId"]));
            var studentId = Text(row.Cell(columns["studentId"]));
            var homeworkId = Text(row.Cell(columns["homeworkId"]));
            var name = Text(row.Cell(columns["name"]));
            var url = Text(row.Cell(columns["url"]));
            var status = Text(row.Cell(columns["status"]));
            var schema = Text(row.Cell(columns["schemaVersion"]));
            var programId = Text(row.Cell(columns["programId"]));
            var eventId = OptionalText(row.Cell(columns["homeworkEventId"]));
            var lessonId = OptionalText(row.Cell(columns["lessonId"]));
            var ok = true;
            ok &= Required(assignmentId, 128, n, "ДЗ_Назначения", "assignmentRecordId", diagnostics);
            ok &= Required(studentId, 200, n, "ДЗ_Назначения", "studentId", diagnostics);
            ok &= Required(homeworkId, 128, n, "ДЗ_Назначения", "homeworkId", diagnostics);
            ok &= Required(name, 200, n, "ДЗ_Назначения", "name", diagnostics);
            ok &= Required(url, 2048, n, "ДЗ_Назначения", "url", diagnostics);
            ok &= Required(status, 32, n, "ДЗ_Назначения", "status", diagnostics);
            ok &= Required(schema, 64, n, "ДЗ_Назначения", "schemaVersion", diagnostics);
            ok &= Required(programId, 200, n, "ДЗ_Назначения", "programId", diagnostics);
            ok &= eventId is null || Required(eventId, 128, n, "ДЗ_Назначения", "homeworkEventId", diagnostics);
            ok &= lessonId is null || Required(lessonId, 128, n, "ДЗ_Назначения", "lessonId", diagnostics);
            ok &= TryInt(row.Cell(columns["taskNumber"]), 1, 1000, out var task, n, "ДЗ_Назначения", "taskNumber", diagnostics);
            var assignedOk = TryDate(row.Cell(columns["assignedAt"]), out var assignedAt, n, "ДЗ_Назначения", "assignedAt", diagnostics);
            var deadlineOk = TryDate(row.Cell(columns["deadlineAt"]), out var deadlineAt, n, "ДЗ_Назначения", "deadlineAt", diagnostics);
            ok &= assignedOk && deadlineOk;
            var submittedOk = TryOptionalDate(row.Cell(columns["submittedAt"]), out var submittedAt, n, "ДЗ_Назначения", "submittedAt", diagnostics);
            var scoreOk = TryOptionalInt(row.Cell(columns["scorePercent"]), 0, 100, out var score, n, "ДЗ_Назначения", "scorePercent", diagnostics);
            ok &= submittedOk && scoreOk;
            if (assignedOk && deadlineOk)
            {
                if (deadlineAt <= assignedAt) { diagnostics.Add(new(n, "ДЗ_Назначения", "deadlineAt", "invalid_deadline")); ok = false; }
                var hours = (deadlineAt - assignedAt).TotalHours;
                if (Math.Abs(hours - 24) > .01 && Math.Abs(hours - 48) > .01 && Math.Abs(hours - 72) > .01)
                { diagnostics.Add(new(n, "ДЗ_Назначения", "deadlineAt", "unsupported_deadline_window")); ok = false; }
            }
            if ((submittedAt is null) != (score is null))
            { diagnostics.Add(new(n, "ДЗ_Назначения", "submission", "incomplete_submission")); ok = false; }
            if (ok) rows.Add(new(n, assignmentId, studentId, homeworkId, task, name, url, assignedAt, deadlineAt,
                submittedAt, status, score, eventId, lessonId, schema, programId));
        }

        foreach (var duplicate in rows.GroupBy(x => x.AssignmentRecordId, StringComparer.Ordinal).Where(x => x.Count() > 1))
            foreach (var row in duplicate) diagnostics.Add(new(row.RowNumber, "ДЗ_Назначения", "assignmentRecordId", "duplicate_key"));
    }

    private static Dictionary<string, int> Headers(IXLWorksheet sheet) => sheet.Row(1).CellsUsed()
        .Select(cell => (Name: Text(cell), Column: cell.Address.ColumnNumber))
        .Where(x => x.Name.Length > 0)
        .GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
        .ToDictionary(x => x.Key, x => x.First().Column, StringComparer.OrdinalIgnoreCase);

    private static Dictionary<string, int>? Resolve(
        IReadOnlyDictionary<string, int> headers,
        IReadOnlyDictionary<string, string[]> required,
        string sheet,
        ICollection<HomeworkImportDiagnostic> diagnostics)
    {
        var result = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var (canonical, aliases) in required)
        {
            var matches = aliases.Where(headers.ContainsKey).Select(alias => headers[alias]).Distinct().ToArray();
            if (matches.Length != 1)
            {
                diagnostics.Add(new(1, sheet, canonical, matches.Length == 0 ? "missing_header" : "ambiguous_header"));
            }
            else result[canonical] = matches[0];
        }
        return result.Count == required.Count ? result : null;
    }

    private static IEnumerable<IXLRow> DataRows(IXLWorksheet sheet) =>
        sheet.RowsUsed().Where(row => row.RowNumber() > 1 && row.CellsUsed().Any(cell => !cell.IsEmpty()));

    private static string Text(IXLCell cell) => cell.GetFormattedString().Normalize().Trim();
    private static string? OptionalText(IXLCell cell) { var value = Text(cell); return value.Length == 0 ? null : value; }

    private static bool Required(string value, int max, int row, string sheet, string field, ICollection<HomeworkImportDiagnostic> diagnostics)
    {
        if (value.Length == 0 || value.Length > max) { diagnostics.Add(new(row, sheet, field, value.Length == 0 ? "required" : "too_long")); return false; }
        return true;
    }

    private static bool TryBool(IXLCell cell, out bool value, int row, string sheet, string field, ICollection<HomeworkImportDiagnostic> diagnostics)
    {
        var text = Text(cell).ToLowerInvariant();
        if (text is "true" or "1" or "да" or "yes") { value = true; return true; }
        if (text is "false" or "0" or "нет" or "no") { value = false; return true; }
        value = false; diagnostics.Add(new(row, sheet, field, "invalid_boolean")); return false;
    }

    private static bool TryInt(IXLCell cell, int min, int max, out int value, int row, string sheet, string field, ICollection<HomeworkImportDiagnostic> diagnostics)
    {
        if (int.TryParse(Text(cell), NumberStyles.Integer, CultureInfo.InvariantCulture, out value) && value >= min && value <= max) return true;
        diagnostics.Add(new(row, sheet, field, "invalid_integer")); return false;
    }

    private static bool TryOptionalInt(IXLCell cell, int min, int max, out int? value, int row, string sheet, string field, ICollection<HomeworkImportDiagnostic> diagnostics)
    {
        var text = Text(cell); if (text.Length == 0) { value = null; return true; }
        if (int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) && parsed >= min && parsed <= max) { value = parsed; return true; }
        value = null; diagnostics.Add(new(row, sheet, field, "invalid_integer")); return false;
    }

    private static bool TryDate(IXLCell cell, out DateTimeOffset value, int row, string sheet, string field, ICollection<HomeworkImportDiagnostic> diagnostics)
    {
        if (cell.DataType == XLDataType.DateTime && cell.TryGetValue<DateTime>(out var date))
        {
            value = MoscowToUtc(date);
            return true;
        }

        var text = Text(cell);
        if (HasExplicitOffset(text) && DateTimeOffset.TryParse(
                text,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.RoundtripKind,
                out value))
        {
            value = value.ToUniversalTime();
            return true;
        }
        if (DateTime.TryParseExact(
                text,
                MoscowDateFormats,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AllowWhiteSpaces,
                out date) ||
            DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out date))
        {
            value = MoscowToUtc(date);
            return true;
        }
        diagnostics.Add(new(row, sheet, field, "invalid_datetime")); value = default; return false;
    }

    private static bool HasExplicitOffset(string value) =>
        Regex.IsMatch(value, "(?:Z|[+-][0-9]{2}(?::?[0-9]{2})?)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static DateTimeOffset MoscowToUtc(DateTime value)
    {
        var unspecified = DateTime.SpecifyKind(value, DateTimeKind.Unspecified);
        return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(unspecified, MoscowTimeZone), TimeSpan.Zero);
    }

    private static bool TryOptionalDate(IXLCell cell, out DateTimeOffset? value, int row, string sheet, string field, ICollection<HomeworkImportDiagnostic> diagnostics)
    {
        if (cell.IsEmpty() || Text(cell).Length == 0) { value = null; return true; }
        if (TryDate(cell, out var parsed, row, sheet, field, diagnostics)) { value = parsed; return true; }
        value = null; return false;
    }

    private static IXLWorksheet? FindSheet(XLWorkbook workbook, IEnumerable<string> names) =>
        names.Select(name => workbook.Worksheets.FirstOrDefault(sheet => string.Equals(sheet.Name, name, StringComparison.Ordinal))).FirstOrDefault(sheet => sheet is not null);

    private static byte[] ReadSnapshot(string path)
    {
        using var source = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (source.Length > MaximumWorkbookBytes) throw new InvalidDataException("Workbook exceeds the maximum supported size.");
        using var copy = new MemoryStream((int)source.Length);
        source.CopyTo(copy);
        if (copy.Length > MaximumWorkbookBytes) throw new InvalidDataException("Workbook exceeds the maximum supported size.");
        return copy.ToArray();
    }
}
