using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TestAttemptMonthInvariant : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_TestAttempts_MoscowMonthKey",
                schema: "platform",
                table: "TestAttempts");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TestAttempts_MoscowMonthKey",
                schema: "platform",
                table: "TestAttempts",
                sql: "\"MoscowMonthKey\" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND \"MoscowMonthKey\" = (lpad(extract(year from (\"CompletedAt\" AT TIME ZONE 'Europe/Moscow'))::integer::text, 4, '0') || '-' || lpad(extract(month from (\"CompletedAt\" AT TIME ZONE 'Europe/Moscow'))::integer::text, 2, '0'))");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_TestAttempts_MoscowMonthKey",
                schema: "platform",
                table: "TestAttempts");

            migrationBuilder.AddCheckConstraint(
                name: "CK_TestAttempts_MoscowMonthKey",
                schema: "platform",
                table: "TestAttempts",
                sql: "\"MoscowMonthKey\" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'");
        }
    }
}
