using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261115140000_TeacherClassSettings")]
public sealed class TeacherClassSettings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "DurationMinutes", schema: "platform", table: "TeacherClasses",
            type: "integer", nullable: true);
        migrationBuilder.AddColumn<decimal>(
            name: "PriceAmount", schema: "platform", table: "TeacherClasses",
            type: "numeric(12,2)", precision: 12, scale: 2, nullable: true);
        migrationBuilder.AddColumn<string>(
            name: "PriceCurrency", schema: "platform", table: "TeacherClasses",
            type: "character varying(3)", maxLength: 3, nullable: true);
        migrationBuilder.AddColumn<string>(
            name: "PriceBasis", schema: "platform", table: "TeacherClasses",
            type: "character varying(16)", maxLength: 16, nullable: true);
        migrationBuilder.AddColumn<bool>(
            name: "AllowLessonChat", schema: "platform", table: "TeacherClasses",
            type: "boolean", nullable: false, defaultValue: false);
        migrationBuilder.AddColumn<bool>(
            name: "AllowPrivateMessages", schema: "platform", table: "TeacherClasses",
            type: "boolean", nullable: false, defaultValue: false);

        migrationBuilder.AddCheckConstraint(
            name: "CK_TeacherClasses_Duration", schema: "platform", table: "TeacherClasses",
            sql: "\"DurationMinutes\" IS NULL OR (\"DurationMinutes\" BETWEEN 15 AND 240 AND \"DurationMinutes\" % 5 = 0)");
        migrationBuilder.AddCheckConstraint(
            name: "CK_TeacherClasses_Price", schema: "platform", table: "TeacherClasses",
            sql: "(\"PriceAmount\" IS NULL AND \"PriceCurrency\" IS NULL AND \"PriceBasis\" IS NULL) OR " +
                "(\"PriceAmount\" BETWEEN 0 AND 10000000 AND \"PriceCurrency\" IN ('RUB', 'EUR', 'USD') " +
                "AND \"PriceBasis\" IN ('lesson', 'month'))");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(name: "CK_TeacherClasses_Price", schema: "platform", table: "TeacherClasses");
        migrationBuilder.DropCheckConstraint(name: "CK_TeacherClasses_Duration", schema: "platform", table: "TeacherClasses");
        migrationBuilder.DropColumn(name: "AllowPrivateMessages", schema: "platform", table: "TeacherClasses");
        migrationBuilder.DropColumn(name: "AllowLessonChat", schema: "platform", table: "TeacherClasses");
        migrationBuilder.DropColumn(name: "PriceBasis", schema: "platform", table: "TeacherClasses");
        migrationBuilder.DropColumn(name: "PriceCurrency", schema: "platform", table: "TeacherClasses");
        migrationBuilder.DropColumn(name: "PriceAmount", schema: "platform", table: "TeacherClasses");
        migrationBuilder.DropColumn(name: "DurationMinutes", schema: "platform", table: "TeacherClasses");
    }
}
