using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261112180000_HistoricalTestResults")]
public sealed class HistoricalTestResults : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "HistoricalTestResults", schema: "platform",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                MembershipId = table.Column<Guid>(type: "uuid", nullable: false),
                StudentId = table.Column<Guid>(type: "uuid", nullable: false),
                ProgramId = table.Column<Guid>(type: "uuid", nullable: false),
                EventId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                TestId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                TestDate = table.Column<DateOnly>(type: "date", nullable: false),
                TopicId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                TopicName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                TaskNumber = table.Column<int>(type: "integer", nullable: false),
                CorrectCount = table.Column<int>(type: "integer", nullable: true),
                TotalCount = table.Column<int>(type: "integer", nullable: true),
                ScorePercent = table.Column<int>(type: "integer", nullable: false),
                StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                FinishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                DurationSeconds = table.Column<int>(type: "integer", nullable: false),
                ServerSubmittedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                SchemaVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_HistoricalTestResults", x => x.Id);
                table.ForeignKey("FK_HistoricalTestResults_WorkspaceStudentMemberships_Identity",
                    x => new { x.WorkspaceId, x.MembershipId, x.StudentId },
                    principalSchema: "platform", principalTable: "WorkspaceStudentMemberships",
                    principalColumns: new[] { "WorkspaceId", "Id", "StudentId" },
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_HistoricalTestResults_Programs_WorkspaceId_ProgramId",
                    x => new { x.WorkspaceId, x.ProgramId },
                    principalSchema: "platform", principalTable: "Programs",
                    principalColumns: new[] { "WorkspaceId", "Id" },
                    onDelete: ReferentialAction.Restrict);
                table.CheckConstraint("CK_HistoricalTestResults_Required",
                    "length(\"EventId\") > 0 AND length(\"TestId\") > 0 AND length(\"TopicId\") > 0 AND length(\"TopicName\") > 0 AND length(\"SchemaVersion\") > 0");
                table.CheckConstraint("CK_HistoricalTestResults_Score",
                    "\"TaskNumber\" BETWEEN 1 AND 1000 AND \"ScorePercent\" BETWEEN 0 AND 100 AND \"DurationSeconds\" BETWEEN 0 AND 86400 AND (\"CorrectCount\" IS NULL OR \"CorrectCount\" >= 0) AND (\"TotalCount\" IS NULL OR \"TotalCount\" > 0) AND (\"CorrectCount\" IS NULL OR \"TotalCount\" IS NULL OR \"CorrectCount\" <= \"TotalCount\")");
            });
        migrationBuilder.CreateIndex(
            name: "IX_HistoricalTestResults_WorkspaceId_EventId", schema: "platform", table: "HistoricalTestResults",
            columns: new[] { "WorkspaceId", "EventId" }, unique: true);
        migrationBuilder.CreateIndex(
            name: "IX_HistoricalTestResults_WorkspaceId_MembershipId_TestId_TestDate", schema: "platform", table: "HistoricalTestResults",
            columns: new[] { "WorkspaceId", "MembershipId", "TestId", "TestDate" });
        migrationBuilder.CreateIndex(
            name: "IX_HistoricalTestResults_WorkspaceId_MembershipId_StudentId", schema: "platform", table: "HistoricalTestResults",
            columns: new[] { "WorkspaceId", "MembershipId", "StudentId" });
        migrationBuilder.CreateIndex(
            name: "IX_HistoricalTestResults_WorkspaceId_ProgramId", schema: "platform", table: "HistoricalTestResults",
            columns: new[] { "WorkspaceId", "ProgramId" });
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable(name: "HistoricalTestResults", schema: "platform");
}
