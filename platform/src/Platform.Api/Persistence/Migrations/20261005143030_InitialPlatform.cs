using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialPlatform : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "platform");

            migrationBuilder.CreateTable(
                name: "Students",
                schema: "platform",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Students", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TeacherUsers",
                schema: "platform",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    NormalizedEmail = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeacherUsers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Workspaces",
                schema: "platform",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Slug = table.Column<string>(type: "character varying(63)", maxLength: 63, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Workspaces", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Programs",
                schema: "platform",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Programs", x => x.Id);
                    table.UniqueConstraint("AK_Programs_WorkspaceId_Id", x => new { x.WorkspaceId, x.Id });
                    table.CheckConstraint("CK_Programs_Code_NotEmpty", "length(\"Code\") > 0");
                    table.ForeignKey(
                        name: "FK_Programs_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "platform",
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkspaceMemberships",
                schema: "platform",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    TeacherUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkspaceMemberships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkspaceMemberships_TeacherUsers_TeacherUserId",
                        column: x => x.TeacherUserId,
                        principalSchema: "platform",
                        principalTable: "TeacherUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WorkspaceMemberships_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "platform",
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkspaceStudentMemberships",
                schema: "platform",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProgramId = table.Column<Guid>(type: "uuid", nullable: false),
                    CodeHash = table.Column<byte[]>(type: "bytea", maxLength: 32, nullable: false),
                    ImportSource = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ImportExternalId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkspaceStudentMemberships", x => x.Id);
                    table.CheckConstraint("CK_WorkspaceStudentMemberships_CodeHash_Length", "octet_length(\"CodeHash\") = 32");
                    table.CheckConstraint("CK_WorkspaceStudentMemberships_ImportIdentity", "(\"ImportSource\" IS NULL) = (\"ImportExternalId\" IS NULL)");
                    table.ForeignKey(
                        name: "FK_WorkspaceStudentMemberships_Programs_WorkspaceId_ProgramId",
                        columns: x => new { x.WorkspaceId, x.ProgramId },
                        principalSchema: "platform",
                        principalTable: "Programs",
                        principalColumns: new[] { "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WorkspaceStudentMemberships_Students_StudentId",
                        column: x => x.StudentId,
                        principalSchema: "platform",
                        principalTable: "Students",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WorkspaceStudentMemberships_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "platform",
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Programs_WorkspaceId_Code",
                schema: "platform",
                table: "Programs",
                columns: new[] { "WorkspaceId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TeacherUsers_NormalizedEmail",
                schema: "platform",
                table: "TeacherUsers",
                column: "NormalizedEmail",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceMemberships_TeacherUserId",
                schema: "platform",
                table: "WorkspaceMemberships",
                column: "TeacherUserId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceMemberships_WorkspaceId_TeacherUserId",
                schema: "platform",
                table: "WorkspaceMemberships",
                columns: new[] { "WorkspaceId", "TeacherUserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Workspaces_Slug",
                schema: "platform",
                table: "Workspaces",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceStudentMemberships_StudentId",
                schema: "platform",
                table: "WorkspaceStudentMemberships",
                column: "StudentId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceStudentMemberships_WorkspaceId_CodeHash",
                schema: "platform",
                table: "WorkspaceStudentMemberships",
                columns: new[] { "WorkspaceId", "CodeHash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceStudentMemberships_WorkspaceId_ImportSource_Import~",
                schema: "platform",
                table: "WorkspaceStudentMemberships",
                columns: new[] { "WorkspaceId", "ImportSource", "ImportExternalId" },
                unique: true,
                filter: "\"ImportSource\" IS NOT NULL AND \"ImportExternalId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceStudentMemberships_WorkspaceId_ProgramId",
                schema: "platform",
                table: "WorkspaceStudentMemberships",
                columns: new[] { "WorkspaceId", "ProgramId" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceStudentMemberships_WorkspaceId_StudentId",
                schema: "platform",
                table: "WorkspaceStudentMemberships",
                columns: new[] { "WorkspaceId", "StudentId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WorkspaceMemberships",
                schema: "platform");

            migrationBuilder.DropTable(
                name: "WorkspaceStudentMemberships",
                schema: "platform");

            migrationBuilder.DropTable(
                name: "TeacherUsers",
                schema: "platform");

            migrationBuilder.DropTable(
                name: "Programs",
                schema: "platform");

            migrationBuilder.DropTable(
                name: "Students",
                schema: "platform");

            migrationBuilder.DropTable(
                name: "Workspaces",
                schema: "platform");
        }
    }
}
