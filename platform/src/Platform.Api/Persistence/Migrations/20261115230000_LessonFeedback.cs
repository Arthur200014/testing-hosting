using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace TestingHosting.Platform.Persistence.Migrations;
[DbContext(typeof(PlatformDbContext))]
[Migration("20261115230000_LessonFeedback")]
public sealed class LessonFeedback : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.AddColumn<string>("Reaction", "LessonParticipants", "character varying(16)", schema: "platform", maxLength: 16, nullable: true);
        m.AddColumn<string>("Feedback", "LessonParticipants", "character varying(2000)", schema: "platform", maxLength: 2000, nullable: true);
    }
    protected override void Down(MigrationBuilder m)
    {
        m.DropColumn("Reaction", "LessonParticipants", "platform");
        m.DropColumn("Feedback", "LessonParticipants", "platform");
    }
}
