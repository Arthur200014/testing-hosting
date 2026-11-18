using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261118150000_IndependentBoardSharing")]
public sealed class IndependentBoardSharing : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE platform."IndependentBoardGrants" (
            "BoardId" uuid NOT NULL REFERENCES platform."IndependentBoards" ("Id"),
            "MembershipId" uuid NOT NULL,
            "GrantId" uuid NOT NULL,
            PRIMARY KEY ("BoardId", "MembershipId")
        );
        CREATE INDEX "IX_IndependentBoardGrants_Membership" ON platform."IndependentBoardGrants" ("MembershipId", "BoardId");
        """);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("""DROP TABLE platform."IndependentBoardGrants";""");
}
