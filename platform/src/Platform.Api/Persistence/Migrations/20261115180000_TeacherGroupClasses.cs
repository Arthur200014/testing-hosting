using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261115180000_TeacherGroupClasses")]
public sealed class TeacherGroupClasses : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.CreateTable(name: "TeacherGroupClasses", schema: "platform",
            columns: t => new
            {
                Id = t.Column<Guid>(type: "uuid", nullable: false),
                WorkspaceId = t.Column<Guid>(type: "uuid", nullable: false),
                RequestId = t.Column<Guid>(type: "uuid", nullable: false),
                Title = t.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                Description = t.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                CoverStyle = t.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false, defaultValue: "lavender"),
                Capacity = t.Column<int>(type: "integer", nullable: false, defaultValue: 20),
                AutoApproveInvites = t.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                DurationMinutes = t.Column<int>(type: "integer", nullable: true),
                PriceAmount = t.Column<decimal>(type: "numeric(12,2)", nullable: true),
                PriceCurrency = t.Column<string>(type: "character varying(3)", maxLength: 3, nullable: true),
                PriceBasis = t.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                AllowLessonChat = t.Column<bool>(type: "boolean", nullable: false),
                AllowPrivateMessages = t.Column<bool>(type: "boolean", nullable: false),
                IsArchived = t.Column<bool>(type: "boolean", nullable: false),
                Revision = t.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                CreatedAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                InvitationCodeHash = t.Column<byte[]>(type: "bytea", nullable: true),
                InvitationExpiresAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                InvitationStatus = t.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true)
            },
            constraints: t =>
            {
                t.PrimaryKey("PK_TeacherGroupClasses", x => x.Id);
                t.UniqueConstraint("AK_TeacherGroupClasses_WorkspaceId_Id", x => new { x.WorkspaceId, x.Id });
                t.ForeignKey(name: "FK_TeacherGroupClasses_Workspaces_WorkspaceId",
                    column: x => x.WorkspaceId, principalTable: "Workspaces", principalColumn: "Id",
                    principalSchema: "platform", onDelete: ReferentialAction.Restrict);
                t.CheckConstraint("CK_TeacherGroupClasses_Capacity", "\"Capacity\" BETWEEN 1 AND 20");
                t.CheckConstraint("CK_TeacherGroupClasses_Title", "length(\"Title\") > 0");
                t.CheckConstraint("CK_TeacherGroupClasses_Cover", "\"CoverStyle\" IN ('lavender','sky','peach','mint')");
                t.CheckConstraint("CK_TeacherGroupClasses_Duration", "\"DurationMinutes\" IS NULL OR (\"DurationMinutes\" BETWEEN 15 AND 240 AND \"DurationMinutes\" % 5 = 0)");
                t.CheckConstraint("CK_TeacherGroupClasses_Price", "(\"PriceAmount\" IS NULL AND \"PriceCurrency\" IS NULL AND \"PriceBasis\" IS NULL) OR (\"PriceAmount\" BETWEEN 0 AND 10000000 AND \"PriceCurrency\" IN ('RUB','EUR','USD') AND \"PriceBasis\" IN ('lesson','month'))");
                t.CheckConstraint("CK_TeacherGroupClasses_Invite", "\"InvitationStatus\" IS NULL OR \"InvitationStatus\" IN ('pending','revoked')");
            });
        m.CreateIndex(name: "IX_TeacherGroupClasses_WorkspaceId_RequestId", table: "TeacherGroupClasses",
            schema: "platform", columns: new[] { "WorkspaceId", "RequestId" }, unique: true);
        m.CreateTable(name: "TeacherGroupEnrollments", schema: "platform",
            columns: t => new
            {
                Id = t.Column<Guid>(type: "uuid", nullable: false),
                WorkspaceId = t.Column<Guid>(type: "uuid", nullable: false),
                GroupClassId = t.Column<Guid>(type: "uuid", nullable: false),
                MembershipId = t.Column<Guid>(type: "uuid", nullable: false),
                StudentId = t.Column<Guid>(type: "uuid", nullable: false),
                IsApproved = t.Column<bool>(type: "boolean", nullable: false),
                JoinedAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: t =>
            {
                t.PrimaryKey("PK_TeacherGroupEnrollments", x => x.Id);
                t.ForeignKey(name: "FK_TeacherGroupEnrollments_GroupClass",
                    columns: x => new { x.WorkspaceId, x.GroupClassId },
                    principalTable: "TeacherGroupClasses", principalSchema: "platform",
                    principalColumns: new[] { "WorkspaceId", "Id" }, onDelete: ReferentialAction.Cascade);
                t.ForeignKey(name: "FK_TeacherGroupEnrollments_Membership",
                    columns: x => new { x.WorkspaceId, x.MembershipId, x.StudentId },
                    principalTable: "WorkspaceStudentMemberships", principalSchema: "platform",
                    principalColumns: new[] { "WorkspaceId", "Id", "StudentId" },
                    onDelete: ReferentialAction.Restrict);
            });
        m.CreateIndex(name: "IX_TeacherGroupEnrollments_WorkspaceId_GroupClassId_MembershipId",
            table: "TeacherGroupEnrollments", schema: "platform",
            columns: new[] { "WorkspaceId", "GroupClassId", "MembershipId" }, unique: true);
        m.CreateIndex(name: "IX_TeacherGroupEnrollments_WorkspaceId_MembershipId_StudentId",
            table: "TeacherGroupEnrollments", schema: "platform", columns: new[] { "WorkspaceId", "MembershipId", "StudentId" });
    }

    protected override void Down(MigrationBuilder m)
    {
        m.DropTable("TeacherGroupEnrollments", "platform");
        m.DropTable("TeacherGroupClasses", "platform");
    }
}
