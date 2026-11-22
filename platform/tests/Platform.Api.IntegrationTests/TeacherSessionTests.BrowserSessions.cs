using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;

namespace TestingHosting.Platform.IntegrationTests;
public sealed partial class TeacherSessionTests
{
    [Fact]
    public async Task BrowserTeacherSessionRestoresWithoutPasswordAndLogoutRevokesSavedCookie()
    {
        await ResetAsync(factory);
        var owner = await SeedAsync(factory, "persistent-owner", "persistent@example.invalid", "owner");
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies=false });
        var login = await client.PostAsJsonAsync("/api/v1/teacher-sessions", new TeacherLoginRequest(
            "persistent-owner", "persistent@example.invalid", Password, Persistent:true));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var session = (await login.Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        var cookie = login.Headers.GetValues("Set-Cookie").Single();
        Assert.Contains("httponly", cookie.ToLowerInvariant());
        Assert.Contains("samesite=strict", cookie.ToLowerInvariant());
        Assert.Contains("expires=", cookie.ToLowerInvariant());
        Assert.True(session.ExpiresAt < DateTimeOffset.UtcNow.AddHours(1));
        var saved = cookie.Split(';')[0];
        client.DefaultRequestHeaders.Add("Cookie", saved);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);
        var restored = await client.GetAsync("/api/v1/teacher-sessions/current");
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
        Assert.Equal("no-store", restored.Headers.CacheControl!.ToString());
        var reopened = (await restored.Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        Assert.Equal(session.TeacherId, reopened.TeacherId);
        Assert.Equal(session.WorkspaceId, reopened.WorkspaceId);
        client.DefaultRequestHeaders.Remove("Cookie");
        client.DefaultRequestHeaders.Add("Cookie", saved[..^8] + "tampered");
        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync("/api/v1/teacher-sessions/current")).StatusCode);
        client.DefaultRequestHeaders.Remove("Cookie");
        client.DefaultRequestHeaders.Add("Cookie", saved);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", reopened.AccessToken);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/v1/teacher-sessions/logout", null)).StatusCode);
        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync("/api/v1/teacher-sessions/current")).StatusCode);
    }

    [Fact]
    public async Task BrowserStudentSessionRestoresAndRejectsRotatedCode()
    {
        await ResetAsync(factory);
        var owner = await SeedAsync(factory, "persistent-pupil", "persistent-pupil@example.invalid", "owner");
        await SeedStudentAsync(factory, owner.WorkspaceId, "Seed program", true);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions {HandleCookies=false});
        var login = await LoginAsync(client, "persistent-pupil", "persistent-pupil@example.invalid", Password);
        var teacher = (await login.Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", teacher.AccessToken);
        Guid program;
        await using (var scope = factory.Services.CreateAsyncScope())
            program = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().Programs.Where(x => x.WorkspaceId == owner.WorkspaceId).Select(x => x.Id).FirstAsync();
        var created = await client.PostAsJsonAsync("/api/v1/teacher/students", new {requestId=Guid.NewGuid(),programId=program,studentName="Persistent browser pupil"});
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var pupil = await created.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        client.DefaultRequestHeaders.Authorization = null;
        var exchange = await client.PostAsJsonAsync("/api/v1/student-sessions", new {workspace="persistent-pupil",code=pupil.GetProperty("inviteCode").GetString(),persistent=true});
        Assert.Equal(HttpStatusCode.OK, exchange.StatusCode);
        var cookie = exchange.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/student-sessions/current")).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var membership = await db.WorkspaceStudentMemberships.SingleAsync(x => x.Id == pupil.GetProperty("membershipId").GetGuid());
            membership.CodeHash = System.Security.Cryptography.SHA256.HashData(Guid.NewGuid().ToByteArray());
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync("/api/v1/student-sessions/current")).StatusCode);
    }
}
