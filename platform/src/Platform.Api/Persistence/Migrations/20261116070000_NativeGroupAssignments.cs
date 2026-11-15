using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingHosting.Platform.Persistence;

#nullable disable
namespace TestingHosting.Platform.Persistence.Migrations;
[DbContext(typeof(PlatformDbContext))]
[Migration("20261116070000_NativeGroupAssignments")]
public sealed class NativeGroupAssignments : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.AddColumn<Guid>("GroupClassId", "NativeHomeworkAssignments", type:"uuid", schema:"platform", nullable:true);
        m.CreateIndex("IX_NativeHomeworkAssignments_WorkspaceId_GroupClassId", "NativeHomeworkAssignments",
            new[]{"WorkspaceId","GroupClassId"}, schema:"platform");
        m.AddForeignKey("FK_NativeAssignments_Group", "NativeHomeworkAssignments",
            new[]{"WorkspaceId","GroupClassId"}, "TeacherGroupClasses", principalColumns:new[]{"WorkspaceId","Id"},
            schema:"platform", principalSchema:"platform", onDelete:ReferentialAction.Restrict);
    }
    protected override void Down(MigrationBuilder m)
    {
        m.DropForeignKey("FK_NativeAssignments_Group", "NativeHomeworkAssignments", "platform");
        m.DropIndex("IX_NativeHomeworkAssignments_WorkspaceId_GroupClassId", "NativeHomeworkAssignments", "platform");
        m.DropColumn("GroupClassId", "NativeHomeworkAssignments", "platform");
    }
}
