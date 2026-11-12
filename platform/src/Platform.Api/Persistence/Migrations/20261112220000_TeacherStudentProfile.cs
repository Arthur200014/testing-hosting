using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261112220000_TeacherStudentProfile")]
public sealed class TeacherStudentProfile : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        Add(migrationBuilder, "Grade", 32);
        Add(migrationBuilder, "GroupId", 128);
        Add(migrationBuilder, "TargetScore", 32);
        Add(migrationBuilder, "TargetGrade", 32);
        Add(migrationBuilder, "InitialScore", 32);
        Add(migrationBuilder, "InitialPrimaryScore", 32);
        Add(migrationBuilder, "InitialGrade", 32);
        Add(migrationBuilder, "ParentName", 200);
        Add(migrationBuilder, "Notes", 4096);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        foreach (var name in new[] { "Grade", "GroupId", "TargetScore", "TargetGrade",
                     "InitialScore", "InitialPrimaryScore", "InitialGrade", "ParentName", "Notes" })
            migrationBuilder.DropColumn(name: name, schema: "platform", table: "WorkspaceStudentMemberships");
    }

    private static void Add(MigrationBuilder migrationBuilder, string name, int length) =>
        migrationBuilder.AddColumn<string>(name: name, schema: "platform",
            table: "WorkspaceStudentMemberships", type: $"character varying({length})",
            maxLength: length, nullable: true);
}
