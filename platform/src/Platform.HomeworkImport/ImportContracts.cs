namespace TestingHosting.Platform.HomeworkImport;

public sealed record HomeworkImportDiagnostic(int RowNumber, string Sheet, string Field, string Category);

public sealed record HomeworkCatalogImportRow(
    int RowNumber,
    string HomeworkId,
    int TaskNumber,
    string Name,
    string Url,
    bool IsActive,
    int SortOrder,
    DateTimeOffset CreatedAt,
    string ProgramExternalId);

public sealed record HomeworkAssignmentImportRow(
    int RowNumber,
    string AssignmentRecordId,
    string StudentExternalId,
    string HomeworkId,
    int TaskNumber,
    string Name,
    string Url,
    DateTimeOffset AssignedAt,
    DateTimeOffset DeadlineAt,
    DateTimeOffset? SubmittedAt,
    string Status,
    int? ScorePercent,
    string? HomeworkEventId,
    string? LessonId,
    string SchemaVersion,
    string ProgramExternalId);

public sealed record ParsedHomeworkWorkbook(
    string Digest,
    IReadOnlyList<HomeworkCatalogImportRow> Catalog,
    IReadOnlyList<HomeworkAssignmentImportRow> Assignments,
    IReadOnlyList<HomeworkImportDiagnostic> Diagnostics);

public sealed record HomeworkImportReport(
    string Mode,
    bool CanApply,
    int CatalogRows,
    int AssignmentRows,
    int CatalogCreateCount,
    int CatalogUnchangedCount,
    int AssignmentCreateCount,
    int AssignmentUnchangedCount,
    int SubmissionCreateCount,
    int SubmissionUnchangedCount,
    IReadOnlyList<HomeworkImportDiagnostic> Diagnostics);
