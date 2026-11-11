using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261112103000_LessonsAndSubscriptionSnapshots")]
public sealed class LessonsAndSubscriptionSnapshots : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Lessons", schema: "platform",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                LegacyLessonId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                LessonAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Lessons", x => x.Id);
                table.UniqueConstraint("AK_Lessons_WorkspaceId_Id", x => new { x.WorkspaceId, x.Id });
                table.ForeignKey("FK_Lessons_Workspaces_WorkspaceId", x => x.WorkspaceId,
                    principalSchema: "platform", principalTable: "Workspaces", principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
                table.CheckConstraint("CK_Lessons_LegacyId", "length(\"LegacyLessonId\") > 0");
            });
        migrationBuilder.CreateIndex(
            name: "IX_Lessons_WorkspaceId_LegacyLessonId", schema: "platform", table: "Lessons",
            columns: new[] { "WorkspaceId", "LegacyLessonId" }, unique: true);

        migrationBuilder.CreateTable(
            name: "LessonParticipants", schema: "platform",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                LessonId = table.Column<Guid>(type: "uuid", nullable: false),
                MembershipId = table.Column<Guid>(type: "uuid", nullable: false),
                StudentId = table.Column<Guid>(type: "uuid", nullable: false),
                ProgramId = table.Column<Guid>(type: "uuid", nullable: false),
                DurationMinutes = table.Column<int>(type: "integer", nullable: false),
                TaskNumbers = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                TopicComment = table.Column<string>(type: "character varying(4096)", maxLength: 4096, nullable: true),
                AttendanceStatus = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_LessonParticipants", x => x.Id);
                table.ForeignKey("FK_LessonParticipants_Lessons_WorkspaceId_LessonId",
                    x => new { x.WorkspaceId, x.LessonId },
                    principalSchema: "platform", principalTable: "Lessons",
                    principalColumns: new[] { "WorkspaceId", "Id" }, onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_LessonParticipants_WorkspaceStudentMemberships_Identity",
                    x => new { x.WorkspaceId, x.MembershipId, x.StudentId, x.ProgramId },
                    principalSchema: "platform", principalTable: "WorkspaceStudentMemberships",
                    principalColumns: new[] { "WorkspaceId", "Id", "StudentId", "ProgramId" },
                    onDelete: ReferentialAction.Restrict);
                table.CheckConstraint("CK_LessonParticipants_Duration", "\"DurationMinutes\" BETWEEN 1 AND 1440");
                table.CheckConstraint("CK_LessonParticipants_Attendance", "length(\"AttendanceStatus\") > 0");
            });
        migrationBuilder.CreateIndex(
            name: "IX_LessonParticipants_WorkspaceId_LessonId_StudentId",
            schema: "platform", table: "LessonParticipants",
            columns: new[] { "WorkspaceId", "LessonId", "StudentId" }, unique: true);
        migrationBuilder.CreateIndex(
            name: "IX_LessonParticipants_WorkspaceId_MembershipId_StudentId_ProgramId",
            schema: "platform", table: "LessonParticipants",
            columns: new[] { "WorkspaceId", "MembershipId", "StudentId", "ProgramId" });

        migrationBuilder.CreateTable(
            name: "SubscriptionSnapshots", schema: "platform",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                MembershipId = table.Column<Guid>(type: "uuid", nullable: false),
                StudentId = table.Column<Guid>(type: "uuid", nullable: false),
                ProgramId = table.Column<Guid>(type: "uuid", nullable: false),
                PackageSize = table.Column<int>(type: "integer", nullable: false),
                ResetAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                LessonPrice = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                BaseLessonCount = table.Column<int>(type: "integer", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_SubscriptionSnapshots", x => x.Id);
                table.ForeignKey("FK_SubscriptionSnapshots_WorkspaceStudentMemberships_Identity",
                    x => new { x.WorkspaceId, x.MembershipId, x.StudentId, x.ProgramId },
                    principalSchema: "platform", principalTable: "WorkspaceStudentMemberships",
                    principalColumns: new[] { "WorkspaceId", "Id", "StudentId", "ProgramId" },
                    onDelete: ReferentialAction.Restrict);
                table.CheckConstraint("CK_SubscriptionSnapshots_Package", "\"PackageSize\" BETWEEN 1 AND 1000");
                table.CheckConstraint("CK_SubscriptionSnapshots_PriceCount",
                    "(\"LessonPrice\" IS NULL OR \"LessonPrice\" >= 0) AND (\"BaseLessonCount\" IS NULL OR \"BaseLessonCount\" >= 0)");
            });
        migrationBuilder.CreateIndex(
            name: "IX_SubscriptionSnapshots_MembershipIdentity",
            schema: "platform", table: "SubscriptionSnapshots",
            columns: new[] { "WorkspaceId", "MembershipId", "StudentId", "ProgramId" });
        migrationBuilder.CreateIndex(
            name: "IX_SubscriptionSnapshots_WorkspaceId_MembershipId",
            schema: "platform", table: "SubscriptionSnapshots",
            columns: new[] { "WorkspaceId", "MembershipId" }, unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "LessonParticipants", schema: "platform");
        migrationBuilder.DropTable(name: "SubscriptionSnapshots", schema: "platform");
        migrationBuilder.DropTable(name: "Lessons", schema: "platform");
    }
}
