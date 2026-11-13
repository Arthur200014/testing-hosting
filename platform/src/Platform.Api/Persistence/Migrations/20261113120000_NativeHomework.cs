using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261113120000_NativeHomework")]
public sealed class NativeHomework : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE platform."NativeHomeworkTasks" (
              "Id" uuid NOT NULL PRIMARY KEY,
              "WorkspaceId" uuid NOT NULL,
              "ProgramId" uuid NOT NULL,
              "RequestId" uuid NOT NULL,
              "Title" character varying(200) NOT NULL,
              "Prompt" character varying(10000) NOT NULL,
              "CreatedAt" timestamp with time zone NOT NULL,
              CONSTRAINT "AK_NativeHomeworkTasks_WorkspaceId_Id_ProgramId" UNIQUE ("WorkspaceId", "Id", "ProgramId"),
              CONSTRAINT "FK_NativeHomeworkTasks_Programs_WorkspaceId_ProgramId" FOREIGN KEY ("WorkspaceId", "ProgramId") REFERENCES platform."Programs" ("WorkspaceId", "Id") ON DELETE RESTRICT,
              CONSTRAINT "CK_NativeHomeworkTasks_Content" CHECK (length("Title") > 0 AND length("Prompt") > 0)
            );
            CREATE UNIQUE INDEX "IX_NativeHomeworkTasks_WorkspaceId_RequestId" ON platform."NativeHomeworkTasks" ("WorkspaceId", "RequestId");
            CREATE INDEX "IX_NativeHomeworkTasks_WorkspaceId_ProgramId" ON platform."NativeHomeworkTasks" ("WorkspaceId", "ProgramId");
            CREATE TABLE platform."NativeHomeworkAssignments" (
              "Id" uuid NOT NULL PRIMARY KEY,
              "WorkspaceId" uuid NOT NULL,
              "TaskId" uuid NOT NULL,
              "ProgramId" uuid NOT NULL,
              "MembershipId" uuid NOT NULL,
              "StudentId" uuid NOT NULL,
              "RequestId" uuid NOT NULL,
              "AssignedAt" timestamp with time zone NOT NULL,
              "DeadlineAt" timestamp with time zone NOT NULL,
              "Answer" character varying(10000),
              "SubmissionId" uuid,
              "SubmittedAt" timestamp with time zone,
              "ScorePercent" integer,
              CONSTRAINT "FK_NativeHomeworkAssignments_NativeHomeworkTasks_WorkspaceId_TaskId_ProgramId" FOREIGN KEY ("WorkspaceId", "TaskId", "ProgramId") REFERENCES platform."NativeHomeworkTasks" ("WorkspaceId", "Id", "ProgramId") ON DELETE RESTRICT,
              CONSTRAINT "FK_NativeHomeworkAssignments_WorkspaceStudentMemberships_WorkspaceId_MembershipId_StudentId_ProgramId" FOREIGN KEY ("WorkspaceId", "MembershipId", "StudentId", "ProgramId") REFERENCES platform."WorkspaceStudentMemberships" ("WorkspaceId", "Id", "StudentId", "ProgramId") ON DELETE RESTRICT,
              CONSTRAINT "CK_NativeHomeworkAssignments_DeadlineAnswer" CHECK ("DeadlineAt" > "AssignedAt" AND (("Answer" IS NULL AND "SubmittedAt" IS NULL AND "SubmissionId" IS NULL) OR (length("Answer") > 0 AND "SubmittedAt" IS NOT NULL AND "SubmissionId" IS NOT NULL)))
            );
            CREATE UNIQUE INDEX "IX_NativeHomeworkAssignments_WorkspaceId_RequestId_MembershipId" ON platform."NativeHomeworkAssignments" ("WorkspaceId", "RequestId", "MembershipId");
            CREATE INDEX "IX_NativeHomeworkAssignments_WorkspaceId_MembershipId_AssignedAt" ON platform."NativeHomeworkAssignments" ("WorkspaceId", "MembershipId", "AssignedAt");
            CREATE INDEX "IX_NativeHomeworkAssignments_WorkspaceId_MembershipId_StudentId_ProgramId" ON platform."NativeHomeworkAssignments" ("WorkspaceId", "MembershipId", "StudentId", "ProgramId");
            CREATE INDEX "IX_NativeHomeworkAssignments_WorkspaceId_TaskId_ProgramId" ON platform."NativeHomeworkAssignments" ("WorkspaceId", "TaskId", "ProgramId");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "NativeHomeworkAssignments", schema: "platform");
        migrationBuilder.DropTable(name: "NativeHomeworkTasks", schema: "platform");
    }
}
