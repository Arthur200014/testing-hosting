using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261118160000_IndependentBoardGrantRoles")]
public sealed class IndependentBoardGrantRoles : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        ALTER TABLE platform."IndependentBoardGrants"
            ADD COLUMN "Role" text NOT NULL DEFAULT 'editor',
            ADD CONSTRAINT "CK_IndependentBoardGrants_Role" CHECK ("Role" IN ('editor', 'viewer'));
        """);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        ALTER TABLE platform."IndependentBoardGrants" DROP COLUMN "Role";
        """);
}
