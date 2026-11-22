using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261122230000_StudentBrowserSessions")]
public sealed class StudentBrowserSessions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE platform."StudentBrowserSessions" (
            "Id" uuid PRIMARY KEY,
            "MembershipId" uuid NOT NULL REFERENCES platform."WorkspaceStudentMemberships" ("Id") ON DELETE CASCADE,
            "ExpiresAt" timestamptz NOT NULL,
            "RevokedAt" timestamptz
        );
        CREATE INDEX "IX_StudentBrowserSessions_MembershipId" ON platform."StudentBrowserSessions" ("MembershipId");
        """);
    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("""DROP TABLE platform."StudentBrowserSessions";""");
}
