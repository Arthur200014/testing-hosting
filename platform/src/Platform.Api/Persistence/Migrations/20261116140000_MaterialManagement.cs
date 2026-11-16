using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
namespace TestingHosting.Platform.Persistence.Migrations;
[DbContext(typeof(PlatformDbContext))]
[Migration("20261116140000_MaterialManagement")]
public sealed class MaterialManagement : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.AddColumn<int>("Revision","TeacherMaterials",type:"integer",schema:"platform",nullable:false,defaultValue:1);
        m.AddColumn<DateTimeOffset>("DeletedAt","TeacherMaterials",type:"timestamp with time zone",schema:"platform",nullable:true);
        m.AddColumn<DateTimeOffset>("DeletedAt","TeacherFileAssets",type:"timestamp with time zone",schema:"platform",nullable:true);
        m.AddColumn<string>("UploadTitle","TeacherFileAssets",type:"character varying(250)",schema:"platform",maxLength:250,nullable:true);
        m.CreateTable(name:"TeacherMaterialOperations",schema:"platform",columns:t=>new {
            WorkspaceId=t.Column<Guid>("uuid",nullable:false),RequestId=t.Column<Guid>("uuid",nullable:false),
            Kind=t.Column<string>("character varying(24)",maxLength:24,nullable:false),MaterialId=t.Column<Guid>("uuid",nullable:false),
            PayloadHash=t.Column<string>("character varying(64)",maxLength:64,nullable:false),ResultRevision=t.Column<int>("integer",nullable:false),CreatedAt=t.Column<DateTimeOffset>("timestamp with time zone",nullable:false)
        },constraints:t=>{
            t.PrimaryKey("PK_TeacherMaterialOperations",x=>new{x.WorkspaceId,x.RequestId,x.Kind});
            t.ForeignKey("FK_MaterialOperations_Material",x=>new{x.WorkspaceId,x.MaterialId},"TeacherMaterials",new[]{"WorkspaceId","Id"},"platform",onDelete:ReferentialAction.Restrict);
        });
        m.CreateIndex("IX_TeacherMaterialOperations_WorkspaceId_MaterialId","TeacherMaterialOperations",new[]{"WorkspaceId","MaterialId"},schema:"platform");
    }
    protected override void Down(MigrationBuilder m)
    {
        m.DropTable("TeacherMaterialOperations","platform");m.DropColumn("Revision","TeacherMaterials","platform");
        m.DropColumn("DeletedAt","TeacherMaterials","platform");m.DropColumn("DeletedAt","TeacherFileAssets","platform");m.DropColumn("UploadTitle","TeacherFileAssets","platform");
    }
}
