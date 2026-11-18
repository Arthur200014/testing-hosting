using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261118180000_TeacherProfiles")]
public sealed class TeacherProfiles : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE platform."TeacherProfiles" (
            "TeacherUserId" uuid PRIMARY KEY REFERENCES platform."TeacherUsers" ("Id"),
            "DisplayName" varchar(120) NOT NULL CHECK (length(trim("DisplayName")) > 0)
        );
        """);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("""DROP TABLE platform."TeacherProfiles";""");
}
