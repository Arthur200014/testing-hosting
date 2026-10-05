using Microsoft.EntityFrameworkCore;
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
                table.HasCheckConstraint(
                    "CK_WorkspaceStudentMemberships_CodeHash_Length",
                    "octet_length(\"CodeHash\") = 32");
                table.HasCheckConstraint(
                    "CK_WorkspaceStudentMemberships_ImportIdentity",
                    "(\"ImportSource\" IS NULL) = (\"ImportExternalId\" IS NULL)");
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

        modelBuilder.Entity<TestAttempt>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EventId).HasMaxLength(128);
            entity.Property(x => x.TestId).HasMaxLength(128);
            entity.Property(x => x.Topic).HasMaxLength(200);
            entity.Property(x => x.SchemaVersion).HasMaxLength(64);
            entity.Property(x => x.MoscowMonthKey).HasMaxLength(7).IsFixedLength();
            entity.HasIndex(x => new { x.WorkspaceId, x.EventId }).IsUnique();
            entity.HasIndex(x => new
            {
                x.WorkspaceId,
                x.MembershipId,
                x.TestId,
                x.MoscowMonthKey,
                x.Percent,
                x.DurationSeconds,
                x.CompletedAt,
                x.Id
            })
                .HasDatabaseName("IX_TestAttempts_MonthlyBest")
                .IsDescending(false, false, false, false, true, false, false, false);
            entity.HasOne(x => x.Workspace)
                .WithMany()
                .HasForeignKey(x => x.WorkspaceId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Membership)
                .WithMany()
                .HasForeignKey(x => new { x.WorkspaceId, x.MembershipId, x.StudentId })
                .HasPrincipalKey(x => new { x.WorkspaceId, x.Id, x.StudentId })
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Program)
                .WithMany()
                .HasForeignKey(x => new { x.WorkspaceId, x.ProgramId })
                .HasPrincipalKey(x => new { x.WorkspaceId, x.Id })
                .OnDelete(DeleteBehavior.Restrict);
            entity.ToTable(table =>
            {
                table.HasCheckConstraint(
                    "CK_TestAttempts_RequiredStrings",
                    "length(\"EventId\") > 0 AND length(\"TestId\") > 0 AND length(\"Topic\") > 0 AND length(\"SchemaVersion\") > 0");
                table.HasCheckConstraint(
                    "CK_TestAttempts_CountsAndPercent",
                    "\"TaskNumber\" BETWEEN 1 AND 1000 AND \"Total\" BETWEEN 1 AND 10000 AND \"Correct\" BETWEEN 0 AND \"Total\" AND \"Percent\" = (\"Correct\" * 100 / \"Total\")");
                table.HasCheckConstraint(
                    "CK_TestAttempts_TimestampsAndDuration",
                    "\"CompletedAt\" >= \"StartedAt\" AND \"DurationSeconds\" BETWEEN 0 AND 86400 AND \"CompletedAt\" - \"StartedAt\" <= interval '1 day' AND \"DurationSeconds\" = round(extract(epoch from (\"CompletedAt\" - \"StartedAt\")))::integer");
                table.HasCheckConstraint(
                    "CK_TestAttempts_MoscowMonthKey",
                    "\"MoscowMonthKey\" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND \"MoscowMonthKey\" = (lpad(extract(year from (\"CompletedAt\" AT TIME ZONE 'Europe/Moscow'))::integer::text, 4, '0') || '-' || lpad(extract(month from (\"CompletedAt\" AT TIME ZONE 'Europe/Moscow'))::integer::text, 2, '0'))");
            });
        });
    }
}
