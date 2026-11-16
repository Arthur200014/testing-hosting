using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
namespace TestingHosting.Platform.Persistence.Migrations;
[DbContext(typeof(PlatformDbContext))]
[Migration("20261116160000_LibraryFolders")]
public sealed class LibraryFolders : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.CreateTable(name:"TeacherLibraryFolders",schema:"platform",columns:t=>new {
            Id=t.Column<Guid>("uuid",nullable:false),WorkspaceId=t.Column<Guid>("uuid",nullable:false),
            Title=t.Column<string>("character varying(100)",maxLength:100,nullable:false),
            Revision=t.Column<int>("integer",nullable:false,defaultValue:1),CreatedAt=t.Column<DateTimeOffset>("timestamp with time zone",nullable:false)
        },constraints:t=>{
            t.PrimaryKey("PK_TeacherLibraryFolders",x=>x.Id);
            t.UniqueConstraint("AK_TeacherLibraryFolders_WorkspaceId_Id",x=>new{x.WorkspaceId,x.Id});
            t.ForeignKey("FK_LibraryFolders_Workspace",x=>x.WorkspaceId,"Workspaces","Id","platform",onDelete:ReferentialAction.Restrict);
        });
        m.CreateTable(name:"TeacherLibraryFolderOperations",schema:"platform",columns:t=>new {
            WorkspaceId=t.Column<Guid>("uuid",nullable:false),RequestId=t.Column<Guid>("uuid",nullable:false),
            Kind=t.Column<string>("character varying(24)",maxLength:24,nullable:false),FolderId=t.Column<Guid>("uuid",nullable:false),
            PayloadHash=t.Column<string>("character varying(64)",maxLength:64,nullable:false),ResultRevision=t.Column<int>("integer",nullable:false)
        },constraints:t=>{
            t.PrimaryKey("PK_TeacherLibraryFolderOperations",x=>new{x.WorkspaceId,x.RequestId,x.Kind});
            t.ForeignKey("FK_LibraryFolderOperations_Folder",x=>new{x.WorkspaceId,x.FolderId},"TeacherLibraryFolders",new[]{"WorkspaceId","Id"},"platform",onDelete:ReferentialAction.Restrict);
        });
        m.CreateIndex("IX_TeacherLibraryFolderOperations_WorkspaceId_FolderId","TeacherLibraryFolderOperations",new[]{"WorkspaceId","FolderId"},schema:"platform");
        m.AddColumn<Guid>("FolderId","TeacherMaterials",type:"uuid",schema:"platform",nullable:true);
        m.CreateIndex("IX_TeacherMaterials_WorkspaceId_FolderId","TeacherMaterials",new[]{"WorkspaceId","FolderId"},schema:"platform");
        m.AddForeignKey(name:"FK_Materials_Folder",table:"TeacherMaterials",columns:new[]{"WorkspaceId","FolderId"},principalTable:"TeacherLibraryFolders",principalColumns:new[]{"WorkspaceId","Id"},schema:"platform",principalSchema:"platform",onDelete:ReferentialAction.Restrict);
    }
    protected override void Down(MigrationBuilder m)
    {
        m.DropForeignKey("FK_Materials_Folder","TeacherMaterials","platform");
        m.DropIndex("IX_TeacherMaterials_WorkspaceId_FolderId","TeacherMaterials","platform");
        m.DropColumn("FolderId","TeacherMaterials","platform");
        m.DropTable("TeacherLibraryFolderOperations","platform");m.DropTable("TeacherLibraryFolders","platform");
    }
}
