using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
namespace TestingHosting.Platform.Persistence.Migrations;
[DbContext(typeof(PlatformDbContext))]
[Migration("20261116090000_NativeHomeworkContexts")]
public sealed class NativeHomeworkContexts : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        foreach (var column in new[] { "IndividualClassId", "LessonId" })
        {
            m.AddColumn<Guid>(column, "NativeHomeworkAssignments", type: "uuid", schema: "platform", nullable: true);
            m.CreateIndex("IX_NativeHomeworkAssignments_WorkspaceId_" + column, "NativeHomeworkAssignments",
                new[] { "WorkspaceId", column }, schema: "platform");
        }
        m.AddForeignKey("FK_NativeAssignments_Class", "NativeHomeworkAssignments", new[] { "WorkspaceId", "IndividualClassId" },
            "TeacherClasses", principalColumns: new[] { "WorkspaceId", "Id" }, schema: "platform", principalSchema: "platform", onDelete: ReferentialAction.Restrict);
        m.AddForeignKey("FK_NativeAssignments_Lesson", "NativeHomeworkAssignments", new[] { "WorkspaceId", "LessonId" },
            "Lessons", principalColumns: new[] { "WorkspaceId", "Id" }, schema: "platform", principalSchema: "platform", onDelete: ReferentialAction.Restrict);
        m.AddCheckConstraint("CK_NativeAssignments_ClassContext", "NativeHomeworkAssignments",
            "\"GroupClassId\" IS NULL OR \"IndividualClassId\" IS NULL", "platform");
    }
    protected override void Down(MigrationBuilder m)
    {
        m.DropCheckConstraint("CK_NativeAssignments_ClassContext", "NativeHomeworkAssignments", "platform");
        m.DropForeignKey("FK_NativeAssignments_Class", "NativeHomeworkAssignments", "platform");
        m.DropForeignKey("FK_NativeAssignments_Lesson", "NativeHomeworkAssignments", "platform");
        foreach (var column in new[] { "IndividualClassId", "LessonId" })
        {
            m.DropIndex("IX_NativeHomeworkAssignments_WorkspaceId_" + column, "NativeHomeworkAssignments", "platform");
            m.DropColumn(column, "NativeHomeworkAssignments", "platform");
        }
    }
}
