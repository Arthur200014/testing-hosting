using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using TestingHosting.Platform.Configuration;

namespace TestingHosting.Platform.StudentSessions;

public sealed class StudentTokenIssuer(JwtOptions options, TimeProvider timeProvider)
{
    public StudentSessionResponse Issue(StudentSessionIdentity identity)
    {
        var now = timeProvider.GetUtcNow();
        var expiresAt = now.AddMinutes(options.LifetimeMinutes);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, identity.StudentId.ToString()),
            new Claim("workspace_id", identity.WorkspaceId.ToString()),
            new Claim("membership_id", identity.MembershipId.ToString()),
            new Claim(ClaimTypes.Role, "student"),
            new Claim("role", "student")
        };

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Convert.FromBase64String(options.SigningKey)),
            SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: options.Issuer,
            audience: options.Audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        return new StudentSessionResponse(
            new JwtSecurityTokenHandler().WriteToken(token),
            "Bearer",
            expiresAt,
            new StudentSessionStudent(identity.StudentId, identity.DisplayName, identity.ProgramId, identity.WorkspaceId));
    }
}
