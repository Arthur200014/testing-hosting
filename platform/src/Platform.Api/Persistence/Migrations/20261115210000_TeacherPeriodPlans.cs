using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261115210000_TeacherPeriodPlans")]
public sealed class TeacherPeriodPlans : Migration
{
    protected override void Up(MigrationBuilder m) => m.Sql("""
        CREATE TABLE platform."TeacherPeriodPlans" (
            "WorkspaceId" uuid NOT NULL REFERENCES platform."Workspaces"("Id"),
            "Id" uuid NOT NULL,
            "RequestJson" text NOT NULL,
            "ResultJson" text NOT NULL,
            PRIMARY KEY ("WorkspaceId", "Id")
        );
        """);
    protected override void Down(MigrationBuilder m) => m.DropTable("TeacherPeriodPlans", "platform");
}
