namespace TestingHosting.Platform.StudentImport;

public sealed record ImportDiagnostic(int RowNumber, string Field, string Category);

public sealed record StudentImportReport(
    string Mode,
    bool CanApply,
    int RowCount,
    int WorkspaceCreateCount,
    int ProgramCreateCount,
    int StudentCreateCount,
    int UnchangedStudentCount,
    bool AlreadyApplied,
    IReadOnlyList<ImportDiagnostic> Diagnostics);

public sealed record StudentImportRow(
    int RowNumber,
    string ExternalId,
    string DisplayName,
    bool IsActive,
    string NormalizedCode,
    string ProgramExternalId);

public sealed record ParsedStudentWorkbook(
    string Digest,
    int RowCount,
    IReadOnlyList<StudentImportRow> Rows,
    IReadOnlyList<ImportDiagnostic> Diagnostics);

public sealed record ProgramMapEntry(string SourceId, string Code, string DisplayName);

public sealed record ParsedProgramMap(
    string Digest,
    IReadOnlyDictionary<string, ProgramMapEntry> Entries,
    IReadOnlyList<ImportDiagnostic> Diagnostics);
