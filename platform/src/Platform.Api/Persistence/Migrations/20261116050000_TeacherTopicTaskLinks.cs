using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingHosting.Platform.Persistence;

#nullable disable
namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261116050000_TeacherTopicTaskLinks")]
public sealed class TeacherTopicTaskLinks : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.CreateTable(name: "TeacherTopicTaskLinks", schema: "platform", columns: t => new {
            Id = t.Column<Guid>(type: "uuid", nullable: false),
            WorkspaceId = t.Column<Guid>(type: "uuid", nullable: false),
            RequestId = t.Column<Guid>(type: "uuid", nullable: false),
            TopicId = t.Column<Guid>(type: "uuid", nullable: false),
            TaskId = t.Column<Guid>(type: "uuid", nullable: false),
            ProgramId = t.Column<Guid>(type: "uuid", nullable: false),
            CreatedAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
        }, constraints: t => {
            t.PrimaryKey("PK_TeacherTopicTaskLinks", x => x.Id);
            t.ForeignKey("FK_TopicTasks_Topic", x => new { x.WorkspaceId, x.TopicId },
                "TeacherClassTopics", new[] { "WorkspaceId", "Id" }, principalSchema: "platform",
                onDelete: ReferentialAction.Restrict);
            t.ForeignKey("FK_TopicTasks_Task", x => new { x.WorkspaceId, x.TaskId, x.ProgramId },
                "NativeHomeworkTasks", new[] { "WorkspaceId", "Id", "ProgramId" }, principalSchema: "platform",
                onDelete: ReferentialAction.Restrict);
        });
        m.CreateIndex("IX_TeacherTopicTaskLinks_WorkspaceId_RequestId", "TeacherTopicTaskLinks",
            new[] { "WorkspaceId", "RequestId" }, schema: "platform", unique: true);
        m.CreateIndex("IX_TeacherTopicTaskLinks_WorkspaceId_TopicId_TaskId", "TeacherTopicTaskLinks",
            new[] { "WorkspaceId", "TopicId", "TaskId" }, schema: "platform", unique: true);
        m.CreateIndex("IX_TeacherTopicTaskLinks_WorkspaceId_TaskId_ProgramId", "TeacherTopicTaskLinks",
            new[] { "WorkspaceId", "TaskId", "ProgramId" }, schema: "platform");
    }
    protected override void Down(MigrationBuilder m) => m.DropTable("TeacherTopicTaskLinks", "platform");
}
