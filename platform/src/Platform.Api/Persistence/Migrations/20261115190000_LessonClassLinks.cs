using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261115190000_LessonClassLinks")]
public sealed class LessonClassLinks : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.AddColumn<Guid>(name: "IndividualClassId", schema: "platform", table: "Lessons",
            type: "uuid", nullable: true);
        m.AddColumn<Guid>(name: "GroupClassId", schema: "platform", table: "Lessons",
            type: "uuid", nullable: true);
        m.AddColumn<string>(name: "Title", schema: "platform", table: "Lessons",
            type: "character varying(50)", maxLength: 50, nullable: true);
        m.AddColumn<string>(name: "Description", schema: "platform", table: "Lessons",
            type: "character varying(1000)", maxLength: 1000, nullable: true);
        m.AddCheckConstraint(name: "CK_Lessons_ClassLink", schema: "platform", table: "Lessons",
            sql: "\"IndividualClassId\" IS NULL OR \"GroupClassId\" IS NULL");
        m.CreateIndex(name: "IX_Lessons_WorkspaceId_IndividualClassId",
            schema: "platform", table: "Lessons", columns: new[] { "WorkspaceId", "IndividualClassId" });
        m.CreateIndex(name: "IX_Lessons_WorkspaceId_GroupClassId",
            schema: "platform", table: "Lessons", columns: new[] { "WorkspaceId", "GroupClassId" });
        m.AddForeignKey(name: "FK_Lessons_TeacherClasses_WorkspaceId_IndividualClassId",
            schema: "platform", table: "Lessons", columns: new[] { "WorkspaceId", "IndividualClassId" },
            principalSchema: "platform", principalTable: "TeacherClasses",
            principalColumns: new[] { "WorkspaceId", "Id" }, onDelete: ReferentialAction.Restrict);
        m.AddForeignKey(name: "FK_Lessons_TeacherGroupClasses_WorkspaceId_GroupClassId",
            schema: "platform", table: "Lessons", columns: new[] { "WorkspaceId", "GroupClassId" },
            principalSchema: "platform", principalTable: "TeacherGroupClasses",
            principalColumns: new[] { "WorkspaceId", "Id" }, onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder m)
    {
        m.DropForeignKey(name: "FK_Lessons_TeacherClasses_WorkspaceId_IndividualClassId",
            schema: "platform", table: "Lessons");
        m.DropForeignKey(name: "FK_Lessons_TeacherGroupClasses_WorkspaceId_GroupClassId",
            schema: "platform", table: "Lessons");
        m.DropIndex(name: "IX_Lessons_WorkspaceId_IndividualClassId", schema: "platform", table: "Lessons");
        m.DropIndex(name: "IX_Lessons_WorkspaceId_GroupClassId", schema: "platform", table: "Lessons");
        m.DropCheckConstraint(name: "CK_Lessons_ClassLink", schema: "platform", table: "Lessons");
        m.DropColumn(name: "IndividualClassId", schema: "platform", table: "Lessons");
        m.DropColumn(name: "GroupClassId", schema: "platform", table: "Lessons");
        m.DropColumn(name: "Title", schema: "platform", table: "Lessons");
        m.DropColumn(name: "Description", schema: "platform", table: "Lessons");
    }
}
