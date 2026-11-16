using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
namespace TestingHosting.Platform.Persistence.Migrations;
[DbContext(typeof(PlatformDbContext))]
[Migration("20261116120000_TeacherFileAssets")]
public sealed class TeacherFileAssets : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.CreateTable(name:"TeacherFileAssets",schema:"platform",columns:t=>new {
            Id=t.Column<Guid>("uuid",nullable:false),WorkspaceId=t.Column<Guid>("uuid",nullable:false),RequestId=t.Column<Guid>("uuid",nullable:false),
            FileName=t.Column<string>("character varying(180)",maxLength:180,nullable:false),ContentType=t.Column<string>("character varying(80)",maxLength:80,nullable:false),
            Sha256=t.Column<string>("character varying(64)",maxLength:64,nullable:false),SizeBytes=t.Column<long>("bigint",nullable:false),CreatedAt=t.Column<DateTimeOffset>("timestamp with time zone",nullable:false)
        },constraints:t=>{
            t.PrimaryKey("PK_TeacherFileAssets",x=>x.Id);t.UniqueConstraint("AK_TeacherFileAssets_WorkspaceId_Id",x=>new{x.WorkspaceId,x.Id});
            t.ForeignKey("FK_FileAssets_Workspace",x=>x.WorkspaceId,"Workspaces","Id","platform",onDelete:ReferentialAction.Restrict);
            t.CheckConstraint("CK_FileAssets_Size","\"SizeBytes\" BETWEEN 1 AND 5242880");
        });
        m.CreateIndex("IX_TeacherFileAssets_WorkspaceId_RequestId","TeacherFileAssets",new[]{"WorkspaceId","RequestId"},"platform",unique:true);
        m.CreateTable(name:"TeacherFileContents",schema:"platform",columns:t=>new {
            WorkspaceId=t.Column<Guid>("uuid",nullable:false),FileId=t.Column<Guid>("uuid",nullable:false),Bytes=t.Column<byte[]>("bytea",nullable:false)
        },constraints:t=>{
            t.PrimaryKey("PK_TeacherFileContents",x=>new{x.WorkspaceId,x.FileId});
            t.ForeignKey("FK_FileContents_Asset",x=>new{x.WorkspaceId,x.FileId},"TeacherFileAssets",new[]{"WorkspaceId","Id"},"platform",onDelete:ReferentialAction.Restrict);
            t.CheckConstraint("CK_FileContents_Size","octet_length(\"Bytes\") BETWEEN 1 AND 5242880");
        });
        m.AddColumn<Guid>("FileAssetId","TeacherMaterials",type:"uuid",schema:"platform",nullable:true);
        m.CreateIndex("IX_TeacherMaterials_WorkspaceId_FileAssetId","TeacherMaterials",new[]{"WorkspaceId","FileAssetId"},"platform",unique:true);
        m.AddForeignKey("FK_Materials_File","TeacherMaterials",new[]{"WorkspaceId","FileAssetId"},"TeacherFileAssets",principalColumns:new[]{"WorkspaceId","Id"},schema:"platform",principalSchema:"platform",onDelete:ReferentialAction.Restrict);
    }
    protected override void Down(MigrationBuilder m)
    {
        m.DropForeignKey("FK_Materials_File","TeacherMaterials","platform");m.DropIndex("IX_TeacherMaterials_WorkspaceId_FileAssetId","TeacherMaterials","platform");
        m.DropColumn("FileAssetId","TeacherMaterials","platform");m.DropTable("TeacherFileContents","platform");m.DropTable("TeacherFileAssets","platform");
    }
}
