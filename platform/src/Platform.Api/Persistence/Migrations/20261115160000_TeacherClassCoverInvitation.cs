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
        m.AddColumn<string>(name: "CoverStyle", schema: "platform", table: "TeacherClasses",
            type: "character varying(16)", maxLength: 16, nullable: false, defaultValue: "lavender");
        m.AddColumn<byte[]>(name: "InvitationCodeHash", schema: "platform", table: "TeacherClasses",
            type: "bytea", nullable: true);
        m.AddColumn<string>(name: "InvitationStatus", schema: "platform", table: "TeacherClasses",
            type: "character varying(16)", maxLength: 16, nullable: true);
        m.AddColumn<DateTimeOffset>(name: "InvitationIssuedAt", schema: "platform", table: "TeacherClasses",
            type: "timestamp with time zone", nullable: true);
        m.AddColumn<DateTimeOffset>(name: "InvitationExpiresAt", schema: "platform", table: "TeacherClasses",
            type: "timestamp with time zone", nullable: true);
        m.AddColumn<DateTimeOffset>(name: "InvitationAcceptedAt", schema: "platform", table: "TeacherClasses",
            type: "timestamp with time zone", nullable: true);
        m.AddCheckConstraint(name: "CK_TeacherClasses_Cover", schema: "platform", table: "TeacherClasses",
            sql: "\"CoverStyle\" IN ('lavender', 'sky', 'peach', 'mint')");
        m.AddCheckConstraint(name: "CK_TeacherClasses_Invitation", schema: "platform", table: "TeacherClasses",
            sql: "\"InvitationStatus\" IS NULL OR \"InvitationStatus\" IN ('pending', 'accepted', 'revoked')");
    }

    protected override void Down(MigrationBuilder m)
    {
        m.DropCheckConstraint(name: "CK_TeacherClasses_Invitation", schema: "platform", table: "TeacherClasses");
        m.DropCheckConstraint(name: "CK_TeacherClasses_Cover", schema: "platform", table: "TeacherClasses");
        m.DropColumn(name: "InvitationAcceptedAt", schema: "platform", table: "TeacherClasses");
        m.DropColumn(name: "InvitationExpiresAt", schema: "platform", table: "TeacherClasses");
        m.DropColumn(name: "InvitationIssuedAt", schema: "platform", table: "TeacherClasses");
        m.DropColumn(name: "InvitationStatus", schema: "platform", table: "TeacherClasses");
        m.DropColumn(name: "InvitationCodeHash", schema: "platform", table: "TeacherClasses");
        m.DropColumn(name: "CoverStyle", schema: "platform", table: "TeacherClasses");
    }
}
