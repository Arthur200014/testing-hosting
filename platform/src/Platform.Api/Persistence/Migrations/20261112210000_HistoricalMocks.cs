using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261112210000_HistoricalMocks")]
public sealed class HistoricalMocks : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(name: "HistoricalMockResults", schema: "platform", columns: t => new
        {
            Id = t.Column<Guid>(type: "uuid", nullable: false),
            WorkspaceId = t.Column<Guid>(type: "uuid", nullable: false),
            MembershipId = t.Column<Guid>(type: "uuid", nullable: false),
            StudentId = t.Column<Guid>(type: "uuid", nullable: false),
            ProgramId = t.Column<Guid>(type: "uuid", nullable: false),
            EventId = t.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
            MockId = t.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
            MockDate = t.Column<DateOnly>(type: "date", nullable: false),
            VariantName = t.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
            Score = t.Column<int>(type: "integer", nullable: true),
            PrimaryScore = t.Column<int>(type: "integer", nullable: false),
            DurationSeconds = t.Column<int>(type: "integer", nullable: false),
            ServerSubmittedAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
            SchemaVersion = t.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
            GradeMark = t.Column<int>(type: "integer", nullable: true),
            MaxPrimaryScore = t.Column<int>(type: "integer", nullable: false),
            ScorePercent = t.Column<int>(type: "integer", nullable: false)
        }, constraints: t =>
        {
            t.PrimaryKey("PK_HistoricalMockResults", x => x.Id);
            t.ForeignKey("FK_MockResults_Membership", x => new { x.WorkspaceId, x.MembershipId, x.StudentId },
                principalSchema: "platform", principalTable: "WorkspaceStudentMemberships",
                principalColumns: new[] { "WorkspaceId", "Id", "StudentId" }, onDelete: ReferentialAction.Restrict);
            t.ForeignKey("FK_MockResults_Program", x => new { x.WorkspaceId, x.ProgramId },
                principalSchema: "platform", principalTable: "Programs",
                principalColumns: new[] { "WorkspaceId", "Id" }, onDelete: ReferentialAction.Restrict);
            t.CheckConstraint("CK_HistoricalMockResults_Scores", "(\"Score\" IS NULL OR \"Score\" BETWEEN 0 AND 100) AND \"PrimaryScore\" >= 0 AND \"MaxPrimaryScore\" > 0 AND \"ScorePercent\" BETWEEN 0 AND 100 AND \"DurationSeconds\" BETWEEN 0 AND 86400");
        });
        migrationBuilder.CreateIndex(name: "IX_MockResults_Event", schema: "platform", table: "HistoricalMockResults", columns: new[] { "WorkspaceId", "EventId" }, unique: true);
        migrationBuilder.CreateIndex(name: "IX_MockResults_StudentDate", schema: "platform", table: "HistoricalMockResults", columns: new[] { "WorkspaceId", "MembershipId", "MockDate" });
        migrationBuilder.CreateIndex(name: "IX_MockResults_Membership", schema: "platform", table: "HistoricalMockResults", columns: new[] { "WorkspaceId", "MembershipId", "StudentId" });
        migrationBuilder.CreateIndex(name: "IX_MockResults_Program", schema: "platform", table: "HistoricalMockResults", columns: new[] { "WorkspaceId", "ProgramId" });

        migrationBuilder.CreateTable(name: "HistoricalMockTaskResults", schema: "platform", columns: t => new
        {
            Id = t.Column<Guid>(type: "uuid", nullable: false),
            WorkspaceId = t.Column<Guid>(type: "uuid", nullable: false),
            MembershipId = t.Column<Guid>(type: "uuid", nullable: false),
            StudentId = t.Column<Guid>(type: "uuid", nullable: false),
            ProgramId = t.Column<Guid>(type: "uuid", nullable: false),
            EventId = t.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
            MockId = t.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
            MockDate = t.Column<DateOnly>(type: "date", nullable: false),
            TaskNumber = t.Column<int>(type: "integer", nullable: false),
            TopicId = t.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
            TopicName = t.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
            IsCorrect = t.Column<bool>(type: "boolean", nullable: false),
            Answered = t.Column<bool>(type: "boolean", nullable: false),
            ServerSubmittedAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
            SchemaVersion = t.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
            EarnedPoints = t.Column<int>(type: "integer", nullable: true),
            MaxPoints = t.Column<int>(type: "integer", nullable: true)
        }, constraints: t =>
        {
            t.PrimaryKey("PK_HistoricalMockTaskResults", x => x.Id);
            t.ForeignKey("FK_MockTasks_Membership", x => new { x.WorkspaceId, x.MembershipId, x.StudentId },
                principalSchema: "platform", principalTable: "WorkspaceStudentMemberships",
                principalColumns: new[] { "WorkspaceId", "Id", "StudentId" }, onDelete: ReferentialAction.Restrict);
            t.ForeignKey("FK_MockTasks_Program", x => new { x.WorkspaceId, x.ProgramId },
                principalSchema: "platform", principalTable: "Programs",
                principalColumns: new[] { "WorkspaceId", "Id" }, onDelete: ReferentialAction.Restrict);
            t.CheckConstraint("CK_HistoricalMockTaskResults_Points", "\"TaskNumber\" BETWEEN 1 AND 1000 AND (\"EarnedPoints\" IS NULL OR \"EarnedPoints\" >= 0) AND (\"MaxPoints\" IS NULL OR \"MaxPoints\" > 0) AND (\"EarnedPoints\" IS NULL OR \"MaxPoints\" IS NULL OR \"EarnedPoints\" <= \"MaxPoints\")");
        });
        migrationBuilder.CreateIndex(name: "IX_MockTasks_EventTask", schema: "platform", table: "HistoricalMockTaskResults", columns: new[] { "WorkspaceId", "EventId", "TaskNumber" }, unique: true);
        migrationBuilder.CreateIndex(name: "IX_MockTasks_Membership", schema: "platform", table: "HistoricalMockTaskResults", columns: new[] { "WorkspaceId", "MembershipId", "StudentId" });
        migrationBuilder.CreateIndex(name: "IX_MockTasks_Program", schema: "platform", table: "HistoricalMockTaskResults", columns: new[] { "WorkspaceId", "ProgramId" });

        migrationBuilder.CreateTable(name: "HistoricalMockSessions", schema: "platform", columns: t => new
        {
            Id = t.Column<Guid>(type: "uuid", nullable: false),
            WorkspaceId = t.Column<Guid>(type: "uuid", nullable: false),
            MembershipId = t.Column<Guid>(type: "uuid", nullable: false),
            StudentId = t.Column<Guid>(type: "uuid", nullable: false),
            ProgramId = t.Column<Guid>(type: "uuid", nullable: false),
            SessionId = t.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
            MockId = t.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
            StartedAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
            DeadlineAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
            AnswersJson = t.Column<string>(type: "text", nullable: false),
            Status = t.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
            SubmittedAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
            PrimaryScore = t.Column<int>(type: "integer", nullable: true),
            TestScore = t.Column<int>(type: "integer", nullable: true),
            DurationSeconds = t.Column<int>(type: "integer", nullable: true),
            EventId = t.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
            SchemaVersion = t.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
            MockConfigJson = t.Column<string>(type: "text", nullable: false),
            GradeMark = t.Column<int>(type: "integer", nullable: true),
            MaxPrimaryScore = t.Column<int>(type: "integer", nullable: true),
            ScorePercent = t.Column<int>(type: "integer", nullable: true)
        }, constraints: t =>
        {
            t.PrimaryKey("PK_HistoricalMockSessions", x => x.Id);
            t.ForeignKey("FK_MockSessions_Membership", x => new { x.WorkspaceId, x.MembershipId, x.StudentId },
                principalSchema: "platform", principalTable: "WorkspaceStudentMemberships",
                principalColumns: new[] { "WorkspaceId", "Id", "StudentId" }, onDelete: ReferentialAction.Restrict);
            t.ForeignKey("FK_MockSessions_Program", x => new { x.WorkspaceId, x.ProgramId },
                principalSchema: "platform", principalTable: "Programs",
                principalColumns: new[] { "WorkspaceId", "Id" }, onDelete: ReferentialAction.Restrict);
            t.CheckConstraint("CK_HistoricalMockSessions_Values", "\"DeadlineAt\" >= \"StartedAt\" AND (\"DurationSeconds\" IS NULL OR \"DurationSeconds\" BETWEEN 0 AND 86400) AND (\"ScorePercent\" IS NULL OR \"ScorePercent\" BETWEEN 0 AND 100)");
        });
        migrationBuilder.CreateIndex(name: "IX_MockSessions_Session", schema: "platform", table: "HistoricalMockSessions", columns: new[] { "WorkspaceId", "SessionId" }, unique: true);
        migrationBuilder.CreateIndex(name: "IX_MockSessions_Membership", schema: "platform", table: "HistoricalMockSessions", columns: new[] { "WorkspaceId", "MembershipId", "StudentId" });
        migrationBuilder.CreateIndex(name: "IX_MockSessions_Program", schema: "platform", table: "HistoricalMockSessions", columns: new[] { "WorkspaceId", "ProgramId" });

        migrationBuilder.CreateTable(name: "HistoricalMockVariants", schema: "platform", columns: t => new
        {
            Id = t.Column<Guid>(type: "uuid", nullable: false),
            WorkspaceId = t.Column<Guid>(type: "uuid", nullable: false),
            ProgramId = t.Column<Guid>(type: "uuid", nullable: false),
            MockId = t.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
            VariantName = t.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
            DurationSeconds = t.Column<int>(type: "integer", nullable: false),
            TaskCount = t.Column<int>(type: "integer", nullable: false),
            ConfigJson = t.Column<string>(type: "text", nullable: false),
            CreatedAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
            SchemaVersion = t.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false)
        }, constraints: t =>
        {
            t.PrimaryKey("PK_HistoricalMockVariants", x => x.Id);
            t.ForeignKey("FK_MockVariants_Program", x => new { x.WorkspaceId, x.ProgramId },
                principalSchema: "platform", principalTable: "Programs",
                principalColumns: new[] { "WorkspaceId", "Id" }, onDelete: ReferentialAction.Restrict);
            t.CheckConstraint("CK_HistoricalMockVariants_Values", "\"DurationSeconds\" BETWEEN 1 AND 86400 AND \"TaskCount\" BETWEEN 1 AND 1000");
        });
        migrationBuilder.CreateIndex(name: "IX_MockVariants_NaturalKey", schema: "platform", table: "HistoricalMockVariants",
            columns: new[] { "WorkspaceId", "ProgramId", "MockId", "VariantName" }, unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "HistoricalMockTaskResults", schema: "platform");
        migrationBuilder.DropTable(name: "HistoricalMockResults", schema: "platform");
        migrationBuilder.DropTable(name: "HistoricalMockSessions", schema: "platform");
        migrationBuilder.DropTable(name: "HistoricalMockVariants", schema: "platform");
    }
}
