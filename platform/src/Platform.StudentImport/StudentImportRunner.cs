using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.StudentImport;

public sealed class StudentImportRunner(
    Func<PlatformDbContext> dbContextFactory,
    IStudentCodeHasher codeHasher)
{
    private readonly StudentWorkbookParser workbookParser = new(codeHasher);
    private readonly ProgramMapParser programMapParser = new();
    private readonly StudentImportService importService = new(dbContextFactory, codeHasher);

    public async Task<StudentImportReport> RunAsync(
        string workbookPath,
        string programMapPath,
        string workspaceSlug,
        bool apply,
        CancellationToken cancellationToken = default)
    {
        var workbook = workbookParser.Parse(workbookPath);
        var programMap = programMapParser.Parse(programMapPath);
        var diagnostics = workbook.Diagnostics.Concat(programMap.Diagnostics).ToList();

        if (!codeHasher.TryNormalizeWorkspace(workspaceSlug, out var normalizedWorkspace))
        {
            diagnostics.Add(new ImportDiagnostic(0, "workspace", "invalid_format"));
        }

        if (diagnostics.Count != 0)
        {
            return CreateBlockedReport(apply, workbook.RowCount, diagnostics);
        }

        return await importService.ExecuteAsync(
            workbook,
            programMap,
            normalizedWorkspace,
            apply,
            cancellationToken);
    }

    private static StudentImportReport CreateBlockedReport(
        bool apply,
        int rowCount,
        IReadOnlyCollection<ImportDiagnostic> diagnostics) =>
        new(
            apply ? "apply" : "dry-run",
            false,
            rowCount,
            0,
            0,
            0,
            0,
            false,
            diagnostics.OrderBy(item => item.RowNumber)
                .ThenBy(item => item.Field, StringComparer.Ordinal)
                .ThenBy(item => item.Category, StringComparer.Ordinal)
                .ToArray());
}
