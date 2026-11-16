using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261117010000_PupilFeedbackDrafts")]
public sealed class PupilFeedbackDrafts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE platform."PupilFeedbackDrafts" (
            "WorkspaceId" uuid NOT NULL, "MembershipId" uuid NOT NULL,
            "StudentId" uuid NOT NULL, "ProgramId" uuid NOT NULL,
            "Title" character varying(200) NOT NULL, "Body" character varying(20000) NOT NULL,
            "Snapshot" jsonb NOT NULL, "Revision" integer NOT NULL,
            "RequestId" uuid NOT NULL, "UpdatedAt" timestamp with time zone NOT NULL,
            CONSTRAINT "PK_PupilFeedbackDrafts" PRIMARY KEY ("WorkspaceId","MembershipId"),
            CONSTRAINT "FK_PupilFeedbackDrafts_Membership" FOREIGN KEY ("WorkspaceId","MembershipId","StudentId","ProgramId")
                REFERENCES platform."WorkspaceStudentMemberships" ("WorkspaceId","Id","StudentId","ProgramId") ON DELETE RESTRICT,
            CONSTRAINT "CK_PupilFeedbackDrafts_Content" CHECK (length("Title") BETWEEN 1 AND 200 AND length("Body") BETWEEN 1 AND 20000 AND "Revision">0)
        );
        """);
    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("""DROP TABLE platform."PupilFeedbackDrafts";""");
}
