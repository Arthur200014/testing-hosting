using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261118110000_IndependentBoards")]
public sealed class IndependentBoards : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE platform."IndependentBoards" (
            "Id" uuid PRIMARY KEY,
            "WorkspaceId" uuid NOT NULL REFERENCES platform."Workspaces" ("Id"),
            "OwnerId" uuid NOT NULL REFERENCES platform."TeacherUsers" ("Id"),
            "Title" varchar(120) NOT NULL CHECK (length(trim("Title")) > 0),
            "IndividualClassId" uuid,
            "GroupClassId" uuid,
            "LessonId" uuid,
            "UpdatedAt" timestamptz NOT NULL,
            CHECK ("IndividualClassId" IS NULL OR "GroupClassId" IS NULL)
        );
        CREATE INDEX "IX_IndependentBoards_Scope" ON platform."IndependentBoards" ("WorkspaceId", "OwnerId", "UpdatedAt" DESC);
        """);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("""DROP TABLE platform."IndependentBoards";""");
}
