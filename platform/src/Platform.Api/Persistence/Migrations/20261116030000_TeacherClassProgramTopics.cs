using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingHosting.Platform.Persistence;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261116030000_TeacherClassProgramTopics")]
public sealed class TeacherClassProgramTopics : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.CreateTable(name:"TeacherClassTopics", schema:"platform",
            columns:t => new {
                Id = t.Column<Guid>(type:"uuid", nullable:false),
                WorkspaceId = t.Column<Guid>(type:"uuid", nullable:false),
                RequestId = t.Column<Guid>(type:"uuid", nullable:false),
                IndividualClassId = t.Column<Guid>(type:"uuid", nullable:true),
                GroupClassId = t.Column<Guid>(type:"uuid", nullable:true),
                Title = t.Column<string>(type:"character varying(200)", maxLength:200, nullable:false),
                Plan = t.Column<string>(type:"character varying(2000)", maxLength:2000, nullable:false),
                SortOrder = t.Column<int>(type:"integer", nullable:false),
                CreatedAt = t.Column<DateTimeOffset>(type:"timestamp with time zone", nullable:false)
            },
            constraints:t => {
                t.PrimaryKey("PK_TeacherClassTopics", x=>x.Id);
                t.UniqueConstraint("AK_TeacherClassTopics_WorkspaceId_Id", x=>new {x.WorkspaceId,x.Id});
                t.ForeignKey("FK_TeacherClassTopics_TeacherClasses_WorkspaceId_IndividualClassId",
                    x=>new{x.WorkspaceId,x.IndividualClassId},
                    "TeacherClasses", new[]{"WorkspaceId","Id"}, principalSchema:"platform",
                    onDelete:ReferentialAction.Restrict);
                t.ForeignKey("FK_TeacherClassTopics_TeacherGroupClasses_WorkspaceId_GroupClassId",
                    x=>new{x.WorkspaceId,x.GroupClassId},
                    "TeacherGroupClasses", new[]{"WorkspaceId","Id"}, principalSchema:"platform",
                    onDelete:ReferentialAction.Restrict);
                t.CheckConstraint("CK_ClassTopics_ExactlyOneClass",
                    "(\"IndividualClassId\" IS NOT NULL) <> (\"GroupClassId\" IS NOT NULL)");
                t.CheckConstraint("CK_ClassTopics_Title","length(\"Title\") > 0");
            });
        m.CreateTable(name:"TeacherTopicMaterialLinks", schema:"platform",
            columns:t=>new {
                Id = t.Column<Guid>(type:"uuid",nullable:false),
                WorkspaceId = t.Column<Guid>(type:"uuid",nullable:false),
                RequestId = t.Column<Guid>(type:"uuid",nullable:false),
                TopicId = t.Column<Guid>(type:"uuid",nullable:false),
                MaterialId = t.Column<Guid>(type:"uuid",nullable:false),
                CreatedAt = t.Column<DateTimeOffset>(type:"timestamp with time zone",nullable:false)
            },
            constraints:t=>{
                t.PrimaryKey("PK_TeacherTopicMaterialLinks",x=>x.Id);
                t.ForeignKey("FK_TeacherTopicMaterialLinks_TeacherClassTopics_WorkspaceId_TopicId",
                    x=>new{x.WorkspaceId,x.TopicId},
                    "TeacherClassTopics", new[]{"WorkspaceId","Id"}, principalSchema:"platform",
                    onDelete:ReferentialAction.Restrict);
                t.ForeignKey("FK_TeacherTopicMaterialLinks_TeacherMaterials_WorkspaceId_MaterialId",
                    x=>new{x.WorkspaceId,x.MaterialId},
                    "TeacherMaterials", new[]{"WorkspaceId","Id"}, principalSchema:"platform",
                    onDelete:ReferentialAction.Restrict);
            });
        m.CreateIndex("IX_TeacherClassTopics_WorkspaceId_RequestId","TeacherClassTopics",
            new[]{"WorkspaceId","RequestId"},schema:"platform",unique:true);
        m.CreateIndex("IX_TeacherClassTopics_WorkspaceId_IndividualClassId_SortOrder","TeacherClassTopics",
            new[]{"WorkspaceId","IndividualClassId","SortOrder"},schema:"platform");
        m.CreateIndex("IX_TeacherClassTopics_WorkspaceId_GroupClassId_SortOrder","TeacherClassTopics",
            new[]{"WorkspaceId","GroupClassId","SortOrder"},schema:"platform");
        m.CreateIndex("IX_TeacherTopicMaterialLinks_WorkspaceId_RequestId","TeacherTopicMaterialLinks",
            new[]{"WorkspaceId","RequestId"},schema:"platform",unique:true);
        m.CreateIndex("IX_TeacherTopicMaterialLinks_WorkspaceId_TopicId_MaterialId","TeacherTopicMaterialLinks",
            new[]{"WorkspaceId","TopicId","MaterialId"},schema:"platform",unique:true);
        m.CreateIndex("IX_TeacherTopicMaterialLinks_WorkspaceId_MaterialId","TeacherTopicMaterialLinks",
            new[]{"WorkspaceId","MaterialId"},schema:"platform");
    }
    protected override void Down(MigrationBuilder m)
    {
        m.DropTable("TeacherTopicMaterialLinks","platform");
        m.DropTable("TeacherClassTopics","platform");
    }
}
