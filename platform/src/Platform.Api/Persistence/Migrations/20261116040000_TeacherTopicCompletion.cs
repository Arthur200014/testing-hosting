using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingHosting.Platform.Persistence;

#nullable disable
namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261116040000_TeacherTopicCompletion")]
public sealed class TeacherTopicCompletion : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.AddColumn<DateTimeOffset>(name: "CompletedAt", schema: "platform", table: "TeacherClassTopics",
            type: "timestamp with time zone", nullable: true);
        m.AddColumn<int>(name: "CompletionRevision", schema: "platform", table: "TeacherClassTopics",
            type: "integer", nullable: false, defaultValue: 0);
    }
    protected override void Down(MigrationBuilder m)
    {
        m.DropColumn(name: "CompletedAt", schema: "platform", table: "TeacherClassTopics");
        m.DropColumn(name: "CompletionRevision", schema: "platform", table: "TeacherClassTopics");
    }
}
