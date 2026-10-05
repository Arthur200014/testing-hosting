using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TestAttempts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddUniqueConstraint(
                name: "AK_WorkspaceStudentMemberships_WorkspaceId_Id_StudentId",
                schema: "platform",
                table: "WorkspaceStudentMemberships",
                columns: new[] { "WorkspaceId", "Id", "StudentId" });

            migrationBuilder.CreateTable(
                name: "TestAttempts",
                schema: "platform",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    MembershipId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProgramId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    TestId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Topic = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    TaskNumber = table.Column<int>(type: "integer", nullable: false),
                    Correct = table.Column<int>(type: "integer", nullable: false),
                    Total = table.Column<int>(type: "integer", nullable: false),
                    Percent = table.Column<int>(type: "integer", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DurationSeconds = table.Column<int>(type: "integer", nullable: false),
                    SchemaVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    MoscowMonthKey = table.Column<string>(type: "character(7)", fixedLength: true, maxLength: 7, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TestAttempts", x => x.Id);
                    table.CheckConstraint("CK_TestAttempts_CountsAndPercent", "\"TaskNumber\" BETWEEN 1 AND 1000 AND \"Total\" BETWEEN 1 AND 10000 AND \"Correct\" BETWEEN 0 AND \"Total\" AND \"Percent\" = (\"Correct\" * 100 / \"Total\")");
                    table.CheckConstraint("CK_TestAttempts_MoscowMonthKey", "\"MoscowMonthKey\" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'");
                    table.CheckConstraint("CK_TestAttempts_RequiredStrings", "length(\"EventId\") > 0 AND length(\"TestId\") > 0 AND length(\"Topic\") > 0 AND length(\"SchemaVersion\") > 0");
                    table.CheckConstraint("CK_TestAttempts_TimestampsAndDuration", "\"CompletedAt\" >= \"StartedAt\" AND \"DurationSeconds\" BETWEEN 0 AND 86400 AND \"CompletedAt\" - \"StartedAt\" <= interval '1 day' AND \"DurationSeconds\" = round(extract(epoch from (\"CompletedAt\" - \"StartedAt\")))::integer");
                    table.ForeignKey(
                        name: "FK_TestAttempts_Programs_WorkspaceId_ProgramId",
                        columns: x => new { x.WorkspaceId, x.ProgramId },
                        principalSchema: "platform",
                        principalTable: "Programs",
                        principalColumns: new[] { "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TestAttempts_WorkspaceStudentMemberships_WorkspaceId_Member~",
                        columns: x => new { x.WorkspaceId, x.MembershipId, x.StudentId },
                        principalSchema: "platform",
                        principalTable: "WorkspaceStudentMemberships",
                        principalColumns: new[] { "WorkspaceId", "Id", "StudentId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TestAttempts_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "platform",
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TestAttempts_MonthlyBest",
                schema: "platform",
                table: "TestAttempts",
                columns: new[] { "WorkspaceId", "MembershipId", "TestId", "MoscowMonthKey", "Percent", "DurationSeconds", "CompletedAt", "Id" },
                descending: new[] { false, false, false, false, true, false, false, false });

            migrationBuilder.CreateIndex(
                name: "IX_TestAttempts_WorkspaceId_EventId",
                schema: "platform",
                table: "TestAttempts",
                columns: new[] { "WorkspaceId", "EventId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TestAttempts_WorkspaceId_MembershipId_StudentId",
                schema: "platform",
                table: "TestAttempts",
                columns: new[] { "WorkspaceId", "MembershipId", "StudentId" });

            migrationBuilder.CreateIndex(
                name: "IX_TestAttempts_WorkspaceId_ProgramId",
                schema: "platform",
                table: "TestAttempts",
                columns: new[] { "WorkspaceId", "ProgramId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TestAttempts",
                schema: "platform");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_WorkspaceStudentMemberships_WorkspaceId_Id_StudentId",
                schema: "platform",
                table: "WorkspaceStudentMemberships");
        }
    }
}
