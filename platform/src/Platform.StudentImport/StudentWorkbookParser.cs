using System.Security.Cryptography;
using System.Text;
using ClosedXML.Excel;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.StudentImport;

public sealed class StudentWorkbookParser(IStudentCodeHasher codeHasher)
{
    public const string SheetName = "Ученики";

    public static readonly string[] RequiredHeaders =
    [
        "studentId", "studentName", "grade", "groupId", "targetScore", "active",
        "createdAt", "inviteCode", "notes", "parentName", "programId", "targetGrade"
    ];

    public ParsedStudentWorkbook Parse(string path)
    {
        string digest;
        using (var digestStream = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            digest = Convert.ToHexString(SHA256.HashData(digestStream));
        }

        var diagnostics = new List<ImportDiagnostic>();
        var rows = new List<StudentImportRow>();

        try
        {
            using var workbook = new XLWorkbook(path);
            if (!workbook.TryGetWorksheet(SheetName, out var worksheet))
            {
                diagnostics.Add(new ImportDiagnostic(0, "sheet", "missing_required_sheet"));
                return new ParsedStudentWorkbook(digest, 0, rows, diagnostics);
            }

            ValidateHeaders(worksheet, diagnostics);
            if (diagnostics.Count != 0)
            {
                return new ParsedStudentWorkbook(digest, 0, rows, diagnostics);
            }

            var lastRow = worksheet.LastRowUsed()?.RowNumber() ?? 1;
            for (var rowNumber = 2; rowNumber <= lastRow; rowNumber++)
            {
                var row = worksheet.Row(rowNumber);
                if (IsBlankRow(row))
                {
                    continue;
                }

                var rowDiagnostics = new List<ImportDiagnostic>();
                if (row.CellsUsed().Any(cell => cell.Address.ColumnNumber > RequiredHeaders.Length))
                {
                    rowDiagnostics.Add(new ImportDiagnostic(rowNumber, "row", "unexpected_column"));
                }

                var externalId = ReadRequiredText(row.Cell(1), rowNumber, "studentId", 200, rowDiagnostics);
                var displayName = ReadRequiredText(row.Cell(2), rowNumber, "studentName", 200, rowDiagnostics);
                ValidateOptionalNumber(row.Cell(3), rowNumber, "grade", rowDiagnostics);
                ValidateOptionalText(row.Cell(4), rowNumber, "groupId", rowDiagnostics);
                ValidateOptionalNumber(row.Cell(5), rowNumber, "targetScore", rowDiagnostics);
                var active = ReadRequiredBoolean(row.Cell(6), rowNumber, "active", rowDiagnostics);
                ValidateOptionalDateTime(row.Cell(7), rowNumber, "createdAt", rowDiagnostics);
                var code = ReadRequiredText(row.Cell(8), rowNumber, "inviteCode", 128, rowDiagnostics);
                ValidateOptionalText(row.Cell(9), rowNumber, "notes", rowDiagnostics);
                ValidateOptionalText(row.Cell(10), rowNumber, "parentName", rowDiagnostics);
                var programExternalId = ReadRequiredText(row.Cell(11), rowNumber, "programId", 200, rowDiagnostics);
                ValidateOptionalTextOrNumber(row.Cell(12), rowNumber, "targetGrade", rowDiagnostics);

                var normalizedExternalId = NormalizeExternalId(externalId);
                if (externalId is not null && normalizedExternalId.Length == 0)
                {
                    rowDiagnostics.Add(new ImportDiagnostic(rowNumber, "studentId", "required"));
                }

                string? normalizedCode = null;
                if (code is not null && !codeHasher.TryNormalizeCode(code, out normalizedCode))
                {
                    rowDiagnostics.Add(new ImportDiagnostic(rowNumber, "inviteCode", "invalid_format"));
                }

                diagnostics.AddRange(rowDiagnostics);
                if (rowDiagnostics.Count == 0)
                {
                    rows.Add(new StudentImportRow(
                        rowNumber,
                        normalizedExternalId,
                        displayName!,
                        active!.Value,
                        normalizedCode!,
                        NormalizeExternalId(programExternalId)));
                }
            }
        }
        catch (Exception exception) when (exception is not IOException and not UnauthorizedAccessException)
        {
            diagnostics.Add(new ImportDiagnostic(0, "workbook", "malformed_xlsx"));
        }

        AddDuplicateDiagnostics(rows, diagnostics);
        return new ParsedStudentWorkbook(digest, rows.Count + diagnostics.Select(x => x.RowNumber).Where(x => x > 0).Distinct().Count(x => rows.All(row => row.RowNumber != x)), rows, diagnostics);
    }

    public static string NormalizeExternalId(string? value) =>
        (value ?? string.Empty).Normalize(NormalizationForm.FormKC).Trim().ToUpperInvariant();

    private static void ValidateHeaders(IXLWorksheet worksheet, ICollection<ImportDiagnostic> diagnostics)
    {
        var lastColumn = worksheet.Row(1).LastCellUsed()?.Address.ColumnNumber ?? 0;
        if (lastColumn != RequiredHeaders.Length)
        {
            diagnostics.Add(new ImportDiagnostic(1, "header", "invalid_header_count"));
        }

        for (var index = 0; index < RequiredHeaders.Length; index++)
        {
            var cell = worksheet.Cell(1, index + 1);
            if (cell.HasFormula || cell.DataType != XLDataType.Text ||
                !string.Equals(cell.GetString(), RequiredHeaders[index], StringComparison.Ordinal))
            {
                diagnostics.Add(new ImportDiagnostic(1, RequiredHeaders[index], "invalid_header"));
            }
        }
    }

    private static bool IsBlankRow(IXLRow row) => !row.CellsUsed().Any(cell => !cell.IsEmpty());

    private static string? ReadRequiredText(
        IXLCell cell,
        int rowNumber,
        string field,
        int maximumLength,
        ICollection<ImportDiagnostic> diagnostics)
    {
        if (cell.HasFormula || cell.DataType != XLDataType.Text)
        {
            diagnostics.Add(new ImportDiagnostic(rowNumber, field, cell.IsEmpty() ? "required" : "invalid_type"));
            return null;
        }

        var value = cell.GetString().Normalize(NormalizationForm.FormKC).Trim();
        if (value.Length == 0)
        {
            diagnostics.Add(new ImportDiagnostic(rowNumber, field, "required"));
            return null;
        }

        if (value.Length > maximumLength)
        {
            diagnostics.Add(new ImportDiagnostic(rowNumber, field, "too_long"));
            return null;
        }

        return value;
    }

    private static bool? ReadRequiredBoolean(
        IXLCell cell,
        int rowNumber,
        string field,
        ICollection<ImportDiagnostic> diagnostics)
    {
        if (cell.HasFormula || cell.DataType != XLDataType.Boolean)
        {
            diagnostics.Add(new ImportDiagnostic(rowNumber, field, cell.IsEmpty() ? "required" : "invalid_type"));
            return null;
        }

        return cell.GetBoolean();
    }

    private static void ValidateOptionalText(IXLCell cell, int rowNumber, string field, ICollection<ImportDiagnostic> diagnostics)
    {
        if (!cell.IsEmpty() && (cell.HasFormula || cell.DataType != XLDataType.Text))
        {
            diagnostics.Add(new ImportDiagnostic(rowNumber, field, "invalid_type"));
        }
    }

    private static void ValidateOptionalNumber(IXLCell cell, int rowNumber, string field, ICollection<ImportDiagnostic> diagnostics)
    {
        if (!cell.IsEmpty() && (cell.HasFormula || cell.DataType != XLDataType.Number))
        {
            diagnostics.Add(new ImportDiagnostic(rowNumber, field, "invalid_type"));
        }
    }

    private static void ValidateOptionalDateTime(IXLCell cell, int rowNumber, string field, ICollection<ImportDiagnostic> diagnostics)
    {
        if (!cell.IsEmpty() && (cell.HasFormula || cell.DataType != XLDataType.DateTime))
        {
            diagnostics.Add(new ImportDiagnostic(rowNumber, field, "invalid_type"));
        }
    }

    private static void ValidateOptionalTextOrNumber(IXLCell cell, int rowNumber, string field, ICollection<ImportDiagnostic> diagnostics)
    {
        if (!cell.IsEmpty() && (cell.HasFormula || cell.DataType is not (XLDataType.Text or XLDataType.Number)))
        {
            diagnostics.Add(new ImportDiagnostic(rowNumber, field, "invalid_type"));
        }
    }

    private static void AddDuplicateDiagnostics(IReadOnlyCollection<StudentImportRow> rows, ICollection<ImportDiagnostic> diagnostics)
    {
        foreach (var duplicate in rows.GroupBy(row => row.ExternalId, StringComparer.Ordinal).Where(group => group.Count() > 1))
        {
            foreach (var row in duplicate)
            {
                diagnostics.Add(new ImportDiagnostic(row.RowNumber, "studentId", "duplicate_normalized_value"));
            }
        }

        foreach (var duplicate in rows.GroupBy(row => row.NormalizedCode, StringComparer.Ordinal).Where(group => group.Count() > 1))
        {
            foreach (var row in duplicate)
            {
                diagnostics.Add(new ImportDiagnostic(row.RowNumber, "inviteCode", "duplicate_normalized_value"));
            }
        }
    }
}
