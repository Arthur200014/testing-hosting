using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
namespace TestingHosting.Platform.Persistence.Migrations;
[DbContext(typeof(PlatformDbContext))]
[Migration("20261116190000_LessonRecordings")]
public sealed class LessonRecordings : Migration
{
    protected override void Up(MigrationBuilder m)
    {
        m.CreateTable(name:"LessonRecordings",schema:"platform",columns:t=>new {
            Id=t.Column<Guid>("uuid",nullable:false),WorkspaceId=t.Column<Guid>("uuid",nullable:false),LessonId=t.Column<Guid>("uuid",nullable:false),
            Title=t.Column<string>("character varying(250)",maxLength:250,nullable:false),SourceUrl=t.Column<string>("character varying(2048)",maxLength:2048,nullable:false),
            Revision=t.Column<int>("integer",nullable:false,defaultValue:1),IsAvailable=t.Column<bool>("boolean",nullable:false),
            AccessUntil=t.Column<DateTimeOffset>("timestamp with time zone",nullable:true),CreatedAt=t.Column<DateTimeOffset>("timestamp with time zone",nullable:false)
        },constraints:t=>{
            t.PrimaryKey("PK_LessonRecordings",x=>x.Id);t.UniqueConstraint("AK_LessonRecordings_WorkspaceId_Id",x=>new{x.WorkspaceId,x.Id});
            t.ForeignKey("FK_Recordings_Lesson",x=>new{x.WorkspaceId,x.LessonId},"Lessons",new[]{"WorkspaceId","Id"},"platform",onDelete:ReferentialAction.Restrict);
        });
        m.CreateIndex("IX_LessonRecordings_WorkspaceId_LessonId","LessonRecordings",new[]{"WorkspaceId","LessonId"},schema:"platform");
        m.CreateTable(name:"LessonRecordingOperations",schema:"platform",columns:t=>new {
            WorkspaceId=t.Column<Guid>("uuid",nullable:false),RequestId=t.Column<Guid>("uuid",nullable:false),RecordingId=t.Column<Guid>("uuid",nullable:false),
            Kind=t.Column<string>("character varying(24)",maxLength:24,nullable:false),PayloadHash=t.Column<string>("character varying(64)",maxLength:64,nullable:false),ResultRevision=t.Column<int>("integer",nullable:false)
        },constraints:t=>{
            t.PrimaryKey("PK_LessonRecordingOperations",x=>new{x.WorkspaceId,x.RequestId,x.Kind});
            t.ForeignKey("FK_RecordingOperations_Recording",x=>new{x.WorkspaceId,x.RecordingId},"LessonRecordings",new[]{"WorkspaceId","Id"},"platform",onDelete:ReferentialAction.Restrict);
        });
        m.CreateIndex("IX_LessonRecordingOperations_WorkspaceId_RecordingId","LessonRecordingOperations",new[]{"WorkspaceId","RecordingId"},schema:"platform");
    }
    protected override void Down(MigrationBuilder m) {m.DropTable("LessonRecordingOperations","platform");m.DropTable("LessonRecordings","platform");}
}
