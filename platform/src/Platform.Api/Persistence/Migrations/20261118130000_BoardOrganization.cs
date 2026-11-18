using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261118130000_BoardOrganization")]
public sealed class BoardOrganization : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE platform."BoardFolders" (
            "WorkspaceId" uuid NOT NULL REFERENCES platform."Workspaces" ("Id"),
            "OwnerId" uuid NOT NULL REFERENCES platform."TeacherUsers" ("Id"),
            "Id" uuid NOT NULL,
            "Title" varchar(120) NOT NULL CHECK (length(trim("Title")) > 0),
            PRIMARY KEY ("WorkspaceId", "OwnerId", "Id")
        );
        ALTER TABLE platform."IndependentBoards"
            ADD COLUMN "FolderId" uuid,
            ADD COLUMN "IsFavorite" boolean NOT NULL DEFAULT false,
            ADD CONSTRAINT "FK_IndependentBoards_BoardFolders"
                FOREIGN KEY ("WorkspaceId", "OwnerId", "FolderId")
                REFERENCES platform."BoardFolders" ("WorkspaceId", "OwnerId", "Id");
        """);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        ALTER TABLE platform."IndependentBoards"
            DROP CONSTRAINT "FK_IndependentBoards_BoardFolders",
            DROP COLUMN "FolderId",
            DROP COLUMN "IsFavorite";
        DROP TABLE platform."BoardFolders";
        """);
}
