using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261111120000_TeacherSessions")]
public sealed class TeacherSessions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "PasswordHash", schema: "platform", table: "TeacherUsers",
            type: "text", nullable: true);

        migrationBuilder.CreateTable(
            name: "TeacherSessions", schema: "platform",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                MembershipId = table.Column<Guid>(type: "uuid", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                RevokedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_TeacherSessions", x => x.Id);
                table.ForeignKey(
                    name: "FK_TeacherSessions_WorkspaceMemberships_MembershipId",
                    column: x => x.MembershipId, principalSchema: "platform",
                    principalTable: "WorkspaceMemberships", principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_TeacherSessions_MembershipId", schema: "platform",
            table: "TeacherSessions", column: "MembershipId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "TeacherSessions", schema: "platform");
        migrationBuilder.DropColumn(name: "PasswordHash", schema: "platform", table: "TeacherUsers");
    }
}
