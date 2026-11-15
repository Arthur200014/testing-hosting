using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261115200000_TeacherScheduleRules")]
public sealed class TeacherScheduleRules : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.CreateTable(name: "TeacherScheduleRules", schema: "platform",
            columns: t => new
            {
                Id = t.Column<Guid>(type: "uuid", nullable: false),
                WorkspaceId = t.Column<Guid>(type: "uuid", nullable: false),
                RequestId = t.Column<Guid>(type: "uuid", nullable: false),
                IndividualClassId = t.Column<Guid>(type: "uuid", nullable: true),
                GroupClassId = t.Column<Guid>(type: "uuid", nullable: true),
                DaysMask = t.Column<int>(type: "integer", nullable: false),
                StartMinute = t.Column<int>(type: "integer", nullable: false),
                DurationMinutes = t.Column<int>(type: "integer", nullable: false),
                TimeZoneId = t.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                IsActive = t.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                Revision = t.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                CreatedAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: t =>
            {
                t.PrimaryKey("PK_TeacherScheduleRules", x => x.Id);
                t.ForeignKey("FK_ScheduleRules_Workspaces",
                    x => x.WorkspaceId, "Workspaces", "Id", principalSchema: "platform",
                    onDelete: ReferentialAction.Restrict);
                t.ForeignKey("FK_ScheduleRules_IndividualClass",
                    x => new { x.WorkspaceId, x.IndividualClassId }, "TeacherClasses",
                    new[] { "WorkspaceId", "Id" }, principalSchema: "platform",
                    onDelete: ReferentialAction.Restrict);
                t.ForeignKey("FK_ScheduleRules_GroupClass",
                    x => new { x.WorkspaceId, x.GroupClassId }, "TeacherGroupClasses",
                    new[] { "WorkspaceId", "Id" }, principalSchema: "platform",
                    onDelete: ReferentialAction.Restrict);
                t.CheckConstraint("CK_ScheduleRules_ExactlyOneClass",
                    "(\"IndividualClassId\" IS NOT NULL) <> (\"GroupClassId\" IS NOT NULL)");
                t.CheckConstraint("CK_ScheduleRules_Days", "\"DaysMask\" BETWEEN 1 AND 127");
                t.CheckConstraint("CK_ScheduleRules_Time",
                    "\"StartMinute\" BETWEEN 0 AND 1439 AND \"StartMinute\" % 5 = 0 AND " +
                    "\"DurationMinutes\" BETWEEN 15 AND 240 AND \"DurationMinutes\" % 5 = 0 AND " +
                    "\"StartMinute\" + \"DurationMinutes\" <= 1440");
            });
        m.CreateIndex("IX_ScheduleRules_Workspace_Request", "TeacherScheduleRules",
            new[] { "WorkspaceId", "RequestId" }, schema: "platform", unique: true);
        m.CreateIndex("IX_ScheduleRules_Individual", "TeacherScheduleRules",
            new[] { "WorkspaceId", "IndividualClassId" }, schema: "platform");
        m.CreateIndex("IX_ScheduleRules_Group", "TeacherScheduleRules",
            new[] { "WorkspaceId", "GroupClassId" }, schema: "platform");
    }

    protected override void Down(MigrationBuilder m) =>
        m.DropTable("TeacherScheduleRules", "platform");
}
