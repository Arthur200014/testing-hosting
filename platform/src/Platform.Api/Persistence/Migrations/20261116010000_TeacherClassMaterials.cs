using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingHosting.Platform.Persistence;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261116010000_TeacherClassMaterials")]
public sealed class TeacherClassMaterials : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.CreateTable(name: "TeacherMaterials", schema: "platform",
            columns: t => new
            {
                Id = t.Column<Guid>(type: "uuid", nullable: false),
                WorkspaceId = t.Column<Guid>(type: "uuid", nullable: false),
                Title = t.Column<string>(type: "character varying(250)", maxLength: 250, nullable: false),
                Url = t.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                CreatedAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: t =>
            {
                t.PrimaryKey("PK_TeacherMaterials", x => x.Id);
                t.UniqueConstraint("AK_TeacherMaterials_WorkspaceId_Id", x => new { x.WorkspaceId, x.Id });
                t.ForeignKey("FK_TeacherMaterials_Workspaces_WorkspaceId", x => x.WorkspaceId,
                    "Workspaces", "Id", principalSchema: "platform", onDelete: ReferentialAction.Restrict);
            });
        m.CreateTable(name: "TeacherClassMaterialLinks", schema: "platform",
            columns: t => new
            {
                Id = t.Column<Guid>(type: "uuid", nullable: false),
                WorkspaceId = t.Column<Guid>(type: "uuid", nullable: false),
                RequestId = t.Column<Guid>(type: "uuid", nullable: false),
                MaterialId = t.Column<Guid>(type: "uuid", nullable: false),
                IndividualClassId = t.Column<Guid>(type: "uuid", nullable: true),
                GroupClassId = t.Column<Guid>(type: "uuid", nullable: true),
                CreatedAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: t =>
            {
                t.PrimaryKey("PK_TeacherClassMaterialLinks", x => x.Id);
                t.ForeignKey("FK_TeacherClassMaterialLinks_TeacherMaterials_WorkspaceId_MaterialId",
                    x => new { x.WorkspaceId, x.MaterialId }, "TeacherMaterials",
                    new[] { "WorkspaceId", "Id" }, principalSchema: "platform", onDelete: ReferentialAction.Restrict);
                t.ForeignKey("FK_TeacherClassMaterialLinks_TeacherClasses_WorkspaceId_IndividualClassId",
                    x => new { x.WorkspaceId, x.IndividualClassId }, "TeacherClasses",
                    new[] { "WorkspaceId", "Id" }, principalSchema: "platform", onDelete: ReferentialAction.Restrict);
                t.ForeignKey("FK_TeacherClassMaterialLinks_TeacherGroupClasses_WorkspaceId_GroupClassId",
                    x => new { x.WorkspaceId, x.GroupClassId }, "TeacherGroupClasses",
                    new[] { "WorkspaceId", "Id" }, principalSchema: "platform", onDelete: ReferentialAction.Restrict);
                t.CheckConstraint("CK_TeacherClassMaterialLinks_ExactlyOneClass",
                    "(\"IndividualClassId\" IS NOT NULL) <> (\"GroupClassId\" IS NOT NULL)");
            });
        m.CreateIndex("IX_TeacherMaterials_WorkspaceId_CreatedAt", "TeacherMaterials",
            new[] { "WorkspaceId", "CreatedAt" }, schema: "platform");
        m.CreateIndex("IX_TeacherClassMaterialLinks_WorkspaceId_RequestId", "TeacherClassMaterialLinks",
            new[] { "WorkspaceId", "RequestId" }, schema: "platform", unique: true);
        m.CreateIndex("IX_TeacherClassMaterialLinks_WorkspaceId_MaterialId_IndividualClassId", "TeacherClassMaterialLinks",
            new[] { "WorkspaceId", "MaterialId", "IndividualClassId" }, schema: "platform", unique: true);
        m.CreateIndex("IX_TeacherClassMaterialLinks_WorkspaceId_MaterialId_GroupClassId", "TeacherClassMaterialLinks",
            new[] { "WorkspaceId", "MaterialId", "GroupClassId" }, schema: "platform", unique: true);
    }

    protected override void Down(MigrationBuilder m)
    {
        m.DropTable("TeacherClassMaterialLinks", "platform");
        m.DropTable("TeacherMaterials", "platform");
    }
}
