using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261115160000_TeacherClassCoverInvitation")]
public sealed class TeacherClassCoverInvitation : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.AddColumn<string>("CoverStyle", "platform", "TeacherClasses", type: "character varying(16)", maxLength: 16,
            nullable: false, defaultValue: "lavender");
        m.AddColumn<byte[]>("InvitationCodeHash", "platform", "TeacherClasses", type: "bytea", nullable: true);
        m.AddColumn<string>("InvitationStatus", "platform", "TeacherClasses", type: "character varying(16)", maxLength: 16, nullable: true);
        m.AddColumn<DateTimeOffset>("InvitationIssuedAt", "platform", "TeacherClasses", type: "timestamp with time zone", nullable: true);
        m.AddColumn<DateTimeOffset>("InvitationExpiresAt", "platform", "TeacherClasses", type: "timestamp with time zone", nullable: true);
        m.AddColumn<DateTimeOffset>("InvitationAcceptedAt", "platform", "TeacherClasses", type: "timestamp with time zone", nullable: true);
        m.AddCheckConstraint("CK_TeacherClasses_Cover", "platform", "TeacherClasses",
            "\"CoverStyle\" IN ('lavender', 'sky', 'peach', 'mint')");
        m.AddCheckConstraint("CK_TeacherClasses_Invitation", "platform", "TeacherClasses",
            "\"InvitationStatus\" IS NULL OR \"InvitationStatus\" IN ('pending', 'accepted', 'revoked')");
    }

    protected override void Down(MigrationBuilder m)
    {
        m.DropCheckConstraint("CK_TeacherClasses_Invitation", "platform", "TeacherClasses");
        m.DropCheckConstraint("CK_TeacherClasses_Cover", "platform", "TeacherClasses");
        m.DropColumn("InvitationAcceptedAt", "platform", "TeacherClasses");
        m.DropColumn("InvitationExpiresAt", "platform", "TeacherClasses");
        m.DropColumn("InvitationIssuedAt", "platform", "TeacherClasses");
        m.DropColumn("InvitationStatus", "platform", "TeacherClasses");
        m.DropColumn("InvitationCodeHash", "platform", "TeacherClasses");
        m.DropColumn("CoverStyle", "platform", "TeacherClasses");
    }
}
