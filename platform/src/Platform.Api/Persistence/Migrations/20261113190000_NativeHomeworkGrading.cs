using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261113190000_NativeHomeworkGrading")]
public sealed class NativeHomeworkGrading : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE platform."NativeHomeworkAssignments"
              ADD COLUMN "GradeRequestId" uuid,
              ADD COLUMN "GradedAt" timestamp with time zone,
              ADD COLUMN "TeacherFeedback" character varying(2000);
            ALTER TABLE platform."NativeHomeworkAssignments"
              ADD CONSTRAINT "CK_NativeHomeworkAssignments_Grade" CHECK (
                ("ScorePercent" IS NULL AND "GradeRequestId" IS NULL AND "GradedAt" IS NULL AND "TeacherFeedback" IS NULL)
                OR ("ScorePercent" BETWEEN 0 AND 100 AND "GradeRequestId" IS NOT NULL AND "GradedAt" IS NOT NULL AND "SubmittedAt" IS NOT NULL)
              );
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE platform."NativeHomeworkAssignments"
              DROP CONSTRAINT "CK_NativeHomeworkAssignments_Grade",
              DROP COLUMN "GradeRequestId",
              DROP COLUMN "GradedAt",
              DROP COLUMN "TeacherFeedback";
            """);
    }
}
