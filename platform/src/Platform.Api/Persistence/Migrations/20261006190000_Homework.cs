using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261006190000_Homework")]
public sealed class Homework : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE platform."HomeworkCatalogItems" (
                "Id" uuid NOT NULL,
                "WorkspaceId" uuid NOT NULL,
                "ProgramId" uuid NOT NULL,
                "HomeworkId" character varying(128) NOT NULL,
                "TaskNumber" integer NOT NULL,
                "Name" character varying(200) NOT NULL,
                "Url" character varying(2048) NOT NULL,
                "IsActive" boolean NOT NULL,
                "SortOrder" integer NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_HomeworkCatalogItems" PRIMARY KEY ("Id"),
                CONSTRAINT "AK_HomeworkCatalogItems_WorkspaceId_Id" UNIQUE ("WorkspaceId", "Id"),
                CONSTRAINT "FK_HomeworkCatalogItems_Programs_WorkspaceId_ProgramId" FOREIGN KEY ("WorkspaceId", "ProgramId") REFERENCES platform."Programs" ("WorkspaceId", "Id") ON DELETE RESTRICT,
                CONSTRAINT "FK_HomeworkCatalogItems_Workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES platform."Workspaces" ("Id") ON DELETE RESTRICT,
                CONSTRAINT "CK_HomeworkCatalog_RequiredStrings" CHECK (length("HomeworkId") > 0 AND length("Name") > 0 AND length("Url") > 0),
                CONSTRAINT "CK_HomeworkCatalog_TaskAndOrder" CHECK ("TaskNumber" BETWEEN 1 AND 1000 AND "SortOrder" >= 0)
            );
            CREATE UNIQUE INDEX "IX_HomeworkCatalogItems_WorkspaceId_ProgramId_HomeworkId" ON platform."HomeworkCatalogItems" ("WorkspaceId", "ProgramId", "HomeworkId");

            CREATE TABLE platform."HomeworkAssignments" (
                "Id" uuid NOT NULL,
                "WorkspaceId" uuid NOT NULL,
                "MembershipId" uuid NOT NULL,
                "StudentId" uuid NOT NULL,
                "ProgramId" uuid NOT NULL,
                "CatalogItemId" uuid NULL,
                "AssignmentRecordId" character varying(128) NOT NULL,
                "HomeworkId" character varying(128) NOT NULL,
                "TaskNumber" integer NOT NULL,
                "Name" character varying(200) NOT NULL,
                "Url" character varying(2048) NOT NULL,
                "AssignedAt" timestamp with time zone NOT NULL,
                "DeadlineAt" timestamp with time zone NOT NULL,
                "SubmittedAt" timestamp with time zone NULL,
                "Status" character varying(32) NOT NULL,
                "ScorePercent" integer NULL,
                "HomeworkEventId" character varying(128) NULL,
                "LegacyLessonId" character varying(128) NULL,
                "SchemaVersion" character varying(64) NOT NULL,
                CONSTRAINT "PK_HomeworkAssignments" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_HomeworkAssignments_HomeworkCatalogItems_CatalogItemId" FOREIGN KEY ("CatalogItemId") REFERENCES platform."HomeworkCatalogItems" ("Id") ON DELETE RESTRICT,
                CONSTRAINT "FK_HomeworkAssignments_Programs_WorkspaceId_ProgramId" FOREIGN KEY ("WorkspaceId", "ProgramId") REFERENCES platform."Programs" ("WorkspaceId", "Id") ON DELETE RESTRICT,
                CONSTRAINT "FK_HomeworkAssignments_WorkspaceStudentMemberships_WorkspaceId_MembershipId_StudentId" FOREIGN KEY ("WorkspaceId", "MembershipId", "StudentId") REFERENCES platform."WorkspaceStudentMemberships" ("WorkspaceId", "Id", "StudentId") ON DELETE RESTRICT,
                CONSTRAINT "FK_HomeworkAssignments_Workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES platform."Workspaces" ("Id") ON DELETE RESTRICT,
                CONSTRAINT "CK_HomeworkAssignments_RequiredStrings" CHECK (length("AssignmentRecordId") > 0 AND length("HomeworkId") > 0 AND length("Name") > 0 AND length("Url") > 0 AND length("Status") > 0 AND length("SchemaVersion") > 0),
                CONSTRAINT "CK_HomeworkAssignments_Deadline" CHECK ("DeadlineAt" > "AssignedAt"),
                CONSTRAINT "CK_HomeworkAssignments_TaskScore" CHECK ("TaskNumber" BETWEEN 1 AND 1000 AND ("ScorePercent" IS NULL OR "ScorePercent" BETWEEN 0 AND 100))
            );
            CREATE UNIQUE INDEX "IX_HomeworkAssignments_WorkspaceId_AssignmentRecordId" ON platform."HomeworkAssignments" ("WorkspaceId", "AssignmentRecordId");
            CREATE INDEX "IX_HomeworkAssignments_Current" ON platform."HomeworkAssignments" ("WorkspaceId", "MembershipId", "ProgramId", "HomeworkId", "AssignedAt" DESC);

            CREATE TABLE platform."HomeworkSubmissions" (
                "Id" uuid NOT NULL,
                "WorkspaceId" uuid NOT NULL,
                "AssignmentId" uuid NOT NULL,
                "MembershipId" uuid NOT NULL,
                "StudentId" uuid NOT NULL,
                "ProgramId" uuid NOT NULL,
                "EventId" character varying(128) NOT NULL,
                "ScorePercent" integer NOT NULL,
                "DurationSeconds" integer NOT NULL,
                "CompletedAt" timestamp with time zone NOT NULL,
                "IsLate" boolean NOT NULL,
                "SchemaVersion" character varying(64) NOT NULL,
                "CreatedAt" timestamp with time zone NOT NULL,
                CONSTRAINT "PK_HomeworkSubmissions" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_HomeworkSubmissions_HomeworkAssignments_AssignmentId" FOREIGN KEY ("AssignmentId") REFERENCES platform."HomeworkAssignments" ("Id") ON DELETE RESTRICT,
                CONSTRAINT "FK_HomeworkSubmissions_Programs_WorkspaceId_ProgramId" FOREIGN KEY ("WorkspaceId", "ProgramId") REFERENCES platform."Programs" ("WorkspaceId", "Id") ON DELETE RESTRICT,
                CONSTRAINT "FK_HomeworkSubmissions_WorkspaceStudentMemberships_WorkspaceId_MembershipId_StudentId" FOREIGN KEY ("WorkspaceId", "MembershipId", "StudentId") REFERENCES platform."WorkspaceStudentMemberships" ("WorkspaceId", "Id", "StudentId") ON DELETE RESTRICT,
                CONSTRAINT "FK_HomeworkSubmissions_Workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES platform."Workspaces" ("Id") ON DELETE RESTRICT,
                CONSTRAINT "CK_HomeworkSubmissions_RequiredStrings" CHECK (length("EventId") > 0 AND length("SchemaVersion") > 0),
                CONSTRAINT "CK_HomeworkSubmissions_ScoreDuration" CHECK ("ScorePercent" BETWEEN 0 AND 100 AND "DurationSeconds" BETWEEN 0 AND 86400)
            );
            CREATE UNIQUE INDEX "IX_HomeworkSubmissions_WorkspaceId_EventId" ON platform."HomeworkSubmissions" ("WorkspaceId", "EventId");
            CREATE INDEX "IX_HomeworkSubmissions_WorkspaceId_AssignmentId_CompletedAt" ON platform."HomeworkSubmissions" ("WorkspaceId", "AssignmentId", "CompletedAt");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TABLE IF EXISTS platform."HomeworkSubmissions";
            DROP TABLE IF EXISTS platform."HomeworkAssignments";
            DROP TABLE IF EXISTS platform."HomeworkCatalogItems";
            """);
    }
}
