using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261118200000_WorkspaceTeacherInvitations")]
public sealed class WorkspaceTeacherInvitations : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE platform."WorkspaceTeacherInvitations" (
            "Id" uuid PRIMARY KEY,
            "WorkspaceId" uuid NOT NULL REFERENCES platform."Workspaces" ("Id"),
            "Email" varchar(320) NOT NULL,
            "NormalizedEmail" varchar(320) NOT NULL,
            "CodeHash" bytea NOT NULL UNIQUE CHECK (octet_length("CodeHash") = 32),
            "CreatedAt" timestamptz NOT NULL,
            "ExpiresAt" timestamptz NOT NULL,
            "UsedAt" timestamptz,
            "RevokedAt" timestamptz
        );
        CREATE INDEX "IX_WorkspaceTeacherInvitations_Workspace"
            ON platform."WorkspaceTeacherInvitations" ("WorkspaceId", "ExpiresAt");
        """);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("""DROP TABLE platform."WorkspaceTeacherInvitations";""");
}
