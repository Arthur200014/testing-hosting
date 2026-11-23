using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
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
    public async Task ClassBoardIsStableAcrossLessonsAndSharedWithClassPupilOnly()
    {
        await ResetAsync(factory);
        var owner = await SeedAsync(factory, "class-board-owner", "class-board-owner@example.invalid", "owner");
        var other = await SeedAsync(factory, "class-board-other", "class-board-other@example.invalid", "owner");
        using var enabled = BoardHost("IntegrationTests", "");
        using var client = enabled.CreateClient();
        var login = await LoginAsync(client, "class-board-owner", "class-board-owner@example.invalid", Password);
        var session = (await login.Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        var pupil = await SeedStudentAsync(factory, owner.WorkspaceId, "Class pupil", true);
        await SeedHistoryAsync(factory, owner.WorkspaceId, [pupil]);
        Guid classId;
        string pupilToken;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var lesson = await db.Lessons.FirstAsync(x => x.WorkspaceId == owner.WorkspaceId);
            var membership = await db.WorkspaceStudentMemberships.FirstAsync(x => x.WorkspaceId == owner.WorkspaceId);
            pupilToken = scope.ServiceProvider.GetRequiredService<TestingHosting.Platform.StudentSessions.StudentTokenIssuer>().Issue(
                new TestingHosting.Platform.StudentSessions.StudentSessionIdentity(membership.Id, membership.StudentId, "Class pupil", "MATH", owner.WorkspaceId)).AccessToken;
            classId = Guid.NewGuid();
            db.TeacherClasses.Add(new TestingHosting.Platform.Classes.TeacherClass {
                Id=classId, WorkspaceId=owner.WorkspaceId, StudentMembershipId=membership.Id,
                StudentId=membership.StudentId, Title="Persistent class", RequestId=Guid.NewGuid()
            });
            lesson.IndividualClassId = classId;
            await db.SaveChangesAsync();
        }
        const string prefix = "/api/v1/teacher/board-prototype/classes/individual/";
        var one = await client.PostAsync(prefix + classId + "/permit", null);
        Assert.Equal(HttpStatusCode.OK, one.StatusCode);
        var first = await one.Content.ReadFromJsonAsync<JsonElement>();
        var two = await client.PostAsync(prefix + classId + "/permit", null);
        var second = await two.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(first.GetProperty("board").GetString(), second.GetProperty("board").GetString());
        Assert.Equal(first.GetProperty("sceneKey").GetString(), second.GetProperty("sceneKey").GetString());
        Assert.Equal("class-individual-" + classId.ToString("N"), first.GetProperty("board").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/board-prototype/access",
            new {token=first.GetProperty("token").GetString()})).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", pupilToken);
        var pupilPermit = await client.PostAsync("/api/v1/student/board-prototype/classes/individual/" + classId + "/permit", null);
        Assert.Equal(HttpStatusCode.OK, pupilPermit.StatusCode);
        var pupilScene = await pupilPermit.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(first.GetProperty("board").GetString(), pupilScene.GetProperty("board").GetString());
        Assert.Equal(first.GetProperty("sceneKey").GetString(), pupilScene.GetProperty("sceneKey").GetString());
        var otherLogin = await LoginAsync(client, "class-board-other", "class-board-other@example.invalid", Password);
        var otherSession = (await otherLogin.Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", otherSession.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync(prefix + classId + "/permit", null)).StatusCode);
    }

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
    public void BoardPrototypeRejectsProductionAndUnconfiguredStaging()
    {
        foreach (var (environment, workspaceId) in new[] {
            ("Production", Guid.NewGuid().ToString()),
            ("Staging", ""),
            ("Staging", Guid.Empty.ToString()),
            ("Staging", "invalid")
        })
        {
            using var invalid = BoardHost(environment, workspaceId);
            Assert.Throws<InvalidOperationException>(() => invalid.CreateClient());
        }
    }

    [Theory]
    [InlineData("Staging", false)]
    public async Task BoardPrototypeStagingAllowsOnlyTheConfiguredWorkspace(string environment, bool hosted)
    {
        await ResetAsync(factory);
        var allowed = await SeedAsync(factory, "board-staging-allowed", "board-staging-allowed@example.invalid", "owner");
        var excluded = await SeedAsync(factory, "board-staging-excluded", "board-staging-excluded@example.invalid", "owner");
        foreach (var workspace in new[] { allowed.WorkspaceId, excluded.WorkspaceId })
        {
            var pupil = await SeedStudentAsync(factory, workspace, "Synthetic pupil", true);
            await SeedHistoryAsync(factory, workspace, [pupil]);
        }

        Dictionary<Guid, Guid> lessons;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            lessons = await db.Lessons.ToDictionaryAsync(lesson => lesson.WorkspaceId, lesson => lesson.Id);
        }

        const string legacyCatalog = "/api/v1/teacher/board-prototype/boards";
        const string access = "/api/v1/board-prototype/access";
        var prefix = hosted ? "/board-pilot" : "";
        var catalog = prefix + legacyCatalog;
        using var staging = BoardHost(environment, allowed.WorkspaceId.ToString(), hosted: hosted);
        using var client = staging.CreateClient();
        async Task SelectTeacher(string name)
        {
            var response = await LoginAsync(client, name, name + "@example.invalid", Password);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var session = (await response.Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        }

        await SelectTeacher("board-staging-excluded");
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(catalog)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync(
            $"{prefix}/api/v1/teacher/board-prototype/lessons/{lessons[excluded.WorkspaceId]}/permit", null)).StatusCode);

        await SelectTeacher("board-staging-allowed");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(catalog)).StatusCode);
        if (hosted) Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(legacyCatalog)).StatusCode);
        using var permit = await client.PostAsync(
            $"{prefix}/api/v1/teacher/board-prototype/lessons/{lessons[allowed.WorkspaceId]}/permit", null);
        Assert.Equal(HttpStatusCode.OK, permit.StatusCode);
        var token = (await permit.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        Assert.Equal(hosted ? HttpStatusCode.NotFound : HttpStatusCode.NoContent,
            (await client.PostAsJsonAsync(access, new { token })).StatusCode);

        using var reconfigured = BoardHost(environment, excluded.WorkspaceId.ToString(), hosted: hosted);
        using var revalidation = reconfigured.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await revalidation.PostAsJsonAsync(access, new { token })).StatusCode);

        using var disabled = BoardHost(environment, allowed.WorkspaceId.ToString(), enabled: false, hosted: hosted);
        using var disabledClient = disabled.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await disabledClient.PostAsJsonAsync(access, new { token })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await disabledClient.GetAsync(catalog)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await disabledClient.GetAsync("/health/live")).StatusCode);
    }

    [Fact]
    public async Task HostedBoardsAllowNewTeachersAndKeepOwnersIsolated()
    {
        await ResetAsync(factory);
        // Existing pilot settings must not exclude newly registered teachers.
        using var hosted = BoardHost("Production", Guid.NewGuid().ToString(), hosted: true);
        using var client = hosted.CreateClient();
        const string catalog = "/board-pilot/api/v1/teacher/board-prototype/boards";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(catalog)).StatusCode);
        var boards = new List<Guid>();
        var sessions = new List<TeacherLoginResponse>();
        for (var index = 0; index < 2; index++)
        {
            client.DefaultRequestHeaders.Authorization = null;
            var email = $"hosted-new-{index}@example.invalid";
            Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync(
                "/api/v1/teacher-signups", new TeacherSignupRequest(email, Password))).StatusCode);
            var login = await LoginAsync(client, null, email, Password);
            Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            var session = (await login.Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
            sessions.Add(session);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
            var board = Guid.NewGuid();
            boards.Add(board);
            Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(catalog + "/" + board,
                new { title = $"Synthetic board {index}" })).StatusCode);
            var rows = await client.GetFromJsonAsync<JsonElement[]>(catalog);
            Assert.Single(rows!);
            Assert.Equal(board, rows![0].GetProperty("id").GetGuid());
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsync(catalog + "/" + board + "/permit", null)).StatusCode);
        }
        Assert.NotEqual(sessions[0].WorkspaceId, sessions[1].WorkspaceId);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync(catalog + "/" + boards[0] + "/permit", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync(catalog + "/" + boards[0],
            new { title = "Foreign overwrite" })).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", sessions[0].AccessToken);
        var reopened = await client.GetFromJsonAsync<JsonElement[]>(catalog);
        Assert.Single(reopened!);
        Assert.Equal("Synthetic board 0", reopened![0].GetProperty("title").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync(catalog + "/" + boards[1] + "/permit", null)).StatusCode);
    }

    private WebApplicationFactory<Program> BoardHost(string environment, string workspaceId, bool enabled = true, bool hosted = false)
        => factory.WithWebHostBuilder(builder => builder.UseEnvironment(environment)
            .ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["BoardPrototype:Enabled"] = enabled.ToString(),
                ["BoardPrototype:HostedPilot"] = hosted.ToString(),
                ["BoardPrototype:HostedOrigin"] = "https://board-pilot.example.invalid",
                ["BoardPrototype:StagingWorkspaceId"] = workspaceId,
                ["BoardPrototype:SigningKey"] = Convert.ToBase64String(Enumerable.Repeat((byte)0x79, 32).ToArray()),
                ["BoardPrototype:SceneRootKey"] = Convert.ToBase64String(Enumerable.Repeat((byte)0x6b, 32).ToArray())
            })));

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

    [Fact]
    public async Task BoardPrototypeLiveAccessRechecksClassEnrollmentParticipantAndWorkspace()
    {
        await ResetAsync(factory);
        var owner=await SeedAsync(factory,"board-live","board-live@example.invalid","owner");
        var member=await SeedStudentAsync(factory,owner.WorkspaceId,"Synthetic live pupil",true);
        Guid student;
        await using(var scope=factory.Services.CreateAsyncScope()) {
            student=await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().WorkspaceStudentMemberships
                .Where(x=>x.Id==member).Select(x=>x.StudentId).SingleAsync();
        }
        using var enabled=factory.WithWebHostBuilder(builder=>builder.ConfigureAppConfiguration((_,c)=>c.AddInMemoryCollection(new Dictionary<string,string?> {
            ["BoardPrototype:Enabled"]="true",
            ["BoardPrototype:SigningKey"]=Convert.ToBase64String(Enumerable.Repeat((byte)0x79,32).ToArray()),
            ["BoardPrototype:SceneRootKey"]=Convert.ToBase64String(Enumerable.Repeat((byte)0x6b,32).ToArray())
        })));
        using var client=enabled.CreateClient();
        var teacher=(await (await LoginAsync(client,"board-live","board-live@example.invalid",Password)).Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        var jwt=new JwtSecurityToken(ApiFactory.Issuer,ApiFactory.Audience,new[]{
            new Claim("sub",student.ToString()),new Claim("workspace_id",owner.WorkspaceId.ToString()),
            new Claim("membership_id",member.ToString()),new Claim("role","student")
        },expires:DateTime.UtcNow.AddMinutes(3),signingCredentials:new SigningCredentials(
            new SymmetricSecurityKey(Convert.FromBase64String(ApiFactory.SigningKey)),SecurityAlgorithms.HmacSha256));
        var pupil=new JwtSecurityTokenHandler().WriteToken(jwt);
        client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",teacher.AccessToken);
        var classResponse=await client.PostAsJsonAsync("/api/v1/teacher/classes",new {
            requestId=Guid.NewGuid(),studentMembershipId=member,title="Synthetic individual",durationMinutes=60 });
        Assert.Equal(HttpStatusCode.Created,classResponse.StatusCode);
        var individual=(await classResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var groupResponse=await client.PostAsJsonAsync("/api/v1/teacher/groups",new {
            requestId=Guid.NewGuid(),title="Synthetic group",memberIds=new[]{member},durationMinutes=60 });
        Assert.Equal(HttpStatusCode.Created,groupResponse.StatusCode);
        var group=(await groupResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        async Task<Guid> Lesson(Guid? individualId,Guid? groupId) {
            var response=await client.PostAsJsonAsync("/api/v1/teacher/lessons",new {
                requestId=Guid.NewGuid(),title="Synthetic live lesson",lessonAt=DateTimeOffset.UtcNow,
                individualClassId=individualId,groupClassId=groupId,
                participants=new[]{new {membershipId=member,durationMinutes=60,attendanceStatus="Unknown"}} });
            Assert.Equal(HttpStatusCode.Created,response.StatusCode);
            return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("lessonId").GetGuid();
        }
        var solo=await Lesson(individual,null);var together=await Lesson(null,group);
        async Task<string?> Permit(string role,Guid lesson,bool allowed=true) {
            client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",role=="teacher"?teacher.AccessToken:pupil);
            var response=await client.PostAsync("/api/v1/"+role+"/board-prototype/lessons/"+lesson+"/permit",null);
            Assert.Equal(allowed?HttpStatusCode.OK:HttpStatusCode.NotFound,response.StatusCode);
            return allowed?(await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString():null;
        }
        async Task Access(string token,bool allowed) {
            Assert.Equal(allowed?HttpStatusCode.NoContent:HttpStatusCode.NotFound,
                (await client.PostAsJsonAsync("/api/v1/board-prototype/access",new {token})).StatusCode);
        }
        var soloTeacher=(await Permit("teacher",solo))!;var soloStudent=(await Permit("student",solo))!;
        var groupTeacher=(await Permit("teacher",together))!;var groupStudent=(await Permit("student",together))!;
        await using(var scope=factory.Services.CreateAsyncScope()) {
            var db=scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.TeacherClasses.Where(x=>x.Id==individual).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.IsArchived,true));
        }
        await Permit("teacher",solo,false);await Permit("student",solo,false);await Access(soloTeacher,false);await Access(soloStudent,false);
        await using(var scope=factory.Services.CreateAsyncScope()) {
            var db=scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.TeacherClasses.Where(x=>x.Id==individual).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.IsArchived,false));
            await db.TeacherGroupClasses.Where(x=>x.Id==group).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.IsArchived,true));
        }
        await Permit("teacher",together,false);await Permit("student",together,false);await Access(groupTeacher,false);await Access(groupStudent,false);
        await using(var scope=factory.Services.CreateAsyncScope()) {
            var db=scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.TeacherGroupClasses.Where(x=>x.Id==group).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.IsArchived,false));
            await db.TeacherGroupEnrollments.Where(x=>x.GroupClassId==group&&x.MembershipId==member).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.IsApproved,false));
        }
        await Permit("teacher",together);await Permit("student",together,false);await Access(groupStudent,false);await Access(soloStudent,true);
        await using(var scope=factory.Services.CreateAsyncScope()) {
            var db=scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.TeacherGroupEnrollments.Where(x=>x.GroupClassId==group&&x.MembershipId==member).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.IsApproved,true));
            await db.LessonParticipants.Where(x=>x.LessonId==together&&x.MembershipId==member).ExecuteDeleteAsync();
        }
        await Permit("teacher",together);await Permit("student",together,false);await Access(groupStudent,false);await Access(soloStudent,true);
        await using(var scope=factory.Services.CreateAsyncScope()) {
            var db=scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.Workspaces.Where(x=>x.Id==owner.WorkspaceId).ExecuteUpdateAsync(s=>s.SetProperty(x=>x.IsActive,false));
        }
        await Access(soloStudent,false);await Access(groupTeacher,false);
    }

}
