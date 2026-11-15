using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingHosting.Platform.Persistence;

#nullable disable
namespace TestingHosting.Platform.Persistence.Migrations;
[DbContext(typeof(PlatformDbContext))]
[Migration("20261116060000_TeacherLessonTopics")]
public sealed class TeacherLessonTopics : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.AddColumn<int>("TopicRevision", "Lessons", type: "integer", schema: "platform", nullable: false, defaultValue: 0);
        m.CreateTable(name: "TeacherLessonTopicLinks", schema: "platform", columns: t => new {
            WorkspaceId = t.Column<Guid>(type: "uuid", nullable: false),
            LessonId = t.Column<Guid>(type: "uuid", nullable: false),
            TopicId = t.Column<Guid>(type: "uuid", nullable: false),
            CreatedAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
        }, constraints: t => {
            t.PrimaryKey("PK_TeacherLessonTopicLinks", x => new { x.WorkspaceId, x.LessonId, x.TopicId });
            t.ForeignKey("FK_LessonTopics_Lesson", x => new { x.WorkspaceId, x.LessonId },
                "Lessons", new[] { "WorkspaceId", "Id" }, principalSchema: "platform", onDelete: ReferentialAction.Restrict);
            t.ForeignKey("FK_LessonTopics_Topic", x => new { x.WorkspaceId, x.TopicId },
                "TeacherClassTopics", new[] { "WorkspaceId", "Id" }, principalSchema: "platform", onDelete: ReferentialAction.Restrict);
        });
        m.CreateIndex("IX_TeacherLessonTopicLinks_WorkspaceId_TopicId", "TeacherLessonTopicLinks",
            new[] { "WorkspaceId", "TopicId" }, schema: "platform");
    }
    protected override void Down(MigrationBuilder m)
    {
        m.DropTable("TeacherLessonTopicLinks", "platform");
        m.DropColumn("TopicRevision", "Lessons", "platform");
    }
}
