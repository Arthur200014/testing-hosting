using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Students;

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
    }
}
