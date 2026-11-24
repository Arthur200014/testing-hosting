using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261124200000_ClassAnnouncements")]
public sealed class ClassAnnouncements : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE platform."ClassAnnouncements" (
            "WorkspaceId" uuid NOT NULL, "Id" uuid NOT NULL,
            "IndividualClassId" uuid, "GroupClassId" uuid,
            "Title" varchar(120) NOT NULL, "Body" varchar(4000) NOT NULL,
            "PublishedAt" timestamptz NOT NULL, "WithdrawnAt" timestamptz,
            PRIMARY KEY ("WorkspaceId", "Id"),
            FOREIGN KEY ("WorkspaceId","IndividualClassId")
                REFERENCES platform."TeacherClasses" ("WorkspaceId","Id") ON DELETE RESTRICT,
            FOREIGN KEY ("WorkspaceId","GroupClassId")
                REFERENCES platform."TeacherGroupClasses" ("WorkspaceId","Id") ON DELETE RESTRICT,
            CHECK (num_nonnulls("IndividualClassId","GroupClassId") = 1),
            CHECK (length("Title") > 0 AND length("Body") > 0)
        );
        CREATE INDEX "IX_ClassAnnouncements_Individual"
            ON platform."ClassAnnouncements" ("WorkspaceId","IndividualClassId","PublishedAt" DESC)
            WHERE "IndividualClassId" IS NOT NULL AND "WithdrawnAt" IS NULL;
        CREATE INDEX "IX_ClassAnnouncements_Group"
            ON platform."ClassAnnouncements" ("WorkspaceId","GroupClassId","PublishedAt" DESC)
            WHERE "GroupClassId" IS NOT NULL AND "WithdrawnAt" IS NULL;
        """);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("""DROP TABLE platform."ClassAnnouncements";""");
}
