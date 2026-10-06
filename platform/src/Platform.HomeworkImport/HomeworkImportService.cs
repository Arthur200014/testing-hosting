using System.Data;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Homework;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.StudentImport;

namespace TestingHosting.Platform.HomeworkImport;

public sealed class HomeworkImportService(Func<PlatformDbContext> dbContextFactory)
{
    private const int MaximumApplyAttempts = 3;

    public async Task<HomeworkImportReport> ExecuteAsync(
        ParsedHomeworkWorkbook workbook,
        ParsedProgramMap programMap,
        string workspaceSlug,
        bool apply,
        CancellationToken cancellationToken = default)
    {
        if (!apply)
        {
            await using var db = dbContextFactory();
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, cancellationToken);
            await db.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY", cancellationToken);
            var plan = await BuildPlanAsync(db, workbook, programMap, workspaceSlug, cancellationToken);
            await transaction.RollbackAsync(cancellationToken);
            return plan.ToReport("dry-run");
        }

        for (var attempt = 1; attempt <= MaximumApplyAttempts; attempt++)
        {
            try
            {
                await using var db = dbContextFactory();
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
                var plan = await BuildPlanAsync(db, workbook, programMap, workspaceSlug, cancellationToken);
                if (plan.Diagnostics.Count != 0)
                {
                    await transaction.RollbackAsync(cancellationToken);
                    return plan.ToReport("apply");
                }

                db.HomeworkCatalogItems.AddRange(plan.CatalogToCreate);
                db.HomeworkAssignments.AddRange(plan.AssignmentsToCreate);
                db.HomeworkSubmissions.AddRange(plan.SubmissionsToCreate);
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return plan.ToReport("apply");
            }
            catch (Exception exception) when (attempt < MaximumApplyAttempts && IsConcurrencyFailure(exception))
            {
                // Rebuild the entire plan from a fresh serializable snapshot.
            }
        }

        throw new InvalidOperationException("Homework import could not be serialized after bounded retries.");
    }

    private static async Task<ImportPlan> BuildPlanAsync(
        PlatformDbContext db,
        ParsedHomeworkWorkbook workbook,
        ParsedProgramMap programMap,
        string workspaceSlug,
        CancellationToken cancellationToken)
    {
        var diagnostics = workbook.Diagnostics.ToList();
        diagnostics.AddRange(programMap.Diagnostics.Select(item =>
            new HomeworkImportDiagnostic(item.RowNumber, "program-map", item.Field, item.Category)));

        var workspace = await db.Workspaces.AsNoTracking().SingleOrDefaultAsync(x => x.Slug == workspaceSlug, cancellationToken);
        if (workspace is null || !workspace.IsActive)
        {
            diagnostics.Add(new(0, "database", "workspace", workspace is null ? "not_found" : "inactive"));
            return ImportPlan.Empty(workbook, diagnostics);
        }

        var programs = await db.Programs.AsNoTracking()
            .Where(x => x.WorkspaceId == workspace.Id)
            .ToDictionaryAsync(x => x.Code, StringComparer.Ordinal, cancellationToken);

        var mappedPrograms = new Dictionary<string, TestingHosting.Platform.Students.LearningProgram>(StringComparer.Ordinal);
        foreach (var sourceId in workbook.Catalog.Select(x => x.ProgramExternalId)
                     .Concat(workbook.Assignments.Select(x => x.ProgramExternalId)).Distinct(StringComparer.Ordinal))
        {
            if (!programMap.Entries.TryGetValue(sourceId, out var mapping) ||
                !programs.TryGetValue(mapping.Code, out var program) || !program.IsActive)
            {
                diagnostics.Add(new(0, "database", "programId", "unknown_program"));
            }
            else mappedPrograms[sourceId] = program;
        }

        var memberships = await db.WorkspaceStudentMemberships.AsNoTracking()
            .Include(x => x.Student)
            .Where(x => x.WorkspaceId == workspace.Id && x.ImportSource == StudentImportService.ImportSource && x.ImportExternalId != null)
            .ToDictionaryAsync(x => x.ImportExternalId!, StringComparer.Ordinal, cancellationToken);

        var existingCatalog = await db.HomeworkCatalogItems.AsNoTracking()
            .Where(x => x.WorkspaceId == workspace.Id).ToListAsync(cancellationToken);
        var catalogByKey = existingCatalog.ToDictionary(x => (x.ProgramId, x.HomeworkId));
        var catalogToCreate = new List<HomeworkCatalogItem>();
        var catalogUnchanged = 0;

        foreach (var row in workbook.Catalog)
        {
            if (!mappedPrograms.TryGetValue(row.ProgramExternalId, out var program)) continue;
            var key = (program.Id, row.HomeworkId);
            if (catalogByKey.TryGetValue(key, out var existing))
            {
                if (CatalogEquivalent(existing, row)) catalogUnchanged++;
                else diagnostics.Add(new(row.RowNumber, "ДЗ_Каталог", "homeworkId", "existing_conflict"));
                continue;
            }

            var item = new HomeworkCatalogItem
            {
                Id = Guid.NewGuid(), WorkspaceId = workspace.Id, ProgramId = program.Id,
                HomeworkId = row.HomeworkId, TaskNumber = row.TaskNumber, Name = row.Name, Url = row.Url,
                IsActive = row.IsActive, SortOrder = row.SortOrder, CreatedAt = row.CreatedAt
            };
            catalogToCreate.Add(item);
            catalogByKey[key] = item;
        }

        var existingAssignments = await db.HomeworkAssignments.AsNoTracking()
            .Where(x => x.WorkspaceId == workspace.Id).ToListAsync(cancellationToken);
        var assignmentsByExternalId = existingAssignments.ToDictionary(x => x.AssignmentRecordId, StringComparer.Ordinal);
        var assignmentsToCreate = new List<HomeworkAssignment>();
        var assignmentUnchanged = 0;
        var submissionsToCreate = new List<HomeworkSubmission>();
        var submissionUnchanged = 0;
        var existingSubmissions = await db.HomeworkSubmissions.AsNoTracking()
            .Where(x => x.WorkspaceId == workspace.Id).ToListAsync(cancellationToken);
        var submissionsByEvent = existingSubmissions.ToDictionary(x => x.EventId, StringComparer.Ordinal);

        foreach (var row in workbook.Assignments)
        {
            if (!mappedPrograms.TryGetValue(row.ProgramExternalId, out var program)) continue;
            if (!memberships.TryGetValue(row.StudentExternalId, out var membership) ||
                membership.Student is null || !membership.IsActive || !membership.Student.IsActive)
            {
                diagnostics.Add(new(row.RowNumber, "ДЗ_Назначения", "studentId", "unknown_student"));
                continue;
            }
            if (membership.ProgramId != program.Id)
            {
                diagnostics.Add(new(row.RowNumber, "ДЗ_Назначения", "programId", "student_program_mismatch"));
                continue;
            }
            if (!catalogByKey.TryGetValue((program.Id, row.HomeworkId), out var catalog))
            {
                diagnostics.Add(new(row.RowNumber, "ДЗ_Назначения", "homeworkId", "unknown_homework"));
                continue;
            }

            HomeworkAssignment assignment;
            if (assignmentsByExternalId.TryGetValue(row.AssignmentRecordId, out var existingAssignment))
            {
                assignment = existingAssignment;
                if (AssignmentEquivalent(existingAssignment, membership.Id, membership.StudentId, program.Id, catalog.Id, row))
                    assignmentUnchanged++;
                else
                {
                    diagnostics.Add(new(row.RowNumber, "ДЗ_Назначения", "assignmentRecordId", "existing_conflict"));
                    continue;
                }
            }
            else
            {
                assignment = new HomeworkAssignment
                {
                    Id = Guid.NewGuid(), WorkspaceId = workspace.Id, MembershipId = membership.Id,
                    StudentId = membership.StudentId, ProgramId = program.Id, CatalogItemId = catalog.Id,
                    AssignmentRecordId = row.AssignmentRecordId, HomeworkId = row.HomeworkId,
                    TaskNumber = row.TaskNumber, Name = row.Name, Url = row.Url,
                    AssignedAt = row.AssignedAt, DeadlineAt = row.DeadlineAt, SubmittedAt = row.SubmittedAt,
                    Status = row.Status, ScorePercent = row.ScorePercent,
                    HomeworkEventId = row.HomeworkEventId, LegacyLessonId = row.LessonId, SchemaVersion = row.SchemaVersion
                };
                assignmentsToCreate.Add(assignment);
                assignmentsByExternalId[row.AssignmentRecordId] = assignment;
            }

            if (row.SubmittedAt is null || row.ScorePercent is null) continue;
            var eventId = string.IsNullOrWhiteSpace(row.HomeworkEventId)
                ? $"legacy-homework:{row.AssignmentRecordId}"
                : row.HomeworkEventId;
            if (eventId.Length > 128)
            {
                diagnostics.Add(new(row.RowNumber, "ДЗ_Назначения", "homeworkEventId", "too_long"));
                continue;
            }
            var late = row.SubmittedAt.Value > row.DeadlineAt;
            if (submissionsByEvent.TryGetValue(eventId, out var existingSubmission))
            {
                if (SubmissionEquivalent(existingSubmission, assignment.Id, membership.Id, membership.StudentId,
                        program.Id, row.ScorePercent.Value, row.SubmittedAt.Value, late, row.SchemaVersion))
                    submissionUnchanged++;
                else diagnostics.Add(new(row.RowNumber, "ДЗ_Назначения", "homeworkEventId", "existing_conflict"));
                continue;
            }

            // Legacy assignments do not persist duration. Import preserves the historical
            // result with duration=0 and the original completion/status/score.
            var submission = new HomeworkSubmission
            {
                Id = Guid.NewGuid(), WorkspaceId = workspace.Id, AssignmentId = assignment.Id,
                MembershipId = membership.Id, StudentId = membership.StudentId, ProgramId = program.Id,
                EventId = eventId, ScorePercent = row.ScorePercent.Value, DurationSeconds = 0,
                CompletedAt = row.SubmittedAt.Value, IsLate = late, SchemaVersion = row.SchemaVersion,
                CreatedAt = row.SubmittedAt.Value
            };
            submissionsToCreate.Add(submission);
            submissionsByEvent[eventId] = submission;
        }

        return new ImportPlan(workbook, diagnostics, catalogToCreate, catalogUnchanged,
            assignmentsToCreate, assignmentUnchanged, submissionsToCreate, submissionUnchanged);
    }

    private static bool CatalogEquivalent(HomeworkCatalogItem item, HomeworkCatalogImportRow row) =>
        item.TaskNumber == row.TaskNumber && item.Name == row.Name && item.Url == row.Url &&
        item.IsActive == row.IsActive && item.SortOrder == row.SortOrder && item.CreatedAt == row.CreatedAt;

    private static bool AssignmentEquivalent(
        HomeworkAssignment item, Guid membershipId, Guid studentId, Guid programId, Guid catalogId,
        HomeworkAssignmentImportRow row) =>
        item.MembershipId == membershipId && item.StudentId == studentId && item.ProgramId == programId &&
        item.CatalogItemId == catalogId && item.HomeworkId == row.HomeworkId && item.TaskNumber == row.TaskNumber &&
        item.Name == row.Name && item.Url == row.Url && item.AssignedAt == row.AssignedAt &&
        item.DeadlineAt == row.DeadlineAt && item.SubmittedAt == row.SubmittedAt && item.Status == row.Status &&
        item.ScorePercent == row.ScorePercent && item.HomeworkEventId == row.HomeworkEventId &&
        item.LegacyLessonId == row.LessonId && item.SchemaVersion == row.SchemaVersion;

    private static bool SubmissionEquivalent(
        HomeworkSubmission item, Guid assignmentId, Guid membershipId, Guid studentId, Guid programId,
        int score, DateTimeOffset completedAt, bool late, string schemaVersion) =>
        item.AssignmentId == assignmentId && item.MembershipId == membershipId && item.StudentId == studentId &&
        item.ProgramId == programId && item.ScorePercent == score && item.DurationSeconds == 0 &&
        item.CompletedAt == completedAt && item.IsLate == late && item.SchemaVersion == schemaVersion;

    private static bool IsConcurrencyFailure(Exception exception) =>
        exception is DbUpdateException or DBConcurrencyException ||
        exception.InnerException is Npgsql.PostgresException postgres &&
        postgres.SqlState is Npgsql.PostgresErrorCodes.SerializationFailure or Npgsql.PostgresErrorCodes.UniqueViolation;

    private sealed record ImportPlan(
        ParsedHomeworkWorkbook Workbook,
        List<HomeworkImportDiagnostic> Diagnostics,
        List<HomeworkCatalogItem> CatalogToCreate,
        int CatalogUnchanged,
        List<HomeworkAssignment> AssignmentsToCreate,
        int AssignmentUnchanged,
        List<HomeworkSubmission> SubmissionsToCreate,
        int SubmissionUnchanged)
    {
        public static ImportPlan Empty(ParsedHomeworkWorkbook workbook, List<HomeworkImportDiagnostic> diagnostics) =>
            new(workbook, diagnostics, [], 0, [], 0, [], 0);

        public HomeworkImportReport ToReport(string mode) => new(
            mode,
            Diagnostics.Count == 0,
            Workbook.Catalog.Count,
            Workbook.Assignments.Count,
            CatalogToCreate.Count,
            CatalogUnchanged,
            AssignmentsToCreate.Count,
            AssignmentUnchanged,
            SubmissionsToCreate.Count,
            SubmissionUnchanged,
            Diagnostics);
    }
}
