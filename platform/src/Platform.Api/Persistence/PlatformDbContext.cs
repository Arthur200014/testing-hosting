using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Homework;
using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Students;
using TestingHosting.Platform.TestAttempts;

namespace TestingHosting.Platform.Persistence;

public sealed class PlatformDbContext(DbContextOptions<PlatformDbContext> options) : DbContext(options)
{
    public DbSet<Workspace> Workspaces => Set<Workspace>();
    public DbSet<TeacherUser> TeacherUsers => Set<TeacherUser>();
    public DbSet<WorkspaceMembership> WorkspaceMemberships => Set<WorkspaceMembership>();
    public DbSet<LearningProgram> Programs => Set<LearningProgram>();
    public DbSet<Student> Students => Set<Student>();
    public DbSet<WorkspaceStudentMembership> WorkspaceStudentMemberships => Set<WorkspaceStudentMembership>();
    public DbSet<StudentImportBatch> StudentImportBatches => Set<StudentImportBatch>();
    public DbSet<TestAttempt> TestAttempts => Set<TestAttempt>();
    public DbSet<HomeworkCatalogItem> HomeworkCatalogItems => Set<HomeworkCatalogItem>();
    public DbSet<HomeworkAssignment> HomeworkAssignments => Set<HomeworkAssignment>();
    public DbSet<HomeworkSubmission> HomeworkSubmissions => Set<HomeworkSubmission>();
    public DbSet<HomeworkImportBatch> HomeworkImportBatches => Set<HomeworkImportBatch>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("platform");

        modelBuilder.Entity<Workspace>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Slug).HasMaxLength(63);
            entity.HasIndex(x => x.Slug).IsUnique();
        });

        modelBuilder.Entity<TeacherUser>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Email).HasMaxLength(320);
            entity.Property(x => x.NormalizedEmail).HasMaxLength(320);
            entity.HasIndex(x => x.NormalizedEmail).IsUnique();
        });

        modelBuilder.Entity<WorkspaceMembership>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Role).HasMaxLength(32);
            entity.HasIndex(x => new { x.WorkspaceId, x.TeacherUserId }).IsUnique();
            entity.HasOne(x => x.Workspace).WithMany(x => x.TeacherMemberships).HasForeignKey(x => x.WorkspaceId);
            entity.HasOne(x => x.TeacherUser).WithMany(x => x.WorkspaceMemberships).HasForeignKey(x => x.TeacherUserId);
        });

        modelBuilder.Entity<LearningProgram>(entity =>
        {
            entity.ToTable(table => table.HasCheckConstraint("CK_Programs_Code_NotEmpty", "length(\"Code\") > 0"));
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Code).HasMaxLength(64);
            entity.Property(x => x.DisplayName).HasMaxLength(200);
            entity.HasAlternateKey(x => new { x.WorkspaceId, x.Id });
            entity.HasIndex(x => new { x.WorkspaceId, x.Code }).IsUnique();
            entity.HasOne(x => x.Workspace).WithMany().HasForeignKey(x => x.WorkspaceId);
        });

        modelBuilder.Entity<Student>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.DisplayName).HasMaxLength(200);
        });

        modelBuilder.Entity<WorkspaceStudentMembership>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasAlternateKey(x => new { x.WorkspaceId, x.Id, x.StudentId });
            entity.HasAlternateKey(x => new { x.WorkspaceId, x.Id, x.StudentId, x.ProgramId })
                .HasName("AK_StudentMemberships_HomeworkIdentity");
            entity.Property(x => x.CodeHash).HasColumnType("bytea").HasMaxLength(32);
            entity.Property(x => x.ImportSource).HasMaxLength(64);
            entity.Property(x => x.ImportExternalId).HasMaxLength(200);
            entity.HasIndex(x => new { x.WorkspaceId, x.StudentId }).IsUnique();
            entity.HasIndex(x => new { x.WorkspaceId, x.CodeHash }).IsUnique();
            entity.HasIndex(x => new { x.WorkspaceId, x.ImportSource, x.ImportExternalId })
                .IsUnique()
                .HasFilter("\"ImportSource\" IS NOT NULL AND \"ImportExternalId\" IS NOT NULL");
            entity.HasOne(x => x.Workspace).WithMany().HasForeignKey(x => x.WorkspaceId);
            entity.HasOne(x => x.Student).WithMany(x => x.WorkspaceMemberships).HasForeignKey(x => x.StudentId);
            entity.HasOne(x => x.Program).WithMany(x => x.StudentMemberships)
                .HasForeignKey(x => new { x.WorkspaceId, x.ProgramId })
                .HasPrincipalKey(x => new { x.WorkspaceId, x.Id })
                .OnDelete(DeleteBehavior.Restrict);
            entity.ToTable(table =>
            {
                table.HasCheckConstraint("CK_WorkspaceStudentMemberships_CodeHash_Length", "octet_length(\"CodeHash\") = 32");
                table.HasCheckConstraint("CK_WorkspaceStudentMemberships_ImportIdentity", "(\"ImportSource\" IS NULL) = (\"ImportExternalId\" IS NULL)");
            });
        });

        modelBuilder.Entity<StudentImportBatch>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Source).HasMaxLength(64);
            entity.Property(x => x.WorkbookDigest).HasMaxLength(64).IsFixedLength();
            entity.Property(x => x.ProgramMapDigest).HasMaxLength(64).IsFixedLength();
            entity.Property(x => x.Status).HasMaxLength(32);
            entity.HasIndex(x => new { x.WorkspaceId, x.Source, x.WorkbookDigest, x.ProgramMapDigest }).IsUnique();
            entity.HasOne(x => x.Workspace).WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Restrict);
            entity.ToTable(table =>
            {
                table.HasCheckConstraint("CK_StudentImportBatches_WorkbookDigest_Length", "length(\"WorkbookDigest\") = 64");
                table.HasCheckConstraint("CK_StudentImportBatches_ProgramMapDigest_Length", "length(\"ProgramMapDigest\") = 64");
                table.HasCheckConstraint("CK_StudentImportBatches_Counts", "\"RowCount\" >= 0 AND \"CreatedStudentCount\" >= 0 AND \"UnchangedStudentCount\" >= 0 AND \"CreatedStudentCount\" + \"UnchangedStudentCount\" = \"RowCount\"");
            });
        });

        modelBuilder.Entity<HomeworkCatalogItem>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.HomeworkId).HasMaxLength(128);
            entity.Property(x => x.Name).HasMaxLength(200);
            entity.Property(x => x.Url).HasMaxLength(2048);
            entity.HasAlternateKey(x => new { x.WorkspaceId, x.Id });
            entity.HasAlternateKey(x => new { x.WorkspaceId, x.Id, x.ProgramId, x.HomeworkId })
                .HasName("AK_HomeworkCatalog_Identity");
            entity.HasIndex(x => new { x.WorkspaceId, x.ProgramId, x.HomeworkId }).IsUnique();
            entity.HasOne(x => x.Workspace).WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Program).WithMany()
                .HasForeignKey(x => new { x.WorkspaceId, x.ProgramId })
                .HasPrincipalKey(x => new { x.WorkspaceId, x.Id })
                .OnDelete(DeleteBehavior.Restrict);
            entity.ToTable(table =>
            {
                table.HasCheckConstraint("CK_HomeworkCatalog_RequiredStrings", "length(\"HomeworkId\") > 0 AND length(\"Name\") > 0 AND length(\"Url\") > 0");
                table.HasCheckConstraint("CK_HomeworkCatalog_TaskAndOrder", "\"TaskNumber\" BETWEEN 1 AND 1000 AND \"SortOrder\" >= 0");
            });
        });

        modelBuilder.Entity<HomeworkAssignment>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasAlternateKey(x => new { x.WorkspaceId, x.Id });
            entity.HasAlternateKey(x => new { x.WorkspaceId, x.Id, x.MembershipId, x.StudentId, x.ProgramId })
                .HasName("AK_HomeworkAssignments_SubmissionIdentity");
            entity.Property(x => x.AssignmentRecordId).HasMaxLength(128);
            entity.Property(x => x.HomeworkId).HasMaxLength(128);
            entity.Property(x => x.Name).HasMaxLength(200);
            entity.Property(x => x.Url).HasMaxLength(2048);
            entity.Property(x => x.Status).HasMaxLength(32);
            entity.Property(x => x.HomeworkEventId).HasMaxLength(128);
            entity.Property(x => x.LegacyLessonId).HasMaxLength(128);
            entity.Property(x => x.SchemaVersion).HasMaxLength(64);
            entity.HasIndex(x => new { x.WorkspaceId, x.AssignmentRecordId }).IsUnique();
            entity.HasIndex(x => new { x.WorkspaceId, x.MembershipId, x.ProgramId, x.HomeworkId, x.AssignedAt });
            entity.HasOne(x => x.Workspace).WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Membership).WithMany()
                .HasForeignKey(x => new { x.WorkspaceId, x.MembershipId, x.StudentId, x.ProgramId })
                .HasPrincipalKey(x => new { x.WorkspaceId, x.Id, x.StudentId, x.ProgramId })
                .HasConstraintName("FK_HomeworkAssignments_MembershipIdentity")
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Program).WithMany()
                .HasForeignKey(x => new { x.WorkspaceId, x.ProgramId })
                .HasPrincipalKey(x => new { x.WorkspaceId, x.Id })
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.CatalogItem).WithMany()
                .HasForeignKey(x => new { x.WorkspaceId, x.CatalogItemId, x.ProgramId, x.HomeworkId })
                .HasPrincipalKey(x => new { x.WorkspaceId, x.Id, x.ProgramId, x.HomeworkId })
                .HasConstraintName("FK_HomeworkAssignments_CatalogIdentity")
                .OnDelete(DeleteBehavior.Restrict);
            entity.ToTable(table =>
            {
                table.HasCheckConstraint("CK_HomeworkAssignments_RequiredStrings", "length(\"AssignmentRecordId\") > 0 AND length(\"HomeworkId\") > 0 AND length(\"Name\") > 0 AND length(\"Url\") > 0 AND length(\"Status\") > 0 AND length(\"SchemaVersion\") > 0");
                table.HasCheckConstraint("CK_HomeworkAssignments_Deadline", "\"DeadlineAt\" > \"AssignedAt\"");
                table.HasCheckConstraint("CK_HomeworkAssignments_TaskScore", "\"TaskNumber\" BETWEEN 1 AND 1000 AND (\"ScorePercent\" IS NULL OR \"ScorePercent\" BETWEEN 0 AND 100)");
            });
        });

        modelBuilder.Entity<HomeworkSubmission>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EventId).HasMaxLength(128);
            entity.Property(x => x.SchemaVersion).HasMaxLength(64);
            entity.HasIndex(x => new { x.WorkspaceId, x.EventId }).IsUnique();
            entity.HasIndex(x => new { x.WorkspaceId, x.AssignmentId, x.CompletedAt });
            entity.HasOne(x => x.Workspace).WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Assignment).WithMany()
                .HasForeignKey(x => new { x.WorkspaceId, x.AssignmentId, x.MembershipId, x.StudentId, x.ProgramId })
                .HasPrincipalKey(x => new { x.WorkspaceId, x.Id, x.MembershipId, x.StudentId, x.ProgramId })
                .HasConstraintName("FK_HomeworkSubmissions_AssignmentIdentity")
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Membership).WithMany()
                .HasForeignKey(x => new { x.WorkspaceId, x.MembershipId, x.StudentId })
                .HasPrincipalKey(x => new { x.WorkspaceId, x.Id, x.StudentId })
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Program).WithMany()
                .HasForeignKey(x => new { x.WorkspaceId, x.ProgramId })
                .HasPrincipalKey(x => new { x.WorkspaceId, x.Id })
                .OnDelete(DeleteBehavior.Restrict);
            entity.ToTable(table =>
            {
                table.HasCheckConstraint("CK_HomeworkSubmissions_RequiredStrings", "length(\"EventId\") > 0 AND length(\"SchemaVersion\") > 0");
                table.HasCheckConstraint("CK_HomeworkSubmissions_ScoreDuration", "\"ScorePercent\" BETWEEN 0 AND 100 AND \"DurationSeconds\" BETWEEN 0 AND 86400");
            });
        });

        modelBuilder.Entity<HomeworkImportBatch>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Source).HasMaxLength(64);
            entity.Property(x => x.WorkbookDigest).HasMaxLength(64).IsFixedLength();
            entity.Property(x => x.ProgramMapDigest).HasMaxLength(64).IsFixedLength();
            entity.Property(x => x.Status).HasMaxLength(32);
            entity.HasIndex(x => new { x.WorkspaceId, x.Source, x.WorkbookDigest, x.ProgramMapDigest })
                .IsUnique()
                .HasDatabaseName("IX_HomeworkImportBatches_Digests");
            entity.HasOne(x => x.Workspace).WithMany().HasForeignKey(x => x.WorkspaceId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.ToTable(table =>
            {
                table.HasCheckConstraint("CK_HomeworkImportBatches_WorkbookDigest_Length", "length(\"WorkbookDigest\") = 64");
                table.HasCheckConstraint("CK_HomeworkImportBatches_ProgramMapDigest_Length", "length(\"ProgramMapDigest\") = 64");
                table.HasCheckConstraint("CK_HomeworkImportBatches_Status", "\"Status\" = 'applied'");
                table.HasCheckConstraint("CK_HomeworkImportBatches_Counts", "\"CatalogRowCount\" >= 0 AND \"AssignmentRowCount\" >= 0 AND \"SubmissionRowCount\" >= 0 AND \"CatalogCreatedCount\" >= 0 AND \"CatalogUnchangedCount\" >= 0 AND \"CatalogCreatedCount\" + \"CatalogUnchangedCount\" = \"CatalogRowCount\" AND \"AssignmentCreatedCount\" >= 0 AND \"AssignmentUnchangedCount\" >= 0 AND \"AssignmentCreatedCount\" + \"AssignmentUnchangedCount\" = \"AssignmentRowCount\" AND \"SubmissionCreatedCount\" >= 0 AND \"SubmissionUnchangedCount\" >= 0 AND \"SubmissionCreatedCount\" + \"SubmissionUnchangedCount\" = \"SubmissionRowCount\"");
            });
        });

        modelBuilder.Entity<TestAttempt>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EventId).HasMaxLength(128);
            entity.Property(x => x.TestId).HasMaxLength(128);
            entity.Property(x => x.Topic).HasMaxLength(200);
            entity.Property(x => x.SchemaVersion).HasMaxLength(64);
            entity.Property(x => x.MoscowMonthKey).HasMaxLength(7).IsFixedLength();
            entity.HasIndex(x => new { x.WorkspaceId, x.EventId }).IsUnique();
            entity.HasIndex(x => new { x.WorkspaceId, x.MembershipId, x.TestId, x.MoscowMonthKey, x.Percent, x.DurationSeconds, x.CompletedAt, x.Id })
                .HasDatabaseName("IX_TestAttempts_MonthlyBest")
                .IsDescending(false, false, false, false, true, false, false, false);
            entity.HasOne(x => x.Workspace).WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Membership).WithMany()
                .HasForeignKey(x => new { x.WorkspaceId, x.MembershipId, x.StudentId })
                .HasPrincipalKey(x => new { x.WorkspaceId, x.Id, x.StudentId })
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Program).WithMany()
                .HasForeignKey(x => new { x.WorkspaceId, x.ProgramId })
                .HasPrincipalKey(x => new { x.WorkspaceId, x.Id })
                .OnDelete(DeleteBehavior.Restrict);
            entity.ToTable(table =>
            {
                table.HasCheckConstraint("CK_TestAttempts_RequiredStrings", "length(\"EventId\") > 0 AND length(\"TestId\") > 0 AND length(\"Topic\") > 0 AND length(\"SchemaVersion\") > 0");
                table.HasCheckConstraint("CK_TestAttempts_CountsAndPercent", "\"TaskNumber\" BETWEEN 1 AND 1000 AND \"Total\" BETWEEN 1 AND 10000 AND \"Correct\" BETWEEN 0 AND \"Total\" AND \"Percent\" = (\"Correct\" * 100 / \"Total\")");
                table.HasCheckConstraint("CK_TestAttempts_TimestampsAndDuration", "\"CompletedAt\" >= \"StartedAt\" AND \"DurationSeconds\" BETWEEN 0 AND 86400 AND \"CompletedAt\" - \"StartedAt\" <= interval '1 day' AND \"DurationSeconds\" = round(extract(epoch from (\"CompletedAt\" - \"StartedAt\")))::integer");
                table.HasCheckConstraint("CK_TestAttempts_MoscowMonthKey", "\"MoscowMonthKey\" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND \"MoscowMonthKey\" = (lpad(extract(year from (\"CompletedAt\" AT TIME ZONE 'Europe/Moscow'))::integer::text, 4, '0') || '-' || lpad(extract(month from (\"CompletedAt\" AT TIME ZONE 'Europe/Moscow'))::integer::text, 2, '0'))");
            });
        });
    }
}
