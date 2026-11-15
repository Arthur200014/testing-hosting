using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace TestingHosting.Platform.Persistence.Migrations;
[DbContext(typeof(PlatformDbContext))]
[Migration("20261115220000_LessonCompletion")]
public sealed class LessonCompletion : Migration
{
    protected override void Up(MigrationBuilder m) => m.AddColumn<DateTimeOffset>(
        name: "CompletedAt", schema: "platform", table: "Lessons", type: "timestamp with time zone", nullable: true);
    protected override void Down(MigrationBuilder m) => m.DropColumn("CompletedAt", "Lessons", "platform");
}
