using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingHosting.Platform.Persistence.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261124210000_ClassRepresentativeInvitations")]
public sealed class ClassRepresentativeInvitations : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE platform."ClassRepresentativeInvitations" (
            "WorkspaceId" uuid NOT NULL, "Id" uuid NOT NULL, "MembershipId" uuid NOT NULL, "StudentId" uuid NOT NULL,
            "IndividualClassId" uuid, "GroupClassId" uuid,
            "Name" varchar(100) NOT NULL, "CodeHash" char(64) NOT NULL UNIQUE,
            "IssuedAt" timestamptz NOT NULL, "ExpiresAt" timestamptz NOT NULL,
            "AcceptedAt" timestamptz, "RevokedAt" timestamptz,
            "SessionHash" char(64) UNIQUE, "SessionExpiresAt" timestamptz,
            PRIMARY KEY ("WorkspaceId","Id"),
            FOREIGN KEY ("WorkspaceId","MembershipId","StudentId")
                REFERENCES platform."WorkspaceStudentMemberships" ("WorkspaceId","Id","StudentId") ON DELETE RESTRICT,
            FOREIGN KEY ("WorkspaceId","IndividualClassId")
                REFERENCES platform."TeacherClasses" ("WorkspaceId","Id") ON DELETE RESTRICT,
            FOREIGN KEY ("WorkspaceId","GroupClassId")
                REFERENCES platform."TeacherGroupClasses" ("WorkspaceId","Id") ON DELETE RESTRICT,
            CHECK (num_nonnulls("IndividualClassId","GroupClassId") = 1),
            CHECK (num_nonnulls("SessionHash","SessionExpiresAt") IN (0, 2))
        );
        CREATE INDEX "IX_Representatives_Individual" ON platform."ClassRepresentativeInvitations"
            ("WorkspaceId","IndividualClassId","IssuedAt" DESC) WHERE "IndividualClassId" IS NOT NULL;
        CREATE INDEX "IX_Representatives_Group" ON platform."ClassRepresentativeInvitations"
            ("WorkspaceId","GroupClassId","IssuedAt" DESC) WHERE "GroupClassId" IS NOT NULL;
        """);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql("""DROP TABLE platform."ClassRepresentativeInvitations";""");
}
