using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261118210000_TeacherWorkspaceSettings")]
public sealed class TeacherWorkspaceSettings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE platform."TeacherWorkspaceSettings" (
            "MembershipId" uuid PRIMARY KEY REFERENCES platform."WorkspaceMemberships" ("Id") ON DELETE CASCADE,
            "LessonReminders" boolean NOT NULL DEFAULT false,
            "OverdueInvoiceReminders" boolean NOT NULL DEFAULT false,
            "PaymentRecipient" varchar(120),
            "PaymentBank" varchar(120),
            "PaymentUrl" varchar(500),
            CHECK (num_nonnulls("PaymentRecipient", "PaymentBank", "PaymentUrl") IN (0, 3))
        );
        """);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("""DROP TABLE platform."TeacherWorkspaceSettings";""");
}
