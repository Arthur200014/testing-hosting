using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261006193000_HomeworkTenantForeignKeys")]
public sealed class HomeworkTenantForeignKeys : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE platform."HomeworkAssignments"
                ADD CONSTRAINT "AK_HomeworkAssignments_WorkspaceId_Id" UNIQUE ("WorkspaceId", "Id");

            ALTER TABLE platform."HomeworkAssignments"
                DROP CONSTRAINT "FK_HomeworkAssignments_HomeworkCatalogItems_CatalogItemId";
            ALTER TABLE platform."HomeworkAssignments"
                ADD CONSTRAINT "FK_HomeworkAssignments_HomeworkCatalogItems_WorkspaceId_CatalogItemId"
                FOREIGN KEY ("WorkspaceId", "CatalogItemId")
                REFERENCES platform."HomeworkCatalogItems" ("WorkspaceId", "Id") ON DELETE RESTRICT;

            ALTER TABLE platform."HomeworkSubmissions"
                DROP CONSTRAINT "FK_HomeworkSubmissions_HomeworkAssignments_AssignmentId";
            ALTER TABLE platform."HomeworkSubmissions"
                ADD CONSTRAINT "FK_HomeworkSubmissions_HomeworkAssignments_WorkspaceId_AssignmentId"
                FOREIGN KEY ("WorkspaceId", "AssignmentId")
                REFERENCES platform."HomeworkAssignments" ("WorkspaceId", "Id") ON DELETE RESTRICT;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE platform."HomeworkSubmissions"
                DROP CONSTRAINT "FK_HomeworkSubmissions_HomeworkAssignments_WorkspaceId_AssignmentId";
            ALTER TABLE platform."HomeworkSubmissions"
                ADD CONSTRAINT "FK_HomeworkSubmissions_HomeworkAssignments_AssignmentId"
                FOREIGN KEY ("AssignmentId") REFERENCES platform."HomeworkAssignments" ("Id") ON DELETE RESTRICT;

            ALTER TABLE platform."HomeworkAssignments"
                DROP CONSTRAINT "FK_HomeworkAssignments_HomeworkCatalogItems_WorkspaceId_CatalogItemId";
            ALTER TABLE platform."HomeworkAssignments"
                ADD CONSTRAINT "FK_HomeworkAssignments_HomeworkCatalogItems_CatalogItemId"
                FOREIGN KEY ("CatalogItemId") REFERENCES platform."HomeworkCatalogItems" ("Id") ON DELETE RESTRICT;

            ALTER TABLE platform."HomeworkAssignments"
                DROP CONSTRAINT "AK_HomeworkAssignments_WorkspaceId_Id";
            """);
    }
}
