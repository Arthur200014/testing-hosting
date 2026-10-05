using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class StudentImportJournal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StudentImportBatches",
                schema: "platform",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Source = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    WorkbookDigest = table.Column<string>(type: "character(64)", fixedLength: true, maxLength: 64, nullable: false),
                    ProgramMapDigest = table.Column<string>(type: "character(64)", fixedLength: true, maxLength: 64, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    RowCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedStudentCount = table.Column<int>(type: "integer", nullable: false),
                    UnchangedStudentCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudentImportBatches", x => x.Id);
                    table.CheckConstraint("CK_StudentImportBatches_Counts", "\"RowCount\" >= 0 AND \"CreatedStudentCount\" >= 0 AND \"UnchangedStudentCount\" >= 0 AND \"CreatedStudentCount\" + \"UnchangedStudentCount\" = \"RowCount\"");
                    table.CheckConstraint("CK_StudentImportBatches_ProgramMapDigest_Length", "length(\"ProgramMapDigest\") = 64");
                    table.CheckConstraint("CK_StudentImportBatches_WorkbookDigest_Length", "length(\"WorkbookDigest\") = 64");
                    table.ForeignKey(
                        name: "FK_StudentImportBatches_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "platform",
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StudentImportBatches_WorkspaceId_Source_WorkbookDigest_Prog~",
                schema: "platform",
                table: "StudentImportBatches",
                columns: new[] { "WorkspaceId", "Source", "WorkbookDigest", "ProgramMapDigest" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StudentImportBatches",
                schema: "platform");
        }
    }
}
