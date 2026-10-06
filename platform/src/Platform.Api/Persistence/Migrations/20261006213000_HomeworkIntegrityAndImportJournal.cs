using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261006213000_HomeworkIntegrityAndImportJournal")]
public sealed class HomeworkIntegrityAndImportJournal : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE platform."WorkspaceStudentMemberships"
                ADD CONSTRAINT "AK_StudentMemberships_HomeworkIdentity"
                UNIQUE ("WorkspaceId", "Id", "StudentId", "ProgramId");

            ALTER TABLE platform."HomeworkCatalogItems"
                ADD CONSTRAINT "AK_HomeworkCatalog_Identity"
                UNIQUE ("WorkspaceId", "Id", "ProgramId", "HomeworkId");

            ALTER TABLE platform."HomeworkAssignments"
                ADD CONSTRAINT "AK_HomeworkAssignments_SubmissionIdentity"
                UNIQUE ("WorkspaceId", "Id", "MembershipId", "StudentId", "ProgramId");

            ALTER TABLE platform."HomeworkAssignments"
                DROP CONSTRAINT "FK_HomeworkAssignments_WorkspaceStudentMemberships_WorkspaceId_MembershipId_StudentId";
            ALTER TABLE platform."HomeworkAssignments"
                ADD CONSTRAINT "FK_HomeworkAssignments_MembershipIdentity"
                FOREIGN KEY ("WorkspaceId", "MembershipId", "StudentId", "ProgramId")
                REFERENCES platform."WorkspaceStudentMemberships" ("WorkspaceId", "Id", "StudentId", "ProgramId")
                ON DELETE RESTRICT;

            ALTER TABLE platform."HomeworkAssignments"
                DROP CONSTRAINT "FK_HomeworkAssignments_HomeworkCatalogItems_WorkspaceId_CatalogItemId";
            ALTER TABLE platform."HomeworkAssignments"
                ADD CONSTRAINT "FK_HomeworkAssignments_CatalogIdentity"
                FOREIGN KEY ("WorkspaceId", "CatalogItemId", "ProgramId", "HomeworkId")
                REFERENCES platform."HomeworkCatalogItems" ("WorkspaceId", "Id", "ProgramId", "HomeworkId")
                ON DELETE RESTRICT;

            ALTER TABLE platform."HomeworkSubmissions"
                DROP CONSTRAINT "FK_HomeworkSubmissions_HomeworkAssignments_WorkspaceId_AssignmentId";
            ALTER TABLE platform."HomeworkSubmissions"
                ADD CONSTRAINT "FK_HomeworkSubmissions_AssignmentIdentity"
                FOREIGN KEY ("WorkspaceId", "AssignmentId", "MembershipId", "StudentId", "ProgramId")
                REFERENCES platform."HomeworkAssignments" ("WorkspaceId", "Id", "MembershipId", "StudentId", "ProgramId")
                ON DELETE RESTRICT;

            CREATE TABLE platform."HomeworkImportBatches" (
                "Id" uuid NOT NULL,
                "WorkspaceId" uuid NOT NULL,
                "Source" character varying(64) NOT NULL,
                "WorkbookDigest" character(64) NOT NULL,
                "ProgramMapDigest" character(64) NOT NULL,
                "Status" character varying(32) NOT NULL,
                "CatalogRowCount" integer NOT NULL,
                "AssignmentRowCount" integer NOT NULL,
                "SubmissionRowCount" integer NOT NULL,
                "CatalogCreatedCount" integer NOT NULL,
                "CatalogUnchangedCount" integer NOT NULL,
                "AssignmentCreatedCount" integer NOT NULL,
                "AssignmentUnchangedCount" integer NOT NULL,
                "SubmissionCreatedCount" integer NOT NULL,
                "SubmissionUnchangedCount" integer NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                "CompletedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_HomeworkImportBatches" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_HomeworkImportBatches_Workspaces_WorkspaceId"
                    FOREIGN KEY ("WorkspaceId") REFERENCES platform."Workspaces" ("Id") ON DELETE RESTRICT,
                CONSTRAINT "CK_HomeworkImportBatches_WorkbookDigest_Length" CHECK (length("WorkbookDigest") = 64),
                CONSTRAINT "CK_HomeworkImportBatches_ProgramMapDigest_Length" CHECK (length("ProgramMapDigest") = 64),
                CONSTRAINT "CK_HomeworkImportBatches_Status" CHECK ("Status" = 'applied'),
                CONSTRAINT "CK_HomeworkImportBatches_Counts" CHECK (
                    "CatalogRowCount" >= 0 AND "AssignmentRowCount" >= 0 AND "SubmissionRowCount" >= 0
                    AND "CatalogCreatedCount" >= 0 AND "CatalogUnchangedCount" >= 0
                    AND "CatalogCreatedCount" + "CatalogUnchangedCount" = "CatalogRowCount"
                    AND "AssignmentCreatedCount" >= 0 AND "AssignmentUnchangedCount" >= 0
                    AND "AssignmentCreatedCount" + "AssignmentUnchangedCount" = "AssignmentRowCount"
                    AND "SubmissionCreatedCount" >= 0 AND "SubmissionUnchangedCount" >= 0
                    AND "SubmissionCreatedCount" + "SubmissionUnchangedCount" = "SubmissionRowCount")
            );
            CREATE UNIQUE INDEX "IX_HomeworkImportBatches_Digests"
                ON platform."HomeworkImportBatches" ("WorkspaceId", "Source", "WorkbookDigest", "ProgramMapDigest");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TABLE platform."HomeworkImportBatches";

            ALTER TABLE platform."HomeworkSubmissions"
                DROP CONSTRAINT "FK_HomeworkSubmissions_AssignmentIdentity";
            ALTER TABLE platform."HomeworkSubmissions"
                ADD CONSTRAINT "FK_HomeworkSubmissions_HomeworkAssignments_WorkspaceId_AssignmentId"
                FOREIGN KEY ("WorkspaceId", "AssignmentId")
                REFERENCES platform."HomeworkAssignments" ("WorkspaceId", "Id") ON DELETE RESTRICT;

            ALTER TABLE platform."HomeworkAssignments"
                DROP CONSTRAINT "FK_HomeworkAssignments_CatalogIdentity";
            ALTER TABLE platform."HomeworkAssignments"
                ADD CONSTRAINT "FK_HomeworkAssignments_HomeworkCatalogItems_WorkspaceId_CatalogItemId"
                FOREIGN KEY ("WorkspaceId", "CatalogItemId")
                REFERENCES platform."HomeworkCatalogItems" ("WorkspaceId", "Id") ON DELETE RESTRICT;

            ALTER TABLE platform."HomeworkAssignments"
                DROP CONSTRAINT "FK_HomeworkAssignments_MembershipIdentity";
            ALTER TABLE platform."HomeworkAssignments"
                ADD CONSTRAINT "FK_HomeworkAssignments_WorkspaceStudentMemberships_WorkspaceId_MembershipId_StudentId"
                FOREIGN KEY ("WorkspaceId", "MembershipId", "StudentId")
                REFERENCES platform."WorkspaceStudentMemberships" ("WorkspaceId", "Id", "StudentId") ON DELETE RESTRICT;

            ALTER TABLE platform."HomeworkAssignments"
                DROP CONSTRAINT "AK_HomeworkAssignments_SubmissionIdentity";
            ALTER TABLE platform."HomeworkCatalogItems"
                DROP CONSTRAINT "AK_HomeworkCatalog_Identity";
            ALTER TABLE platform."WorkspaceStudentMemberships"
                DROP CONSTRAINT "AK_StudentMemberships_HomeworkIdentity";
            """);
    }
}
