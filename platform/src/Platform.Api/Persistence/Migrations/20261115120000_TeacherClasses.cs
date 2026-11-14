using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261115120000_TeacherClasses")]
public sealed class TeacherClasses : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "TeacherClasses",
            schema: "platform",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                StudentMembershipId = table.Column<Guid>(type: "uuid", nullable: false),
                Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                IsArchived = table.Column<bool>(type: "boolean", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_TeacherClasses", x => x.Id);
                table.UniqueConstraint("AK_TeacherClasses_WorkspaceId_Id", x => new { x.WorkspaceId, x.Id });
                table.CheckConstraint("CK_TeacherClasses_Kind", "\"Kind\" = 'individual'");
                table.CheckConstraint("CK_TeacherClasses_Title_NotEmpty", "length(\"Title\") > 0");
                table.ForeignKey(
                    name: "FK_TeacherClasses_WorkspaceStudentMemberships_WorkspaceId_StudentMembershipId",
                    columns: x => new { x.WorkspaceId, x.StudentMembershipId },
                    principalSchema: "platform",
                    principalTable: "WorkspaceStudentMemberships",
                    principalColumns: new[] { "WorkspaceId", "Id" },
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_TeacherClasses_Workspaces_WorkspaceId",
                    column: x => x.WorkspaceId,
                    principalSchema: "platform",
                    principalTable: "Workspaces",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_TeacherClasses_WorkspaceId_RequestId",
            schema: "platform",
            table: "TeacherClasses",
            columns: new[] { "WorkspaceId", "RequestId" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_TeacherClasses_WorkspaceId_StudentMembershipId",
            schema: "platform",
            table: "TeacherClasses",
            columns: new[] { "WorkspaceId", "StudentMembershipId" });
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable(name: "TeacherClasses", schema: "platform");
}
