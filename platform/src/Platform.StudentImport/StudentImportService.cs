using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.StudentImport;

public sealed class StudentImportService(
    Func<PlatformDbContext> dbContextFactory,
    IStudentCodeHasher codeHasher)
{
    public const string ImportSource = "google-sheets-students-xlsx-v1";
    private const int MaximumApplyAttempts = 3;

    public async Task<StudentImportReport> ExecuteAsync(
        ParsedStudentWorkbook workbook,
        ParsedProgramMap programMap,
        string workspaceSlug,
        bool apply,
        CancellationToken cancellationToken)
    {
        if (!apply)
        {
            await using var dbContext = dbContextFactory();
            await using var transaction = await dbContext.Database.BeginTransactionAsync(
                IsolationLevel.RepeatableRead,
                cancellationToken);
            await dbContext.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY", cancellationToken);
            var plan = await BuildPlanAsync(dbContext, workbook, programMap, workspaceSlug, cancellationToken);
            await transaction.RollbackAsync(cancellationToken);
            return plan.ToReport(false);
        }

        for (var attempt = 1; attempt <= MaximumApplyAttempts; attempt++)
        {
            try
            {
                return await ApplyOnceAsync(workbook, programMap, workspaceSlug, cancellationToken);
            }
            catch (Exception exception) when (attempt < MaximumApplyAttempts && IsConcurrencyFailure(exception))
            {
                // A fresh DbContext and serializable transaction re-read all constraints before retrying.
            }
        }

        throw new InvalidOperationException("The import could not be serialized after bounded retries.");
    }

    private async Task<StudentImportReport> ApplyOnceAsync(
        ParsedStudentWorkbook workbook,
        ParsedProgramMap programMap,
        string workspaceSlug,
        CancellationToken cancellationToken)
    {
        await using var dbContext = dbContextFactory();
        await using var transaction = await dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);
        var plan = await BuildPlanAsync(dbContext, workbook, programMap, workspaceSlug, cancellationToken);
        if (plan.Diagnostics.Count != 0 || plan.AlreadyApplied)
        {
            await transaction.RollbackAsync(cancellationToken);
            return plan.ToReport(true);
        }

        if (plan.CreateWorkspace)
        {
            dbContext.Workspaces.Add(plan.Workspace);
        }

        dbContext.Programs.AddRange(plan.ProgramsToCreate);
        foreach (var plannedStudent in plan.StudentsToCreate)
        {
            var student = new Student
            {
                Id = Guid.NewGuid(),
                DisplayName = plannedStudent.Row.DisplayName,
                IsActive = plannedStudent.Row.IsActive,
                CreatedAt = plan.Timestamp
            };
            var membership = new WorkspaceStudentMembership
            {
                Id = Guid.NewGuid(),
                WorkspaceId = plan.Workspace.Id,
                Workspace = plan.Workspace,
                StudentId = student.Id,
                Student = student,
                ProgramId = plannedStudent.Program.Id,
                Program = plannedStudent.Program,
                CodeHash = plannedStudent.CodeHash,
                ImportSource = ImportSource,
                ImportExternalId = plannedStudent.Row.ExternalId,
                IsActive = plannedStudent.Row.IsActive,
                CreatedAt = plan.Timestamp
            };
            dbContext.WorkspaceStudentMemberships.Add(membership);
        }

        dbContext.StudentImportBatches.Add(new StudentImportBatch
        {
            Id = Guid.NewGuid(),
            WorkspaceId = plan.Workspace.Id,
            Workspace = plan.Workspace,
            Source = ImportSource,
            WorkbookDigest = workbook.Digest,
            ProgramMapDigest = programMap.Digest,
            Status = "applied",
            RowCount = workbook.RowCount,
            CreatedStudentCount = plan.StudentsToCreate.Count,
            UnchangedStudentCount = plan.UnchangedStudentCount,
            CreatedAt = plan.Timestamp,
            CompletedAt = plan.Timestamp
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return plan.ToReport(true);
    }

    private async Task<ImportPlan> BuildPlanAsync(
        PlatformDbContext dbContext,
        ParsedStudentWorkbook workbook,
        ParsedProgramMap programMap,
        string workspaceSlug,
        CancellationToken cancellationToken)
    {
        var diagnostics = new List<ImportDiagnostic>();
        var mappedRows = new List<MappedSourceRow>();
        foreach (var row in workbook.Rows)
        {
            if (!programMap.Entries.TryGetValue(row.ProgramExternalId, out var program))
            {
                diagnostics.Add(new ImportDiagnostic(row.RowNumber, "programId", "unknown_program"));
            }
            else
            {
                mappedRows.Add(new MappedSourceRow(row, program));
            }
        }

        var workspace = await dbContext.Workspaces.SingleOrDefaultAsync(
            item => item.Slug == workspaceSlug,
            cancellationToken);
        var createWorkspace = workspace is null;
        workspace ??= new Workspace
        {
            Id = Guid.NewGuid(),
            Slug = workspaceSlug,
            IsActive = true
        };
        if (!workspace.IsActive)
        {
            diagnostics.Add(new ImportDiagnostic(0, "workspace", "existing_conflict"));
        }

        var existingPrograms = createWorkspace
            ? []
            : await dbContext.Programs.Where(item => item.WorkspaceId == workspace.Id).ToListAsync(cancellationToken);
        var existingProgramsByCode = existingPrograms.ToDictionary(item => item.Code, StringComparer.Ordinal);
        var programsToCreate = new List<LearningProgram>();
        var programsByCode = new Dictionary<string, LearningProgram>(existingProgramsByCode, StringComparer.Ordinal);
        foreach (var mapping in mappedRows.Select(item => item.Program).DistinctBy(item => item.Code))
        {
            if (programsByCode.TryGetValue(mapping.Code, out var existingProgram))
            {
                if (!existingProgram.IsActive ||
                    !string.Equals(existingProgram.DisplayName, mapping.DisplayName, StringComparison.Ordinal))
                {
                    foreach (var affectedRow in mappedRows.Where(item => item.Program.Code == mapping.Code))
                    {
                        diagnostics.Add(new ImportDiagnostic(affectedRow.Row.RowNumber, "programId", "existing_conflict"));
                    }
                }

                continue;
            }

            var program = new LearningProgram
            {
                Id = Guid.NewGuid(),
                WorkspaceId = workspace.Id,
                Workspace = workspace,
                Code = mapping.Code,
                DisplayName = mapping.DisplayName,
                IsActive = true
            };
            programsByCode.Add(program.Code, program);
            programsToCreate.Add(program);
        }

        var existingMemberships = createWorkspace
            ? []
            : await dbContext.WorkspaceStudentMemberships
                .Include(item => item.Student)
                .Include(item => item.Program)
                .Where(item => item.WorkspaceId == workspace.Id)
                .ToListAsync(cancellationToken);
        var byExternalId = existingMemberships
            .Where(item => item.ImportSource == ImportSource && item.ImportExternalId is not null)
            .ToDictionary(item => item.ImportExternalId!, StringComparer.Ordinal);
        var byCodeHash = existingMemberships.ToDictionary(
            item => Convert.ToHexString(item.CodeHash),
            StringComparer.Ordinal);

        var studentsToCreate = new List<PlannedStudent>();
        var unchangedCount = 0;
        foreach (var mappedRow in mappedRows)
        {
            var row = mappedRow.Row;
            var codeHash = codeHasher.Hash(workspaceSlug, row.NormalizedCode);
            var codeHashKey = Convert.ToHexString(codeHash);
            if (byExternalId.TryGetValue(row.ExternalId, out var existingMembership))
            {
                var exactMatch = existingMembership.CodeHash.AsSpan().SequenceEqual(codeHash) &&
                    existingMembership.IsActive == row.IsActive &&
                    existingMembership.Student.IsActive == row.IsActive &&
                    string.Equals(existingMembership.Student.DisplayName, row.DisplayName, StringComparison.Ordinal) &&
                    string.Equals(existingMembership.Program.Code, mappedRow.Program.Code, StringComparison.Ordinal);
                if (exactMatch)
                {
                    unchangedCount++;
                }
                else
                {
                    diagnostics.Add(new ImportDiagnostic(row.RowNumber, "student", "existing_conflict"));
                }

                continue;
            }

            if (byCodeHash.ContainsKey(codeHashKey))
            {
                diagnostics.Add(new ImportDiagnostic(row.RowNumber, "inviteCode", "existing_conflict"));
                continue;
            }

            studentsToCreate.Add(new PlannedStudent(row, programsByCode[mappedRow.Program.Code], codeHash));
        }

        var existingBatch = !createWorkspace && await dbContext.StudentImportBatches.AnyAsync(
            item => item.WorkspaceId == workspace.Id &&
                item.Source == ImportSource &&
                item.WorkbookDigest == workbook.Digest &&
                item.ProgramMapDigest == programMap.Digest,
            cancellationToken);
        if (existingBatch && (studentsToCreate.Count != 0 || unchangedCount != workbook.RowCount))
        {
            diagnostics.Add(new ImportDiagnostic(0, "importBatch", "existing_state_conflict"));
        }

        return new ImportPlan(
            workbook.RowCount,
            workspace,
            createWorkspace,
            programsToCreate,
            studentsToCreate,
            unchangedCount,
            existingBatch && diagnostics.Count == 0,
            DateTimeOffset.UtcNow,
            diagnostics);
    }

    private static bool IsConcurrencyFailure(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException postgresException &&
                postgresException.SqlState is PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.UniqueViolation)
            {
                return true;
            }
        }

        return exception is AggregateException aggregate && aggregate.InnerExceptions.Any(IsConcurrencyFailure);
    }

    private sealed record MappedSourceRow(StudentImportRow Row, ProgramMapEntry Program);

    private sealed record PlannedStudent(StudentImportRow Row, LearningProgram Program, byte[] CodeHash);

    private sealed record ImportPlan(
        int RowCount,
        Workspace Workspace,
        bool CreateWorkspace,
        IReadOnlyList<LearningProgram> ProgramsToCreate,
        IReadOnlyList<PlannedStudent> StudentsToCreate,
        int UnchangedStudentCount,
        bool AlreadyApplied,
        DateTimeOffset Timestamp,
        IReadOnlyList<ImportDiagnostic> Diagnostics)
    {
        public StudentImportReport ToReport(bool apply) => new(
            apply ? "apply" : "dry-run",
            Diagnostics.Count == 0,
            RowCount,
            CreateWorkspace ? 1 : 0,
            ProgramsToCreate.Count,
            StudentsToCreate.Count,
            UnchangedStudentCount,
            AlreadyApplied,
            Diagnostics.OrderBy(item => item.RowNumber)
                .ThenBy(item => item.Field, StringComparer.Ordinal)
                .ThenBy(item => item.Category, StringComparer.Ordinal)
                .ToArray());
    }
}
