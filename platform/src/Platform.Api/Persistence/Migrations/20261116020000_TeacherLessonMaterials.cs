using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingHosting.Platform.Persistence;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261116020000_TeacherLessonMaterials")]
public sealed class TeacherLessonMaterials : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.CreateTable(name: "TeacherLessonMaterialLinks", schema: "platform",
            columns: t => new {
                Id = t.Column<Guid>(type: "uuid", nullable: false),
                WorkspaceId = t.Column<Guid>(type: "uuid", nullable: false),
                RequestId = t.Column<Guid>(type: "uuid", nullable: false),
                LessonId = t.Column<Guid>(type: "uuid", nullable: false),
                MaterialId = t.Column<Guid>(type: "uuid", nullable: false),
                CreatedAt = t.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: t => {
                t.PrimaryKey("PK_TeacherLessonMaterialLinks", x => x.Id);
                t.ForeignKey("FK_LessonMaterialLinks_Lesson", x => new { x.WorkspaceId, x.LessonId },
                    "Lessons", new[] { "WorkspaceId", "Id" }, principalSchema: "platform",
                    onDelete: ReferentialAction.Restrict);
                t.ForeignKey("FK_LessonMaterialLinks_Material", x => new { x.WorkspaceId, x.MaterialId },
                    "TeacherMaterials", new[] { "WorkspaceId", "Id" }, principalSchema: "platform",
                    onDelete: ReferentialAction.Restrict);
            });
        m.CreateIndex("IX_TeacherLessonMaterialLinks_WorkspaceId_RequestId", "TeacherLessonMaterialLinks",
            new[] { "WorkspaceId", "RequestId" }, schema: "platform", unique: true);
        m.CreateIndex("IX_TeacherLessonMaterialLinks_WorkspaceId_LessonId_MaterialId", "TeacherLessonMaterialLinks",
            new[] { "WorkspaceId", "LessonId", "MaterialId" }, schema: "platform", unique: true);
        m.CreateIndex("IX_TeacherLessonMaterialLinks_WorkspaceId_MaterialId", "TeacherLessonMaterialLinks",
            new[] { "WorkspaceId", "MaterialId" }, schema: "platform");
    }

    protected override void Down(MigrationBuilder m) =>
        m.DropTable("TeacherLessonMaterialLinks", "platform");
}
