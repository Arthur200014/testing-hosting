using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261118190000_TuitionLedger")]
public sealed class TuitionLedger : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE platform."TuitionInvoices" (
            "Id" uuid PRIMARY KEY,
            "WorkspaceId" uuid NOT NULL REFERENCES platform."Workspaces" ("Id"),
            "MembershipId" uuid NOT NULL REFERENCES platform."WorkspaceStudentMemberships" ("Id"),
            "RequestId" uuid NOT NULL,
            "Description" varchar(160) NOT NULL CHECK (length(trim("Description")) > 0),
            "Amount" numeric(14,2) NOT NULL CHECK ("Amount" > 0),
            "DueOn" date,
            "CreatedAt" timestamptz NOT NULL DEFAULT now(),
            "CancelledAt" timestamptz,
            UNIQUE ("WorkspaceId", "RequestId")
        );
        CREATE INDEX "IX_TuitionInvoices_Workspace_Created"
            ON platform."TuitionInvoices" ("WorkspaceId", "CreatedAt" DESC, "Id" DESC);

        CREATE TABLE platform."TuitionPayments" (
            "Id" uuid PRIMARY KEY,
            "InvoiceId" uuid NOT NULL REFERENCES platform."TuitionInvoices" ("Id"),
            "RequestId" uuid NOT NULL,
            "Amount" numeric(14,2) NOT NULL CHECK ("Amount" > 0),
            "ReceivedOn" date NOT NULL,
            "Note" varchar(200),
            "RecordedBy" uuid NOT NULL REFERENCES platform."TeacherUsers" ("Id"),
            "RecordedAt" timestamptz NOT NULL DEFAULT now(),
            UNIQUE ("InvoiceId", "RequestId")
        );
        """);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        DROP TABLE platform."TuitionPayments";
        DROP TABLE platform."TuitionInvoices";
        """);
}
