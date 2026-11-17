using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.IdentityAccess;

namespace TestingHosting.Platform.IntegrationTests;
public sealed partial class TeacherSessionTests
{
    [Fact]
    public async Task BoardPrototypePermitIsOffByDefault()
    {
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/api/v1/teacher/board-prototype/lessons/"+Guid.NewGuid()+"/permit", null)).StatusCode);
    }

    [Fact]
    public void BoardPrototypeRejectsMissingOrSharedSceneRoot()
    {
        var roomKey=Convert.ToBase64String(Enumerable.Repeat((byte)0x79,32).ToArray());
        foreach(var root in new string?[] { null, roomKey, roomKey+"\n", ApiFactory.SigningKey })
        {
            using var invalid=factory.WithWebHostBuilder(builder=>builder.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?> {
                ["BoardPrototype:Enabled"]="true", ["BoardPrototype:SigningKey"]=roomKey, ["BoardPrototype:SceneRootKey"]=root
            })));
            Assert.Throws<InvalidOperationException>(()=>invalid.CreateClient());
        }
    }

    [Fact]
    public async Task BoardPrototypePermitChecksTeacherWorkspaceAndStudentParticipation()
    {
        await ResetAsync(factory);
        var owner=await SeedAsync(factory,"board-proto","board-proto@example.invalid","owner");
        await SeedAsync(factory,"board-foreign","board-foreign@example.invalid","owner");
        var first=await SeedStudentAsync(factory,owner.WorkspaceId,"Synthetic first",true);
        var second=await SeedStudentAsync(factory,owner.WorkspaceId,"Synthetic second",true);
        var foreign=await SeedStudentAsync(factory,owner.WorkspaceId,"Synthetic nonparticipant",true);
        await SeedHistoryAsync(factory,owner.WorkspaceId,[first,second]);
        Guid lesson,firstStudent,foreignStudent;
        await using(var scope=factory.Services.CreateAsyncScope()) {
            var db=scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            lesson=await db.Lessons.Where(x=>x.WorkspaceId==owner.WorkspaceId).Select(x=>x.Id).SingleAsync();
            firstStudent=await db.WorkspaceStudentMemberships.Where(x=>x.Id==first).Select(x=>x.StudentId).SingleAsync();
            foreignStudent=await db.WorkspaceStudentMemberships.Where(x=>x.Id==foreign).Select(x=>x.StudentId).SingleAsync();
        }
        var boardKey=Convert.ToBase64String(Enumerable.Repeat((byte)0x79,32).ToArray());
        using var enabled=factory.WithWebHostBuilder(builder=>builder.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?> {
            ["BoardPrototype:Enabled"]="true", ["BoardPrototype:SigningKey"]=boardKey,
            ["BoardPrototype:SceneRootKey"]=Convert.ToBase64String(Enumerable.Repeat((byte)0x6b,32).ToArray())
        })));
        using var client=enabled.CreateClient();
        var path="/api/v1/teacher/board-prototype/lessons/"+lesson+"/permit";
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.PostAsync(path,null)).StatusCode);
        var session=(await (await LoginAsync(client,"board-proto","board-proto@example.invalid",Password)).Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",session.AccessToken);
        using var response=await client.PostAsync(path,null);
        Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore);
        var result=await response.Content.ReadFromJsonAsync<JsonElement>();
        var sceneKey=Convert.FromBase64String(result.GetProperty("sceneKey").GetString()!);
        Assert.Equal(32,sceneKey.Length);
        Assert.Equal(1,result.GetProperty("keyVersion").GetInt32());
        var context=System.Text.Encoding.UTF8.GetBytes("tas-board-scene:v1\n"+owner.WorkspaceId.ToString("N")+"\nlesson-"+lesson.ToString("N"));
        Assert.True(sceneKey.SequenceEqual(System.Security.Cryptography.HMACSHA256.HashData(Enumerable.Repeat((byte)0x6b,32).ToArray(),context)),"Scene key derivation mismatch");
        var token=result.GetProperty("token").GetString()!;var parts=token.Split('.');
        var access="/api/v1/board-prototype/access";
        Assert.Equal(HttpStatusCode.NoContent,(await client.PostAsJsonAsync(access,new {token})).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsJsonAsync(access,new {token=token+"x"})).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsJsonAsync(access,new {token="malformed"})).StatusCode);
        var actual=Base64UrlEncoder.DecodeBytes(parts[1]);
        Assert.Equal(System.Security.Cryptography.HMACSHA256.HashData(Convert.FromBase64String(boardKey),System.Text.Encoding.UTF8.GetBytes(parts[0])),actual);
        var body=JsonDocument.Parse(Base64UrlEncoder.DecodeBytes(parts[0])).RootElement;
        Assert.Equal(owner.WorkspaceId.ToString("N"),body.GetProperty("workspace").GetString());
        Assert.Equal("lesson-"+lesson.ToString("N"),body.GetProperty("board").GetString());
        Assert.Equal(120,body.GetProperty("exp").GetInt64()-body.GetProperty("iat").GetInt64());
        Assert.False(body.TryGetProperty("sceneKey",out _));
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsync(path.Replace(lesson.ToString(),Guid.NewGuid().ToString()),null)).StatusCode);
        var other=(await (await LoginAsync(client,"board-foreign","board-foreign@example.invalid",Password)).Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",other.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsync(path,null)).StatusCode);
        var studentPath=path.Replace("/teacher/","/student/");
        string StudentToken(Guid member,Guid student) {
            var jwt=new JwtSecurityToken(ApiFactory.Issuer,ApiFactory.Audience,new[]{new Claim("sub",student.ToString()),new Claim("workspace_id",owner.WorkspaceId.ToString()),new Claim("membership_id",member.ToString()),new Claim("role","student")},expires:DateTime.UtcNow.AddMinutes(2),signingCredentials:new SigningCredentials(new SymmetricSecurityKey(Convert.FromBase64String(ApiFactory.SigningKey)),SecurityAlgorithms.HmacSha256));
            return new JwtSecurityTokenHandler().WriteToken(jwt);
        }
        client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",StudentToken(first,firstStudent));
        var studentPermitResponse=await client.PostAsync(studentPath,null);
        Assert.Equal(HttpStatusCode.OK,studentPermitResponse.StatusCode);
        var studentReply=await studentPermitResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(studentReply.GetProperty("sceneKey").GetString()==result.GetProperty("sceneKey").GetString(),"Participants must share the authorized scene key");
        var studentPermit=studentReply.GetProperty("token").GetString()!;
        Assert.Equal(HttpStatusCode.NoContent,(await client.PostAsJsonAsync(access,new {token=studentPermit})).StatusCode);
        await using(var scope=factory.Services.CreateAsyncScope()) {
            var db=scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            (await db.WorkspaceStudentMemberships.SingleAsync(x=>x.Id==first)).IsActive=false;
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsync(studentPath,null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsJsonAsync(access,new {token=studentPermit})).StatusCode);
        client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",session.AccessToken);
        Assert.Equal(HttpStatusCode.NoContent,(await client.PostAsync("/api/v1/teacher-sessions/logout",null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsJsonAsync(access,new {token})).StatusCode);
        client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",StudentToken(foreign,foreignStudent));
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsync(studentPath,null)).StatusCode);
        client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",StudentToken(first,foreignStudent));
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsync(studentPath,null)).StatusCode);
    }
}
