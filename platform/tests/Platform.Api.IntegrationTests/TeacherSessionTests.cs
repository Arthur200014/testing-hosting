using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using TestingHosting.Platform.Classes;
using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Homework;
using TestingHosting.Platform.Lessons;
using TestingHosting.Platform.Mocks;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.Students;
using TestingHosting.Platform.Subscriptions;
using TestingHosting.Platform.TestAttempts;

namespace TestingHosting.Platform.IntegrationTests;

public sealed class TeacherSessionTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string Password = "Synthetic-Teacher-Password-Only-123!";
    private const string ClaimCode = "synthetic-claim-code-for-integration-tests-only-2026";

    [Fact]
    public async Task LessonTopicSetsReplaceAtomicallyAndEnforceClassOwnership()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "lesson-topics-north", "lt-north@example.invalid", "owner");
        var south = await SeedAsync(factory, "lesson-topics-south", "lt-south@example.invalid", "owner");
        var member = await SeedStudentAsync(factory, north.WorkspaceId, "Lesson topic student", true);
        var otherMember = await SeedStudentAsync(factory, north.WorkspaceId, "Other class student", true);
        using var client = factory.CreateClient();
        var session = (await (await LoginAsync(client, "lesson-topics-north", "lt-north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        async Task<TeacherClassView> Class(Guid id, string title) =>
            (await (await client.PostAsJsonAsync("/api/v1/teacher/classes",
                new TeacherCreateClassRequest(Guid.NewGuid(), id, title))).Content.ReadFromJsonAsync<TeacherClassView>())!;
        var cls = await Class(member, "Lesson topic class");
        var other = await Class(otherMember, "Other lesson class");
        var group = (await (await client.PostAsJsonAsync("/api/v1/teacher/groups",
            new TeacherCreateGroupRequest(Guid.NewGuid(), "Topic pair", [member, otherMember])))
            .Content.ReadFromJsonAsync<TeacherGroupClassView>())!;
        async Task<TeacherClassTopicView> Topic(Guid id, string kind, string title) =>
            (await (await client.PostAsJsonAsync("/api/v1/teacher/class-topics",
                new TeacherClassTopicCreateRequest(Guid.NewGuid(), id, kind, title))).Content.ReadFromJsonAsync<TeacherClassTopicView>())!;
        var first = await Topic(cls.Id, "individual", "First");
        var second = await Topic(cls.Id, "individual", "Second");
        var wrong = await Topic(other.Id, "individual", "Another class");
        var groupTopic = await Topic(group.Id, "group", "Group topic");
        async Task<Guid> Lesson(Guid? classId, Guid? groupId, params Guid[] members) {
            var response = await client.PostAsJsonAsync("/api/v1/teacher/lessons", new TeacherLessonWriteRequest(
                Guid.NewGuid(), new DateTimeOffset(2026,12,9,12,0,0,TimeSpan.Zero),
                members.Select(id=>new TeacherLessonParticipantRequest(id,60,null,null,"Unknown")).ToList(),
                IndividualClassId:classId, GroupClassId:groupId));
            Assert.Equal(HttpStatusCode.Created,response.StatusCode);
            return (await response.Content.ReadFromJsonAsync<TeacherLessonWriteResponse>())!.LessonId;
        }
        var lesson = await Lesson(cls.Id,null,member);
        var groupLesson = await Lesson(null,group.Id,member,otherMember);
        var legacy = await Lesson(null,null,member);
        var concurrentLesson = await Lesson(cls.Id,null,member);
        var beforeLessons = await client.GetStringAsync("/api/v1/teacher/lessons");
        var beforeTopics = await client.GetStringAsync("/api/v1/teacher/class-topics");
        var request = new TeacherLessonTopicRequest(lesson,0,[first.Id,second.Id]);
        var saved = await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",request);
        Assert.Equal(HttpStatusCode.OK,saved.StatusCode);
        var set = (await saved.Content.ReadFromJsonAsync<TeacherLessonTopicSet>())!;
        Assert.Equal(1,set.Revision); Assert.Equal(2,set.TopicIds.Length);
        var replay = await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",request);
        Assert.Equal(HttpStatusCode.OK,replay.StatusCode);
        Assert.Equal(set.TopicIds,(await replay.Content.ReadFromJsonAsync<TeacherLessonTopicSet>())!.TopicIds);
        Assert.Equal(HttpStatusCode.Conflict,(await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",
            request with { TopicIds = [first.Id] })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",
            request with { ExpectedRevision = 1, TopicIds = [first.Id,wrong.Id] })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",
            request with { ExpectedRevision = 1, TopicIds = [groupTopic.Id] })).StatusCode);
        foreach(var invalid in new[] { request with { ExpectedRevision = null },request with { ExpectedRevision = -1 },
            request with { TopicIds = null },request with { TopicIds = [first.Id,first.Id] },
            request with { TopicIds = [Guid.Empty] },request with { TopicIds = Enumerable.Range(0,51).Select(_=>Guid.NewGuid()).ToList() } })
            Assert.Equal(HttpStatusCode.BadRequest,(await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",invalid)).StatusCode);
        var current = (await client.GetFromJsonAsync<List<TeacherLessonTopicSet>>("/api/v1/teacher/lesson-topics"))!.Single(x=>x.LessonId==lesson);
        Assert.Equal(set.TopicIds,current.TopicIds); Assert.Equal(1,current.Revision);
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",
            new TeacherLessonTopicRequest(legacy,0,[]))).StatusCode);
        var removed = await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",new TeacherLessonTopicRequest(lesson,1,[]));
        Assert.Equal(HttpStatusCode.OK,removed.StatusCode);
        Assert.Empty((await removed.Content.ReadFromJsonAsync<TeacherLessonTopicSet>())!.TopicIds);
        Assert.Equal(HttpStatusCode.OK,(await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",new TeacherLessonTopicRequest(lesson,2,[first.Id]))).StatusCode);
        // Returning to a prior set must not make a delayed old write valid again.
        Assert.Equal(HttpStatusCode.Conflict,(await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",request)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",
            new TeacherLessonTopicRequest(groupLesson,0,[groupTopic.Id]))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",
            new TeacherLessonTopicRequest(groupLesson,1,[first.Id]))).StatusCode);
        Assert.Equal(HttpStatusCode.OK,(await client.PostAsJsonAsync("/api/v1/teacher/groups/"+group.Id+"/archive",
            new TeacherClassRevisionRequest(group.Revision))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",
            new TeacherLessonTopicRequest(groupLesson,1,[]))).StatusCode);
        var concurrent = await Task.WhenAll(
            client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",new TeacherLessonTopicRequest(concurrentLesson,0,[first.Id])),
            client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",new TeacherLessonTopicRequest(concurrentLesson,0,[second.Id])));
        Assert.Single(concurrent.Where(x=>x.StatusCode==HttpStatusCode.OK));
        Assert.Single(concurrent.Where(x=>x.StatusCode==HttpStatusCode.Conflict));
        Assert.Equal(beforeLessons,await client.GetStringAsync("/api/v1/teacher/lessons"));
        Assert.Equal(beforeTopics,await client.GetStringAsync("/api/v1/teacher/class-topics"));
        var otherSession = (await (await LoginAsync(client,"lesson-topics-south","lt-south@example.invalid",Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",otherSession.AccessToken);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherLessonTopicSet>>("/api/v1/teacher/lesson-topics"))!);
        Assert.Equal(HttpStatusCode.NotFound,(await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",request)).StatusCode);
        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/v1/teacher/lesson-topics")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await client.PostAsJsonAsync("/api/v1/teacher/lesson-topics",request)).StatusCode);
    }

    [Fact]
    public async Task TopicTaskTemplatesPersistReuseAndRejectForeignOrArchivedWrites()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "topic-tasks-north", "tasks-north@example.invalid", "owner");
        var south = await SeedAsync(factory, "topic-tasks-south", "tasks-south@example.invalid", "owner");
        var member = await SeedStudentAsync(factory, north.WorkspaceId, "Topic task student", true);
        var programId = await SeedProgramAsync(factory, north.WorkspaceId);
        var southProgramId = await SeedProgramAsync(factory, south.WorkspaceId);
        using var client = factory.CreateClient();
        var northSession = (await (await LoginAsync(client, "topic-tasks-north",
            "tasks-north@example.invalid", Password)).Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", northSession.AccessToken);
        var individual = (await (await client.PostAsJsonAsync("/api/v1/teacher/classes",
            new TeacherCreateClassRequest(Guid.NewGuid(), member, "Topic tasks class")))
            .Content.ReadFromJsonAsync<TeacherClassView>())!;
        var group = (await (await client.PostAsJsonAsync("/api/v1/teacher/groups",
            new TeacherCreateGroupRequest(Guid.NewGuid(), "Topic tasks group", [member])))
            .Content.ReadFromJsonAsync<TeacherGroupClassView>())!;
        var topic = (await (await client.PostAsJsonAsync("/api/v1/teacher/class-topics",
            new TeacherClassTopicCreateRequest(Guid.NewGuid(), individual.Id, "individual", "Functions")))
            .Content.ReadFromJsonAsync<TeacherClassTopicView>())!;
        var groupTopic = (await (await client.PostAsJsonAsync("/api/v1/teacher/class-topics",
            new TeacherClassTopicCreateRequest(Guid.NewGuid(), group.Id, "group", "Group topic")))
            .Content.ReadFromJsonAsync<TeacherClassTopicView>())!;
        var taskPost = await client.PostAsJsonAsync("/api/v1/teacher/homework/native/tasks",
            new CreateNativeTaskRequest(Guid.NewGuid(), programId, "Reusable task", "Solve 2+2"));
        Assert.Equal(HttpStatusCode.Created, taskPost.StatusCode);
        var task = (await taskPost.Content.ReadFromJsonAsync<NativeTaskView>())!;
        var request = new TeacherTopicTaskRequest(Guid.NewGuid(), topic.Id, task.Id);
        var saved = await client.PostAsJsonAsync("/api/v1/teacher/topic-tasks", request);
        Assert.Equal(HttpStatusCode.Created, saved.StatusCode);
        var link = (await saved.Content.ReadFromJsonAsync<TeacherTopicTaskView>())!;
        Assert.Equal(task.Id, link.TaskId);
        Assert.Equal(programId, link.ProgramId);
        var replay = await client.PostAsJsonAsync("/api/v1/teacher/topic-tasks", request);
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal(link, await replay.Content.ReadFromJsonAsync<TeacherTopicTaskView>());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/teacher/topic-tasks",
            request with { RequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/teacher/topic-tasks",
            request with { TaskId = Guid.NewGuid() })).StatusCode);
        foreach (var invalid in new[] { request with { RequestId = Guid.Empty },
            request with { TopicId = Guid.Empty }, request with { TaskId = Guid.Empty } })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
                "/api/v1/teacher/topic-tasks", invalid)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/v1/teacher/topic-tasks",
            request with { RequestId = Guid.NewGuid(), TaskId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/v1/teacher/topic-tasks",
            request with { RequestId = Guid.NewGuid(), TopicId = groupTopic.Id })).StatusCode);
        var persisted = (await client.GetFromJsonAsync<List<TeacherTopicTaskView>>("/api/v1/teacher/topic-tasks"))!;
        Assert.Equal(2, persisted.Count);
        Assert.Single((await client.GetFromJsonAsync<List<NativeTaskView>>("/api/v1/teacher/homework/native/tasks"))!);
        Assert.Empty((await client.GetFromJsonAsync<List<NativeAssignmentView>>("/api/v1/teacher/homework/native/assignments"))!);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(
            "/api/v1/teacher/groups/" + group.Id + "/archive", new TeacherClassRevisionRequest(group.Revision))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/v1/teacher/topic-tasks",
            request with { RequestId = Guid.NewGuid(), TopicId = groupTopic.Id })).StatusCode);
        var southSession = (await (await LoginAsync(client, "topic-tasks-south",
            "tasks-south@example.invalid", Password)).Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", southSession.AccessToken);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherTopicTaskView>>("/api/v1/teacher/topic-tasks"))!);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/v1/teacher/topic-tasks", request)).StatusCode);
        var foreignTask = (await (await client.PostAsJsonAsync("/api/v1/teacher/homework/native/tasks",
            new CreateNativeTaskRequest(Guid.NewGuid(), southProgramId, "Foreign task", "Foreign prompt")))
            .Content.ReadFromJsonAsync<NativeTaskView>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", northSession.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/v1/teacher/topic-tasks",
            request with { RequestId = Guid.NewGuid(), TaskId = foreignTask.Id })).StatusCode);
        Assert.Equal(persisted, await client.GetFromJsonAsync<List<TeacherTopicTaskView>>("/api/v1/teacher/topic-tasks"));
        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/teacher/topic-tasks")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/teacher/topic-tasks", request)).StatusCode);
    }

    [Fact]
    public async Task MaterialsPersistReuseInGroupAndRejectForeignTenants()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "materials-check-north", "mat-north@example.invalid", "owner");
        await SeedAsync(factory, "materials-check-south", "mat-south@example.invalid", "owner");
        var member = await SeedStudentAsync(factory, north.WorkspaceId, "Material student", true);
        using var client = factory.CreateClient();
        var northSession = (await (await LoginAsync(client, "materials-check-north",
            "mat-north@example.invalid", Password)).Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", northSession.AccessToken);
        var individual = (await (await client.PostAsJsonAsync("/api/v1/teacher/classes",
            new TeacherCreateClassRequest(Guid.NewGuid(), member, "Materials test class")))
            .Content.ReadFromJsonAsync<TeacherClassView>())!;
        var group = (await (await client.PostAsJsonAsync("/api/v1/teacher/groups",
            new TeacherCreateGroupRequest(Guid.NewGuid(), "Materials test group", [member])))
            .Content.ReadFromJsonAsync<TeacherGroupClassView>())!;
        var write = new TeacherClassMaterialWriteRequest(Guid.NewGuid(), individual.Id, "individual",
            Title: "Lesson reference", Url: "https://example.org/lesson");
        var first = await client.PostAsJsonAsync("/api/v1/teacher/class-materials", write);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var material = (await first.Content.ReadFromJsonAsync<TeacherClassMaterialView>())!;
        Assert.Equal(individual.Id, material.IndividualClassId);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-materials", write)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-materials", write with { Title = "Another" })).StatusCode);
        foreach (var invalid in new[] { "javascript:alert(1)", "http://example.org", "https://user:pass@example.org" })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
                "/api/v1/teacher/class-materials", write with { RequestId = Guid.NewGuid(), Url = invalid })).StatusCode);
        var reuse = new TeacherClassMaterialWriteRequest(Guid.NewGuid(), group.Id, "group",
            MaterialId: material.MaterialId);
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/teacher/class-materials", reuse)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/class-materials",
                reuse with { RequestId = Guid.NewGuid() })).StatusCode);
        Assert.Single((await client.GetFromJsonAsync<List<TeacherMaterialView>>("/api/v1/teacher/materials"))!);
        var links = (await client.GetFromJsonAsync<List<TeacherClassMaterialView>>(
            "/api/v1/teacher/class-materials"))!;
        Assert.Equal(2, links.Count);
        Assert.Contains(links, x => x.GroupClassId == group.Id && x.MaterialId == material.MaterialId);
        var lessonPost = await client.PostAsJsonAsync("/api/v1/teacher/lessons",
            new TeacherLessonWriteRequest(Guid.NewGuid(), new DateTimeOffset(2026, 12, 8, 12, 0, 0, TimeSpan.Zero),
                [new TeacherLessonParticipantRequest(member, 60, null, null, "Unknown")],
                IndividualClassId: individual.Id));
        Assert.Equal(HttpStatusCode.Created, lessonPost.StatusCode);
        var lesson = (await lessonPost.Content.ReadFromJsonAsync<TeacherLessonWriteResponse>())!;
        var attachLesson = new TeacherLessonMaterialWriteRequest(Guid.NewGuid(), lesson.LessonId, material.MaterialId);
        var attached = await client.PostAsJsonAsync("/api/v1/teacher/lesson-materials", attachLesson);
        Assert.Equal(HttpStatusCode.Created, attached.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(
            "/api/v1/teacher/lesson-materials", attachLesson)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            "/api/v1/teacher/lesson-materials", attachLesson with { MaterialId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            "/api/v1/teacher/lesson-materials", attachLesson with { RequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            "/api/v1/teacher/lesson-materials", attachLesson with {
                RequestId = Guid.NewGuid(), LessonId = Guid.NewGuid()
            })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            "/api/v1/teacher/lesson-materials", attachLesson with {
                RequestId = Guid.NewGuid(), MaterialId = Guid.NewGuid()
            })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
            "/api/v1/teacher/lesson-materials", attachLesson with { RequestId = Guid.Empty })).StatusCode);
        var lessonLinks = (await client.GetFromJsonAsync<List<TeacherLessonMaterialView>>(
            "/api/v1/teacher/lesson-materials"))!;
        Assert.Single(lessonLinks);
        Assert.Equal(lesson.LessonId, lessonLinks[0].LessonId);
        Assert.Equal(material.MaterialId, lessonLinks[0].MaterialId);
        var topicRequest = new TeacherClassTopicCreateRequest(
            Guid.NewGuid(), individual.Id, "individual", "Functions", "Domain and range");
        var topicSaved = await client.PostAsJsonAsync("/api/v1/teacher/class-topics", topicRequest);
        Assert.Equal(HttpStatusCode.Created, topicSaved.StatusCode);
        var topic = (await topicSaved.Content.ReadFromJsonAsync<TeacherClassTopicView>())!;
        Assert.Equal(individual.Id, topic.IndividualClassId);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-topics", topicRequest)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-topics", topicRequest with { Title = "Other" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-topics", topicRequest with { RequestId = Guid.NewGuid(), Title = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-topics", topicRequest with {
                RequestId = Guid.NewGuid(), ClassId = Guid.NewGuid()
            })).StatusCode);
        var secondPost = await client.PostAsJsonAsync("/api/v1/teacher/class-topics",
            topicRequest with { RequestId = Guid.NewGuid(), Title = "Derivative", Plan = "Rates" });
        Assert.Equal(HttpStatusCode.Created, secondPost.StatusCode);
        var second = (await secondPost.Content.ReadFromJsonAsync<TeacherClassTopicView>())!;
        var groupTopicPost = await client.PostAsJsonAsync("/api/v1/teacher/class-topics",
            topicRequest with { RequestId = Guid.NewGuid(), ClassKind = "group",
                ClassId = group.Id, Title = "Group geometry" });
        Assert.Equal(HttpStatusCode.Created, groupTopicPost.StatusCode);
        var groupTopic = (await groupTopicPost.Content.ReadFromJsonAsync<TeacherClassTopicView>())!;
        Assert.Equal(group.Id, groupTopic.GroupClassId);
        var move = new TeacherTopicMoveRequest(second.Id, "up", [topic.Id, second.Id]);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/v1/teacher/class-topics/move", move)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/class-topics/move", move)).StatusCode);
        var orderedTopics = (await client.GetFromJsonAsync<List<TeacherClassTopicView>>(
            "/api/v1/teacher/class-topics"))!.Where(x => x.IndividualClassId == individual.Id).ToList();
        Assert.Equal(new[] { second.Id, topic.Id }, orderedTopics.Select(x => x.Id));
        var complete = new TeacherTopicCompletionRequest(topic.Id, true, 0);
        var completionPost = await client.PostAsJsonAsync("/api/v1/teacher/class-topics/completion", complete);
        Assert.Equal(HttpStatusCode.OK, completionPost.StatusCode);
        var completed = (await completionPost.Content.ReadFromJsonAsync<TeacherClassTopicView>())!;
        Assert.NotNull(completed.CompletedAt);
        Assert.Equal(1, completed.CompletionRevision);
        var replay = await client.PostAsJsonAsync("/api/v1/teacher/class-topics/completion", complete);
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal(completed, await replay.Content.ReadFromJsonAsync<TeacherClassTopicView>());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-topics/completion", complete with { Completed = false })).StatusCode);
        var reopen = await client.PostAsJsonAsync("/api/v1/teacher/class-topics/completion",
            complete with { Completed = false, ExpectedRevision = 1 });
        Assert.Equal(HttpStatusCode.OK, reopen.StatusCode);
        var reopened = (await reopen.Content.ReadFromJsonAsync<TeacherClassTopicView>())!;
        Assert.Null(reopened.CompletedAt);
        Assert.Equal(2, reopened.CompletionRevision);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-topics/completion", complete)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-topics/completion", complete with { ExpectedRevision = 2 })).StatusCode);
        var reloadedTopic = (await client.GetFromJsonAsync<List<TeacherClassTopicView>>(
            "/api/v1/teacher/class-topics"))!.Single(x => x.Id == topic.Id);
        Assert.NotNull(reloadedTopic.CompletedAt);
        Assert.Equal(3, reloadedTopic.CompletionRevision);
        foreach (var invalid in new[] { complete with { Completed = null },
            complete with { ExpectedRevision = null }, complete with { ExpectedRevision = -1 },
            complete with { TopicId = Guid.Empty } })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
                "/api/v1/teacher/class-topics/completion", invalid)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-topics/completion", new TeacherTopicCompletionRequest(groupTopic.Id, true, 0))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(
            "/api/v1/teacher/groups/" + group.Id + "/archive", new TeacherClassRevisionRequest(group.Revision))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-topics/completion", new TeacherTopicCompletionRequest(groupTopic.Id, false, 1))).StatusCode);
        var attachTopicMaterial = new TeacherTopicMaterialRequest(Guid.NewGuid(), topic.Id, material.MaterialId);
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/teacher/topic-materials", attachTopicMaterial)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/v1/teacher/topic-materials", attachTopicMaterial)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/topic-materials",
                attachTopicMaterial with { RequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/v1/teacher/topic-materials",
                attachTopicMaterial with { RequestId = Guid.NewGuid(), TopicId = Guid.NewGuid() })).StatusCode);
        Assert.Single((await client.GetFromJsonAsync<List<TeacherTopicMaterialView>>(
            "/api/v1/teacher/topic-materials"))!);
        Assert.Single((await client.GetFromJsonAsync<List<TeacherMaterialView>>(
            "/api/v1/teacher/materials"))!); // Reuse the existing library row.
        var southSession = (await (await LoginAsync(client, "materials-check-south",
            "mat-south@example.invalid", Password)).Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", southSession.AccessToken);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherMaterialView>>("/api/v1/teacher/materials"))!);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherClassMaterialView>>("/api/v1/teacher/class-materials"))!);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherLessonMaterialView>>("/api/v1/teacher/lesson-materials"))!);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherClassTopicView>>("/api/v1/teacher/class-topics"))!);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-topics/completion", complete with { ExpectedRevision = 3 })).StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherTopicMaterialView>>("/api/v1/teacher/topic-materials"))!);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            "/api/v1/teacher/topic-materials",
            attachTopicMaterial with { RequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-topics",
            topicRequest with { RequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-topics/move",
            new TeacherTopicMoveRequest(second.Id, "up", [topic.Id, second.Id]))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            "/api/v1/teacher/lesson-materials", attachLesson with { RequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-materials", write with { RequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            "/api/v1/teacher/class-materials",
            reuse with { RequestId = Guid.NewGuid() })).StatusCode);
    }

    [Fact]
    public async Task PeriodPreviewUsesPersistedRulesAndLinkedStartsWithoutMutations()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "preview-north", "preview-north@example.invalid", "owner");
        await SeedAsync(factory, "preview-south", "preview-south@example.invalid", "owner");
        var member = await SeedStudentAsync(factory, north.WorkspaceId, "Preview student", true);
        using var client = factory.CreateClient();
        var login = (await (await LoginAsync(client, "preview-north", "preview-north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);
        var created = await client.PostAsJsonAsync("/api/v1/teacher/classes",
            new TeacherCreateClassRequest(Guid.NewGuid(), member, "Preview class"));
        var cls = (await created.Content.ReadFromJsonAsync<TeacherClassView>())!;
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules",
            new TeacherScheduleRuleCreateRequest(Guid.NewGuid(), cls.Id, "individual", 1, 900, 60, "Europe/Moscow"))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/v1/teacher/lessons",
            new TeacherLessonWriteRequest(Guid.NewGuid(), new DateTimeOffset(2026, 12, 7, 12, 0, 0, TimeSpan.Zero),
                [new TeacherLessonParticipantRequest(member, 60, null, null, "Unknown")], IndividualClassId: cls.Id))).StatusCode);
        var lessonsBefore = await client.GetStringAsync("/api/v1/teacher/lessons");
        var rulesBefore = await client.GetStringAsync("/api/v1/teacher/schedule-rules");
        var request = new TeacherPeriodPreviewRequest(cls.Id, "individual", new(2026, 12, 1), new(2026, 12, 31));
        var response = await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/period-preview", request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var candidates = (await response.Content.ReadFromJsonAsync<List<TeacherPeriodCandidate>>())!;
        Assert.Equal(4, candidates.Count);
        Assert.Single(candidates[0].ExistingLessonIds);
        Assert.Equal(new DateTimeOffset(2026, 12, 7, 12, 0, 0, TimeSpan.Zero), candidates[0].LessonAt);
        Assert.All(candidates.Skip(1), x => Assert.Empty(x.ExistingLessonIds));
        var oneDay = await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/period-preview",
            request with { From = new(2026, 12, 7), To = new(2026, 12, 7) });
        Assert.Single((await oneDay.Content.ReadFromJsonAsync<List<TeacherPeriodCandidate>>())!);
        var groupResponse = await client.PostAsJsonAsync("/api/v1/teacher/groups",
            new TeacherCreateGroupRequest(Guid.NewGuid(), "Empty preview group", [member]));
        var group = (await groupResponse.Content.ReadFromJsonAsync<TeacherGroupClassView>())!;
        var groupPreview = await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/period-preview",
            request with { ClassId = group.Id, ClassKind = "group" });
        Assert.Equal(HttpStatusCode.OK, groupPreview.StatusCode);
        Assert.Empty((await groupPreview.Content.ReadFromJsonAsync<List<TeacherPeriodCandidate>>())!);
        foreach (var invalid in new[] { request with { To = new(2027, 1, 1) },
            request with { To = new(2026, 11, 30) }, request with { ClassKind = "unknown" } })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
                "/api/v1/teacher/schedule-rules/period-preview", invalid)).StatusCode);
        Assert.Equal(lessonsBefore, await client.GetStringAsync("/api/v1/teacher/lessons"));
        Assert.Equal(rulesBefore, await client.GetStringAsync("/api/v1/teacher/schedule-rules"));
        var plan = new TeacherPeriodPlanRequest(Guid.NewGuid(), request, candidates);
        var saved = await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/period-plan", plan);
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var result = (await saved.Content.ReadFromJsonAsync<TeacherPeriodPlanResponse>())!;
        Assert.Equal(3, result.CreatedLessonIds.Count);
        Assert.Equal(1, result.SkippedCount);
        var afterPlan = await client.GetStringAsync("/api/v1/teacher/lessons");
        var retry = await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/period-plan", plan);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(await saved.Content.ReadAsStringAsync(), await retry.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            "/api/v1/teacher/schedule-rules/period-plan", plan with { RequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(
            "/api/v1/teacher/schedule-rules/period-plan", plan with { Period = request with { To = new(2026, 12, 30) } })).StatusCode);
        Assert.Equal(afterPlan, await client.GetStringAsync("/api/v1/teacher/lessons"));
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/v1/teacher/lessons",
            new TeacherLessonWriteRequest(Guid.NewGuid(), new DateTimeOffset(2027, 1, 11, 12, 30, 0, TimeSpan.Zero),
                [new TeacherLessonParticipantRequest(member, 60, null, null, "Unknown")], IndividualClassId: cls.Id))).StatusCode);
        var conflictPeriod = request with { From = new(2027, 1, 4), To = new(2027, 1, 11) };
        var conflictPreview = await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/period-preview", conflictPeriod);
        var conflictRows = (await conflictPreview.Content.ReadFromJsonAsync<List<TeacherPeriodCandidate>>())!;
        var beforeConflict = await client.GetStringAsync("/api/v1/teacher/lessons");
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/period-plan",
            new TeacherPeriodPlanRequest(Guid.NewGuid(), conflictPeriod, conflictRows))).StatusCode);
        Assert.Equal(beforeConflict, await client.GetStringAsync("/api/v1/teacher/lessons"));
        var countPeriod = request with { From = new(2027, 2, 1), To = default, Count = 3 };
        var countResponse = await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/period-preview", countPeriod);
        Assert.Equal(HttpStatusCode.OK, countResponse.StatusCode);
        var countRows = (await countResponse.Content.ReadFromJsonAsync<List<TeacherPeriodCandidate>>())!;
        Assert.Equal(3, countRows.Count);
        Assert.Equal(new DateTimeOffset(2027, 2, 15, 12, 0, 0, TimeSpan.Zero), countRows[^1].LessonAt);
        var countPlan = new TeacherPeriodPlanRequest(Guid.NewGuid(), countPeriod, countRows);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/period-plan", countPlan)).StatusCode);
        var afterCount = await client.GetStringAsync("/api/v1/teacher/lessons");
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/period-plan", countPlan)).StatusCode);
        Assert.Equal(afterCount, await client.GetStringAsync("/api/v1/teacher/lessons"));
        foreach (var invalidCount in new[] { 0, 32 })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/period-preview",
                countPeriod with { Count = invalidCount })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/period-preview",
            countPeriod with { ClassId = group.Id, ClassKind = "group" })).StatusCode);
        var south = (await (await LoginAsync(client, "preview-south", "preview-south@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", south.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            "/api/v1/teacher/schedule-rules/period-preview", request)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            "/api/v1/teacher/schedule-rules/period-plan", plan)).StatusCode);
    }


    [Fact]
    public async Task RecurringRulesPersistWithoutLessonsAndEnforceTenantConflictsAndRevision()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "rules-north", "rules-north@example.invalid", "owner");
        await SeedAsync(factory, "rules-south", "rules-south@example.invalid", "owner");
        var member = await SeedStudentAsync(factory, north.WorkspaceId, "Synthetic schedule student", true);
        using var client = factory.CreateClient();
        var northLogin = (await (await LoginAsync(client, "rules-north",
            "rules-north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", northLogin.AccessToken);
        var classResult = await client.PostAsJsonAsync("/api/v1/teacher/classes",
            new TeacherCreateClassRequest(Guid.NewGuid(), member, "Schedule individual"));
        Assert.Equal(HttpStatusCode.Created, classResult.StatusCode);
        var cls = (await classResult.Content.ReadFromJsonAsync<TeacherClassView>())!;
        var groupResult = await client.PostAsJsonAsync("/api/v1/teacher/groups",
            new TeacherCreateGroupRequest(Guid.NewGuid(), "Schedule group", [member]));
        Assert.Equal(HttpStatusCode.Created, groupResult.StatusCode);
        var group = (await groupResult.Content.ReadFromJsonAsync<TeacherGroupClassView>())!;
        var monday = new TeacherScheduleRuleCreateRequest(
            Guid.NewGuid(), cls.Id, "individual", 1, 900, 60, "Europe/Moscow");
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules",
                monday with { RequestId = Guid.NewGuid(), DaysMask = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules",
                monday with { RequestId = Guid.NewGuid(), StartMinute = 1380, DurationMinutes = 120 })).StatusCode);
        var created = await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules", monday);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var rule = (await created.Content.ReadFromJsonAsync<TeacherScheduleRuleView>())!;
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules", monday)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules",
                monday with { StartMinute = 1000 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules",
                monday with { RequestId = Guid.NewGuid(), StartMinute = 930 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules",
                monday with { RequestId = Guid.NewGuid(), TimeZoneId = "Europe/Berlin" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules",
                monday with { RequestId = Guid.NewGuid(), StartMinute = 960 })).StatusCode);
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules",
                monday with { RequestId = Guid.NewGuid(), ClassId = group.Id, ClassKind = "group" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PatchAsJsonAsync("/api/v1/teacher/schedule-rules/" + rule.Id,
                new TeacherScheduleRuleUpdateRequest(0, 1, 1020, 60, "Europe/Moscow", true))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PatchAsJsonAsync("/api/v1/teacher/schedule-rules/" + rule.Id,
                new TeacherScheduleRuleUpdateRequest(1, 1, 970, 60, "Europe/Moscow", true))).StatusCode);
        var changed = await client.PatchAsJsonAsync("/api/v1/teacher/schedule-rules/" + rule.Id,
            new TeacherScheduleRuleUpdateRequest(1, 5, 840, 60, "Europe/Moscow", true));
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var updated = (await changed.Content.ReadFromJsonAsync<TeacherScheduleRuleView>())!;
        Assert.Equal(2, updated.Revision);
        Assert.Equal(5, updated.DaysMask);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PatchAsJsonAsync("/api/v1/teacher/schedule-rules/" + rule.Id,
                new TeacherScheduleRuleUpdateRequest(1, 5, 840, 60, "Europe/Moscow", true))).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/" + rule.Id + "/disable",
                new TeacherClassRevisionRequest(updated.Revision))).StatusCode);
        var rules = (await client.GetFromJsonAsync<List<TeacherScheduleRuleView>>(
            "/api/v1/teacher/schedule-rules"))!;
        Assert.Equal(3, rules.Count);
        Assert.Single(rules, x => x.Id == rule.Id && !x.IsActive && x.Revision == 3);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherLessonView>>("/api/v1/teacher/lessons"))!);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/v1/teacher/classes/" + cls.Id + "/archive",
                new TeacherClassRevisionRequest(cls.Revision))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PatchAsJsonAsync("/api/v1/teacher/schedule-rules/" + rule.Id,
                new TeacherScheduleRuleUpdateRequest(3, 5, 840, 60, "Europe/Moscow", true))).StatusCode);
        var southLogin = (await (await LoginAsync(client, "rules-south",
            "rules-south@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", southLogin.AccessToken);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherScheduleRuleView>>(
            "/api/v1/teacher/schedule-rules"))!);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules",
                monday with { RequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/v1/teacher/schedule-rules/" + rule.Id + "/disable",
                new TeacherClassRevisionRequest(3))).StatusCode);
    }

    [Fact]
    public async Task ScheduledLessonLinksOneClassAndRespectsMembersTenantAndIdempotency()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "schedule-north", "schedule-north@example.invalid", "owner");
        await SeedAsync(factory, "schedule-south", "schedule-south@example.invalid", "owner");
        var a = await SeedStudentAsync(factory, north.WorkspaceId, "Synthetic A", true);
        var b = await SeedStudentAsync(factory, north.WorkspaceId, "Synthetic B", true);
        var c = await SeedStudentAsync(factory, north.WorkspaceId, "Synthetic C", true);
        using var client = factory.CreateClient();
        var login = (await (await LoginAsync(client, "schedule-north", "schedule-north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);
        var individualResponse = await client.PostAsJsonAsync("/api/v1/teacher/classes",
            new TeacherCreateClassRequest(Guid.NewGuid(), a, "Individual"));
        Assert.Equal(HttpStatusCode.Created, individualResponse.StatusCode);
        var individual = (await individualResponse.Content.ReadFromJsonAsync<TeacherClassView>())!;
        var groupResponse = await client.PostAsJsonAsync("/api/v1/teacher/groups",
            new TeacherCreateGroupRequest(Guid.NewGuid(), "Group", [a, b], Capacity: 2));
        Assert.Equal(HttpStatusCode.Created, groupResponse.StatusCode);
        var group = (await groupResponse.Content.ReadFromJsonAsync<TeacherGroupClassView>())!;
        var time = new DateTimeOffset(2026, 12, 1, 12, 30, 0, TimeSpan.Zero);
        var participantA = new TeacherLessonParticipantRequest(a, 60, null, null, "Unknown");
        var participantB = new TeacherLessonParticipantRequest(b, 60, null, null, "Unknown");
        var one = new TeacherLessonWriteRequest(Guid.NewGuid(), time, [participantA],
            IndividualClassId: individual.Id, Title: "Планиметрия", Description: "Повторение");
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons",
                one with { RequestId = Guid.NewGuid(), GroupClassId = group.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons",
                one with { RequestId = Guid.NewGuid(), Participants = [participantB] })).StatusCode);
        var created = await client.PostAsJsonAsync("/api/v1/teacher/lessons", one);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var first = (await created.Content.ReadFromJsonAsync<TeacherLessonWriteResponse>())!;
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons", one)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons",
                one with { Title = "Другая тема" })).StatusCode);
        var second = new TeacherLessonWriteRequest(Guid.NewGuid(), time.AddHours(2),
            [participantA, participantB], GroupClassId: group.Id,
            Title: "Групповое занятие", Description: "Система уравнений");
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons", second)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons",
                second with { RequestId = Guid.NewGuid(), Participants = [participantA, participantB,
                    new TeacherLessonParticipantRequest(c, 60, null, null, "Unknown")] })).StatusCode);
        var lessons = (await client.GetFromJsonAsync<List<TeacherLessonView>>("/api/v1/teacher/lessons"))!;
        Assert.Equal(2, lessons.Count);
        var single = Assert.Single(lessons, x => x.Id == first.LessonId);
        Assert.Equal(individual.Id, single.IndividualClassId);
        Assert.Null(single.GroupClassId);
        Assert.Equal("Планиметрия", single.Title);
        Assert.Equal("Повторение", single.Description);
        var grouped = Assert.Single(lessons, x => x.GroupClassId == group.Id);
        Assert.Null(grouped.IndividualClassId);
        Assert.Equal(2, grouped.Participants.Count);
        Assert.All(grouped.Participants, p => Assert.Equal("Unknown", p.AttendanceStatus));
        var archived = await client.PostAsJsonAsync(
            "/api/v1/teacher/groups/" + group.Id + "/archive", new TeacherClassRevisionRequest(1));
        Assert.Equal(HttpStatusCode.OK, archived.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons",
                second with { RequestId = Guid.NewGuid() })).StatusCode);
        Assert.Equal(2, (await client.GetFromJsonAsync<List<TeacherLessonView>>("/api/v1/teacher/lessons"))!.Count);
        var south = (await (await LoginAsync(client, "schedule-south", "schedule-south@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", south.AccessToken);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherLessonView>>("/api/v1/teacher/lessons"))!);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons",
                one with { RequestId = Guid.NewGuid() })).StatusCode);
    }

    [Fact]
    public async Task IndividualClassesPersistAndAreTenantScopedAndIdempotent()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "class-north", "class-north@example.invalid", "owner");
        var south = await SeedAsync(factory, "class-south", "class-south@example.invalid", "owner");
        var northStudent = await SeedStudentAsync(factory, north.WorkspaceId, "North learner", true);
        var southStudent = await SeedStudentAsync(factory, south.WorkspaceId, "South learner", true);

        using var client = factory.CreateClient();
        var northLogin = (await (await LoginAsync(client, "class-north", "class-north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", northLogin.AccessToken);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/v1/teacher/classes",
                new TeacherCreateClassRequest(Guid.Empty, Guid.Empty, " "))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/v1/teacher/classes",
                new TeacherCreateClassRequest(Guid.NewGuid(), southStudent, "Foreign"))).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/v1/teacher/classes",
                new TeacherCreateClassRequest(Guid.NewGuid(), northStudent, new string('X', 51)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/v1/teacher/classes",
                new TeacherCreateClassRequest(Guid.NewGuid(), northStudent, "Valid title", new string('Y', 201)))).StatusCode);

        // No database writes for invalid duration, price precision, currency or basis.
        foreach (var invalid in new[]
        {
            new TeacherCreateClassRequest(Guid.NewGuid(), northStudent, "Invalid", DurationMinutes: 14),
            new TeacherCreateClassRequest(Guid.NewGuid(), northStudent, "Invalid", DurationMinutes: 61),
            new TeacherCreateClassRequest(Guid.NewGuid(), northStudent, "Invalid", DurationMinutes: 245),
            new TeacherCreateClassRequest(Guid.NewGuid(), northStudent, "Invalid", PriceAmount: -1m, PriceCurrency: "RUB", PriceBasis: "lesson"),
            new TeacherCreateClassRequest(Guid.NewGuid(), northStudent, "Invalid", PriceAmount: 1.001m, PriceCurrency: "RUB", PriceBasis: "lesson"),
            new TeacherCreateClassRequest(Guid.NewGuid(), northStudent, "Invalid", PriceAmount: 10000000.01m, PriceCurrency: "RUB", PriceBasis: "lesson"),
            new TeacherCreateClassRequest(Guid.NewGuid(), northStudent, "Invalid", PriceAmount: 100m, PriceCurrency: "GBP", PriceBasis: "lesson"),
            new TeacherCreateClassRequest(Guid.NewGuid(), northStudent, "Invalid", PriceAmount: 100m, PriceCurrency: "RUB", PriceBasis: "week"),
            new TeacherCreateClassRequest(Guid.NewGuid(), northStudent, "Invalid", PriceCurrency: "RUB")
        })
            Assert.Equal(HttpStatusCode.BadRequest,
                (await client.PostAsJsonAsync("/api/v1/teacher/classes", invalid)).StatusCode);

        var request = new TeacherCreateClassRequest(
            Guid.NewGuid(), northStudent, "  ЕГЭ 2027  ", "  Описание класса  ",
            DurationMinutes: 90, PriceAmount: 1750.50m, PriceCurrency: "rub",
            PriceBasis: "MONTH", AllowLessonChat: true, AllowPrivateMessages: true);
        var createdResponse = await client.PostAsJsonAsync("/api/v1/teacher/classes", request);
        Assert.Equal(HttpStatusCode.Created, createdResponse.StatusCode);
        var created = (await createdResponse.Content.ReadFromJsonAsync<TeacherClassView>())!;
        Assert.Equal("ЕГЭ 2027", created.Title);
        Assert.Equal("Описание класса", created.Description);
        Assert.Equal(90, created.DurationMinutes);
        Assert.Equal(1750.50m, created.PriceAmount);
        Assert.Equal("RUB", created.PriceCurrency);
        Assert.Equal("month", created.PriceBasis);
        Assert.True(created.AllowLessonChat);
        Assert.True(created.AllowPrivateMessages);
        Assert.Equal(northStudent, created.StudentMembershipId);
        Assert.Equal("individual", created.Kind);

        var replay = await client.PostAsJsonAsync("/api/v1/teacher/classes", request);
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        var replayed = (await replay.Content.ReadFromJsonAsync<TeacherClassView>())!;
        Assert.Equal(created.Id, replayed.Id);
        Assert.Equal("Описание класса", replayed.Description);
        Assert.Equal(created.DurationMinutes, replayed.DurationMinutes);
        Assert.Equal(created.PriceAmount, replayed.PriceAmount);
        Assert.True(replayed.AllowLessonChat);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/classes", request with { Title = "Other" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/classes", request with { Description = "Другое описание" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/classes", request with { DurationMinutes = 95 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/classes", request with { PriceAmount = 1900m })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/classes", request with { AllowLessonChat = false })).StatusCode);
        var listed = Assert.Single((await client.GetFromJsonAsync<List<TeacherClassView>>("/api/v1/teacher/classes"))!);
        Assert.Equal(created.Id, listed.Id);
        Assert.Equal("Описание класса", listed.Description);
        Assert.Equal(90, listed.DurationMinutes);
        Assert.Equal(1750.50m, listed.PriceAmount);
        Assert.True(listed.AllowLessonChat);
        Assert.True(listed.AllowPrivateMessages);

        // Old callers can omit all optional settings; absent settings stay null/false.
        var defaultResponse = await client.PostAsJsonAsync("/api/v1/teacher/classes",
            new TeacherCreateClassRequest(Guid.NewGuid(), northStudent, "Old client"));
        Assert.Equal(HttpStatusCode.Created, defaultResponse.StatusCode);
        var defaultClass = (await defaultResponse.Content.ReadFromJsonAsync<TeacherClassView>())!;
        Assert.Null(defaultClass.DurationMinutes);
        Assert.Null(defaultClass.PriceAmount);
        Assert.Null(defaultClass.PriceCurrency);
        Assert.Null(defaultClass.PriceBasis);
        Assert.False(defaultClass.AllowLessonChat);
        Assert.False(defaultClass.AllowPrivateMessages);

        var southLogin = (await (await LoginAsync(client, "class-south", "class-south@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", southLogin.AccessToken);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherClassView>>("/api/v1/teacher/classes"))!);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/v1/teacher/classes",
                new TeacherCreateClassRequest(Guid.NewGuid(), northStudent, "North from south"))).StatusCode);
    }


    [Fact]
    public async Task IndividualClassEditArchiveRestorePreservesStudentAndBlocksStaleRevisions()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "manage-north", "manage-north@example.invalid", "owner");
        var south = await SeedAsync(factory, "manage-south", "manage-south@example.invalid", "owner");
        var studentId = await SeedStudentAsync(factory, north.WorkspaceId, "Synthetic class learner", true);
        using var client = factory.CreateClient();
        var login = (await (await LoginAsync(client, "manage-north", "manage-north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);
        var create = await client.PostAsJsonAsync("/api/v1/teacher/classes",
            new TeacherCreateClassRequest(Guid.NewGuid(), studentId, "Edit me", "Initial",
                DurationMinutes: 60, PriceAmount: 250m, PriceCurrency: "RUB", PriceBasis: "lesson"));
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var original = (await create.Content.ReadFromJsonAsync<TeacherClassView>())!;
        Assert.Equal(1, original.Revision);
        var path = $"/api/v1/teacher/classes/{original.Id}";

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PatchAsJsonAsync(path, new TeacherUpdateClassRequest(0, "Invalid"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PatchAsJsonAsync(path,
                new TeacherUpdateClassRequest(1, "Invalid", PriceAmount: 2.001m, PriceCurrency: "RUB", PriceBasis: "lesson"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PatchAsJsonAsync(path,
                new TeacherUpdateClassRequest(1, "Invalid", DurationMinutes: 14))).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PatchAsJsonAsync(path,
                new TeacherUpdateClassRequest(1, original.Title, original.Description,
                    DurationMinutes: 60, PriceAmount: 250m, PriceCurrency: "RUB", PriceBasis: "lesson"))).StatusCode);
        var unchanged = Assert.Single((await client.GetFromJsonAsync<List<TeacherClassView>>("/api/v1/teacher/classes"))!);
        Assert.Equal(1, unchanged.Revision);

        var editedResponse = await client.PatchAsJsonAsync(path,
            new TeacherUpdateClassRequest(1, "Updated title", "Updated description",
                DurationMinutes: 120, AllowLessonChat: true));
        Assert.Equal(HttpStatusCode.OK, editedResponse.StatusCode);
        var edited = (await editedResponse.Content.ReadFromJsonAsync<TeacherClassView>())!;
        Assert.Equal(2, edited.Revision);
        Assert.Equal("Updated title", edited.Title);
        Assert.Equal("Updated description", edited.Description);
        Assert.Equal(120, edited.DurationMinutes);
        Assert.Null(edited.PriceAmount);
        Assert.True(edited.AllowLessonChat);
        Assert.Equal(studentId, edited.StudentMembershipId);

        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PatchAsJsonAsync(path, new TeacherUpdateClassRequest(1, "Stale"))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path + "/archive", new TeacherClassRevisionRequest(1))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(path + "/archive", new TeacherClassRevisionRequest(0))).StatusCode);

        var archivedResponse = await client.PostAsJsonAsync(path + "/archive", new TeacherClassRevisionRequest(2));
        Assert.Equal(HttpStatusCode.OK, archivedResponse.StatusCode);
        var archived = (await archivedResponse.Content.ReadFromJsonAsync<TeacherClassView>())!;
        Assert.True(archived.IsArchived);
        Assert.Equal(3, archived.Revision);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PatchAsJsonAsync(path, new TeacherUpdateClassRequest(3, "Cannot edit archive"))).StatusCode);
        var repeatArchive = await client.PostAsJsonAsync(path + "/archive", new TeacherClassRevisionRequest(3));
        Assert.Equal(HttpStatusCode.OK, repeatArchive.StatusCode);
        Assert.Equal(3, (await repeatArchive.Content.ReadFromJsonAsync<TeacherClassView>())!.Revision);

        var restoredResponse = await client.PostAsJsonAsync(path + "/restore", new TeacherClassRevisionRequest(3));
        Assert.Equal(HttpStatusCode.OK, restoredResponse.StatusCode);
        var restored = (await restoredResponse.Content.ReadFromJsonAsync<TeacherClassView>())!;
        Assert.False(restored.IsArchived);
        Assert.Equal(4, restored.Revision);
        Assert.Equal("Updated title", restored.Title);
        var listed = Assert.Single((await client.GetFromJsonAsync<List<TeacherClassView>>("/api/v1/teacher/classes"))!);
        Assert.Equal(restored.Id, listed.Id);
        Assert.Equal(4, listed.Revision);
        Assert.Contains((await client.GetFromJsonAsync<List<TeacherStudentView>>("/api/v1/teacher/students"))!,
            item => item.MembershipId == studentId);

        var southLogin = (await (await LoginAsync(client, "manage-south", "manage-south@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", southLogin.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PatchAsJsonAsync(path, new TeacherUpdateClassRequest(4, "Foreign"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(path + "/archive", new TeacherClassRevisionRequest(4))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(path + "/restore", new TeacherClassRevisionRequest(4))).StatusCode);
    }



    [Fact]
    public async Task GroupClassesPersistIndependentEnrollmentAndEnforceCapacityAndWorkspace()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "group-north", "group-north@example.invalid", "owner");
        await SeedAsync(factory, "group-south", "group-south@example.invalid", "owner");
        var first = await SeedStudentAsync(factory, north.WorkspaceId, "Synthetic group learner one", true);
        var second = await SeedStudentAsync(factory, north.WorkspaceId, "Synthetic group learner two", true);
        using var teacher = factory.CreateClient();
        var auth = (await (await LoginAsync(teacher, "group-north", "group-north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        teacher.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);

        var program = await SeedProgramAsync(factory, north.WorkspaceId);
        var newStudentResponse = await teacher.PostAsJsonAsync("/api/v1/teacher/students",
            new TeacherCreateStudentRequest(Guid.NewGuid(), program, "Synthetic invited group learner"));
        Assert.Equal(HttpStatusCode.Created, newStudentResponse.StatusCode);
        var invited = (await newStudentResponse.Content.ReadFromJsonAsync<TeacherCreateStudentResponse>())!;

        var create = new TeacherCreateGroupRequest(Guid.NewGuid(), "  ЕГЭ групповое  ",
            [first, second], "Описание группы", "mint", Capacity: 3, AutoApproveInvites: false,
            DurationMinutes: 90, PriceAmount: 1900m, PriceCurrency: "RUB", PriceBasis: "month");
        Assert.Equal(HttpStatusCode.BadRequest,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/groups",
                create with { RequestId = Guid.NewGuid(), MemberIds = [first, first] })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/groups",
                create with { RequestId = Guid.NewGuid(), Capacity = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/groups",
                create with { RequestId = Guid.NewGuid(), Capacity = 21 })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/groups",
                create with { RequestId = Guid.NewGuid(), MemberIds = [first, Guid.NewGuid()] })).StatusCode);
        var result = await teacher.PostAsJsonAsync("/api/v1/teacher/groups", create);
        Assert.Equal(HttpStatusCode.Created, result.StatusCode);
        var group = (await result.Content.ReadFromJsonAsync<TeacherGroupClassView>())!;
        Assert.Equal("group", group.Kind);
        Assert.Equal("ЕГЭ групповое", group.Title);
        Assert.Equal(3, group.Capacity);
        Assert.False(group.AutoApproveInvites);
        Assert.Equal(2, group.Members.Count);
        Assert.All(group.Members, p => Assert.True(p.IsApproved));
        Assert.Equal(1, group.Revision);
        var groupPath = "/api/v1/teacher/groups/" + group.Id;
        var replay = await teacher.PostAsJsonAsync("/api/v1/teacher/groups", create);
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal(group.Id, (await replay.Content.ReadFromJsonAsync<TeacherGroupClassView>())!.Id);
        Assert.Equal(HttpStatusCode.Conflict,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/groups", create with { Title = "Other" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await teacher.PatchAsJsonAsync(groupPath,
                new TeacherUpdateGroupRequest(0, "Invalid"))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await teacher.PatchAsJsonAsync(groupPath,
                new TeacherUpdateGroupRequest(999, "Stale"))).StatusCode);

        var edit = await teacher.PatchAsJsonAsync(groupPath,
            new TeacherUpdateGroupRequest(1, "ЕГЭ группа обновлена", [first, second], "Описание группы",
                "sky", Capacity: 3, AutoApproveInvites: false, DurationMinutes: 90,
                PriceAmount: 1900m, PriceCurrency: "RUB", PriceBasis: "month"));
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);
        var edited = (await edit.Content.ReadFromJsonAsync<TeacherGroupClassView>())!;
        Assert.Equal(2, edited.Revision);
        Assert.Equal("sky", edited.CoverStyle);
        Assert.Equal(2, edited.Members.Count);

        var issuedResponse = await teacher.PostAsJsonAsync(groupPath + "/invitation",
            new TeacherClassRevisionRequest(2));
        Assert.Equal(HttpStatusCode.OK, issuedResponse.StatusCode);
        var issued = (await issuedResponse.Content.ReadFromJsonAsync<ClassInviteIssueResponse>())!;
        Assert.Equal(64, issued.Code.Length);
        Assert.Equal(3, issued.Revision);
        Assert.DoesNotContain(issued.Code,
            await (await teacher.GetAsync("/api/v1/teacher/groups")).Content.ReadAsStringAsync());

        using var student = factory.CreateClient();
        var studentLogin = await student.PostAsJsonAsync("/api/v1/student-sessions",
            new { workspace = "group-north", code = invited.InviteCode });
        Assert.Equal(HttpStatusCode.OK, studentLogin.StatusCode);
        var token = (await studentLogin.Content.ReadFromJsonAsync<TestingHosting.Platform.StudentSessions.StudentSessionResponse>())!;
        student.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await student.PostAsJsonAsync("/api/v1/student/groups/invitations/accept",
                new AcceptClassInvitationRequest("wrong"))).StatusCode);
        var join = await student.PostAsJsonAsync("/api/v1/student/groups/invitations/accept",
            new AcceptClassInvitationRequest(issued.Code));
        Assert.Equal(HttpStatusCode.OK, join.StatusCode);
        group = Assert.Single((await teacher.GetFromJsonAsync<List<TeacherGroupClassView>>("/api/v1/teacher/groups"))!);
        Assert.Equal(4, group.Revision);
        Assert.Equal(3, group.Members.Count);
        Assert.False(group.Members.Single(x => x.MembershipId == invited.MembershipId).IsApproved);

        var approvedResponse = await teacher.PostAsJsonAsync(groupPath + "/members/" + invited.MembershipId + "/approve",
            new TeacherClassRevisionRequest(4));
        Assert.Equal(HttpStatusCode.OK, approvedResponse.StatusCode);
        group = (await approvedResponse.Content.ReadFromJsonAsync<TeacherGroupClassView>())!;
        Assert.Equal(5, group.Revision);
        Assert.True(group.Members.Single(x => x.MembershipId == invited.MembershipId).IsApproved);

        Assert.Equal(HttpStatusCode.OK,
            (await teacher.PostAsJsonAsync(groupPath + "/invitation/revoke",
                new TeacherClassRevisionRequest(5))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await student.PostAsJsonAsync("/api/v1/student/groups/invitations/accept",
                new AcceptClassInvitationRequest(issued.Code))).StatusCode);
        var archive = await teacher.PostAsJsonAsync(groupPath + "/archive", new TeacherClassRevisionRequest(6));
        Assert.Equal(HttpStatusCode.OK, archive.StatusCode);
        Assert.True((await archive.Content.ReadFromJsonAsync<TeacherGroupClassView>())!.IsArchived);
        var restore = await teacher.PostAsJsonAsync(groupPath + "/restore", new TeacherClassRevisionRequest(7));
        Assert.Equal(HttpStatusCode.OK, restore.StatusCode);
        Assert.False((await restore.Content.ReadFromJsonAsync<TeacherGroupClassView>())!.IsArchived);

        var resized = await teacher.PatchAsJsonAsync(groupPath,
            new TeacherUpdateGroupRequest(8, "Осталась пара", [first, invited.MembershipId],
                "Описание", Capacity: 2, AutoApproveInvites: true));
        Assert.Equal(HttpStatusCode.OK, resized.StatusCode);
        group = (await resized.Content.ReadFromJsonAsync<TeacherGroupClassView>())!;
        Assert.Equal(2, group.Members.Count);
        Assert.DoesNotContain(group.Members, x => x.MembershipId == second);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Equal(1, await db.TeacherGroupClasses.CountAsync());
            Assert.Equal(2, await db.TeacherGroupEnrollments.CountAsync());
            Assert.Equal(0, await db.TeacherClasses.CountAsync());
            Assert.Equal(3, await db.WorkspaceStudentMemberships.CountAsync());
        }
        var southAuth = (await (await LoginAsync(teacher, "group-south", "group-south@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        teacher.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", southAuth.AccessToken);
        Assert.Empty((await teacher.GetFromJsonAsync<List<TeacherGroupClassView>>("/api/v1/teacher/groups"))!);
        Assert.Equal(HttpStatusCode.NotFound,
            (await teacher.PostAsJsonAsync(groupPath + "/archive",
                new TeacherClassRevisionRequest(9))).StatusCode);
    }

    [Fact]
    public async Task ClassCoverAndOneTimeInvitesRequireRightWorkspaceAndStudent()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "invite-north", "invite-north@example.invalid", "owner");
        await SeedAsync(factory, "invite-south", "invite-south@example.invalid", "owner");
        var program = await SeedProgramAsync(factory, north.WorkspaceId);
        using var teacher = factory.CreateClient();
        var northSession = (await (await LoginAsync(teacher, "invite-north", "invite-north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        teacher.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", northSession.AccessToken);
        var studentCreate = await teacher.PostAsJsonAsync("/api/v1/teacher/students",
            new TeacherCreateStudentRequest(Guid.NewGuid(), program, "Synthetic invited student"));
        Assert.Equal(HttpStatusCode.Created, studentCreate.StatusCode);
        var student = (await studentCreate.Content.ReadFromJsonAsync<TeacherCreateStudentResponse>())!;
        var otherCreate = await teacher.PostAsJsonAsync("/api/v1/teacher/students",
            new TeacherCreateStudentRequest(Guid.NewGuid(), program, "Synthetic other student"));
        var other = (await otherCreate.Content.ReadFromJsonAsync<TeacherCreateStudentResponse>())!;
        Assert.Equal(HttpStatusCode.BadRequest,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/classes",
                new TeacherCreateClassRequest(Guid.NewGuid(), student.MembershipId, "Invalid", CoverStyle: "external://url"))).StatusCode);
        var createdResponse = await teacher.PostAsJsonAsync("/api/v1/teacher/classes",
            new TeacherCreateClassRequest(Guid.NewGuid(), student.MembershipId, "Test class", CoverStyle: "Sky"));
        Assert.Equal(HttpStatusCode.Created, createdResponse.StatusCode);
        var created = (await createdResponse.Content.ReadFromJsonAsync<TeacherClassView>())!;
        Assert.Equal("sky", created.CoverStyle);
        Assert.Equal(1, created.Revision);
        Assert.Null(created.InvitationStatus);
        var path = $"/api/v1/teacher/classes/{created.Id}";
        Assert.Equal(HttpStatusCode.BadRequest,
            (await teacher.PatchAsJsonAsync(path,
                new TeacherUpdateClassRequest(1, "Change", CoverStyle: "https://invalid.example"))).StatusCode);
        var edit = await teacher.PatchAsJsonAsync(path,
            new TeacherUpdateClassRequest(1, "Test class", CoverStyle: "mint"));
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);
        var edited = (await edit.Content.ReadFromJsonAsync<TeacherClassView>())!;
        Assert.Equal("mint", edited.CoverStyle);
        Assert.Equal(2, edited.Revision);
        // Old clients may omit CoverStyle without resetting the teacher's selected cover.
        var oldClientEdit = await teacher.PatchAsJsonAsync(path,
            new TeacherUpdateClassRequest(2, "Test class"));
        Assert.Equal(HttpStatusCode.OK, oldClientEdit.StatusCode);
        var oldClientResult = (await oldClientEdit.Content.ReadFromJsonAsync<TeacherClassView>())!;
        Assert.Equal("mint", oldClientResult.CoverStyle);
        Assert.Equal(2, oldClientResult.Revision);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await teacher.PostAsJsonAsync(path + "/invitation", new TeacherClassRevisionRequest(0))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await teacher.PostAsJsonAsync(path + "/invitation", new TeacherClassRevisionRequest(1))).StatusCode);
        var issuedResponse = await teacher.PostAsJsonAsync(path + "/invitation", new TeacherClassRevisionRequest(2));
        Assert.Equal(HttpStatusCode.OK, issuedResponse.StatusCode);
        var issued = (await issuedResponse.Content.ReadFromJsonAsync<ClassInviteIssueResponse>())!;
        Assert.Equal(64, issued.Code.Length);
        Assert.Equal(3, issued.Revision);
        var listed = Assert.Single((await teacher.GetFromJsonAsync<List<TeacherClassView>>("/api/v1/teacher/classes"))!);
        Assert.Equal("pending", listed.InvitationStatus);
        Assert.Equal(3, listed.Revision);
        Assert.DoesNotContain(issued.Code, await (await teacher.GetAsync("/api/v1/teacher/classes")).Content.ReadAsStringAsync());

        using var learner = factory.CreateClient();
        var login = await learner.PostAsJsonAsync("/api/v1/student-sessions",
            new { workspace = "invite-north", code = student.InviteCode });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var studentSession = (await login.Content.ReadFromJsonAsync<TestingHosting.Platform.StudentSessions.StudentSessionResponse>())!;
        learner.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", studentSession.AccessToken);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await learner.PostAsJsonAsync("/api/v1/student/classes/invitations/accept",
                new AcceptClassInvitationRequest("invalid"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await learner.PostAsJsonAsync("/api/v1/student/classes/invitations/accept",
                new AcceptClassInvitationRequest(new string('A', 64)))).StatusCode);
        using var otherLearner = factory.CreateClient();
        var otherLogin = await otherLearner.PostAsJsonAsync("/api/v1/student-sessions",
            new { workspace = "invite-north", code = other.InviteCode });
        var otherSession = (await otherLogin.Content.ReadFromJsonAsync<TestingHosting.Platform.StudentSessions.StudentSessionResponse>())!;
        otherLearner.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", otherSession.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherLearner.PostAsJsonAsync("/api/v1/student/classes/invitations/accept",
                new AcceptClassInvitationRequest(issued.Code))).StatusCode);

        Assert.Equal(HttpStatusCode.OK,
            (await learner.PostAsJsonAsync("/api/v1/student/classes/invitations/accept",
                new AcceptClassInvitationRequest(issued.Code))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await learner.PostAsJsonAsync("/api/v1/student/classes/invitations/accept",
                new AcceptClassInvitationRequest(issued.Code))).StatusCode);
        listed = Assert.Single((await teacher.GetFromJsonAsync<List<TeacherClassView>>("/api/v1/teacher/classes"))!);
        Assert.Equal("accepted", listed.InvitationStatus);
        Assert.Equal(4, listed.Revision);
        Assert.NotNull(listed.InvitationAcceptedAt);

        var renewed = (await (await teacher.PostAsJsonAsync(path + "/invitation",
            new TeacherClassRevisionRequest(4))).Content.ReadFromJsonAsync<ClassInviteIssueResponse>())!;
        Assert.NotEqual(issued.Code, renewed.Code);
        Assert.Equal(HttpStatusCode.OK,
            (await teacher.PostAsJsonAsync(path + "/invitation/revoke",
                new TeacherClassRevisionRequest(5))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await learner.PostAsJsonAsync("/api/v1/student/classes/invitations/accept",
                new AcceptClassInvitationRequest(renewed.Code))).StatusCode);
        var third = (await (await teacher.PostAsJsonAsync(path + "/invitation",
            new TeacherClassRevisionRequest(6))).Content.ReadFromJsonAsync<ClassInviteIssueResponse>())!;
        Assert.Equal(HttpStatusCode.OK,
            (await teacher.PostAsJsonAsync(path + "/archive", new TeacherClassRevisionRequest(7))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await learner.PostAsJsonAsync("/api/v1/student/classes/invitations/accept",
                new AcceptClassInvitationRequest(third.Code))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await teacher.PostAsJsonAsync(path + "/invitation", new TeacherClassRevisionRequest(8))).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Equal(2, await db.Students.CountAsync());
            var row = await db.TeacherClasses.SingleAsync(x => x.Id == created.Id);
            Assert.Null(row.InvitationCodeHash);
            Assert.Equal("revoked", row.InvitationStatus);
        }
        var southSession = (await (await LoginAsync(teacher, "invite-south", "invite-south@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        teacher.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", southSession.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound,
            (await teacher.PostAsJsonAsync(path + "/invitation", new TeacherClassRevisionRequest(8))).StatusCode);
    }

    [Fact]
    public async Task NativeHomeworkIsTenantScopedAndTextAnswerIsIdempotentWithoutInventedScore()
    {
        await ResetAsync(factory);
        var owner = await SeedAsync(factory, "native-a", "native-a@example.invalid", "owner");
        await SeedAsync(factory, "native-b", "native-b@example.invalid", "owner");
        var program = await SeedProgramAsync(factory, owner.WorkspaceId);
        using var teacher = factory.CreateClient();
        var login = (await (await LoginAsync(teacher, "native-a", "native-a@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        teacher.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);
        var created = await teacher.PostAsJsonAsync("/api/v1/teacher/students",
            new TeacherCreateStudentRequest(Guid.NewGuid(), program, "Synthetic"));
        var student = (await created.Content.ReadFromJsonAsync<TeacherCreateStudentResponse>())!;
        var taskRequest = new CreateNativeTaskRequest(Guid.NewGuid(), program, "Write", "Explain your answer");
        var taskResponse = await teacher.PostAsJsonAsync("/api/v1/teacher/homework/native/tasks", taskRequest);
        Assert.Equal(HttpStatusCode.Created, taskResponse.StatusCode);
        var task = (await taskResponse.Content.ReadFromJsonAsync<NativeTaskView>())!;
        Assert.Equal(HttpStatusCode.OK,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/homework/native/tasks", taskRequest)).StatusCode);
        var assignRequest = new AssignNativeTaskRequest(Guid.NewGuid(), task.Id, [student.MembershipId], 24);
        Assert.Equal(HttpStatusCode.Created,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/homework/native/assignments", assignRequest)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/homework/native/assignments", assignRequest)).StatusCode);

        using var foreign = factory.CreateClient();
        var foreignLogin = (await (await LoginAsync(foreign, "native-b", "native-b@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        foreign.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", foreignLogin.AccessToken);
        Assert.Empty((await foreign.GetFromJsonAsync<List<NativeTaskView>>(
            "/api/v1/teacher/homework/native/tasks"))!);
        Assert.Empty((await foreign.GetFromJsonAsync<List<NativeAssignmentView>>(
            "/api/v1/teacher/homework/native/assignments"))!);
        Assert.Equal(HttpStatusCode.NotFound,
            (await foreign.PostAsJsonAsync("/api/v1/teacher/homework/native/assignments", assignRequest)).StatusCode);

        using var learner = factory.CreateClient();
        var session = (await (await learner.PostAsJsonAsync("/api/v1/student-sessions",
            new { workspace = "native-a", code = student.InviteCode }))
            .Content.ReadFromJsonAsync<TestingHosting.Platform.StudentSessions.StudentSessionResponse>())!;
        learner.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        var assignment = Assert.Single((await learner.GetFromJsonAsync<List<NativeAssignmentView>>(
            "/api/v1/homework/native/assignments"))!);
        Assert.Null(assignment.Answer);
        var gradeRequest = new GradeNativeAnswerRequest(Guid.NewGuid(), assignment.Id, 85, "Good reasoning");
        Assert.Equal(HttpStatusCode.Conflict,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/homework/native/grades", gradeRequest)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await foreign.PostAsJsonAsync("/api/v1/teacher/homework/native/grades", gradeRequest)).StatusCode);
        var submit = new SubmitNativeAnswerRequest(Guid.NewGuid(), assignment.Id, "My explanation");
        Assert.Equal(HttpStatusCode.Created,
            (await learner.PostAsJsonAsync("/api/v1/homework/native/submissions", submit)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await learner.PostAsJsonAsync("/api/v1/homework/native/submissions", submit)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await learner.PostAsJsonAsync("/api/v1/homework/native/submissions",
                submit with { Answer = "Different answer" })).StatusCode);
        var submitted = Assert.Single((await teacher.GetFromJsonAsync<List<NativeAssignmentView>>(
            "/api/v1/teacher/homework/native/assignments"))!);
        Assert.Equal("My explanation", submitted.Answer);
        Assert.NotNull(submitted.SubmittedAt);
        Assert.Null(submitted.ScorePercent);
        Assert.Null(submitted.TeacherFeedback);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/homework/native/grades",
                gradeRequest with { ScorePercent = 101 })).StatusCode);
        Assert.Equal(HttpStatusCode.Created,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/homework/native/grades", gradeRequest)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/homework/native/grades", gradeRequest)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/homework/native/grades",
                gradeRequest with { ScorePercent = 90 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await teacher.PostAsJsonAsync("/api/v1/teacher/homework/native/grades",
                gradeRequest with { RequestId = Guid.NewGuid() })).StatusCode);
        var graded = Assert.Single((await learner.GetFromJsonAsync<List<NativeAssignmentView>>(
            "/api/v1/homework/native/assignments"))!);
        Assert.Equal(85, graded.ScorePercent);
        Assert.Equal("Good reasoning", graded.TeacherFeedback);
        Assert.NotNull(graded.GradedAt);
    }

    [Fact]
    public async Task FirstOwnerRegistrationClaimsImportedWorkspaceOnlyOnce()
    {
        await ResetAsync(factory);
        Guid workspaceId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var workspace = new Workspace { Id = Guid.NewGuid(), Slug = "claimed-workspace" };
            db.Workspaces.Add(workspace);
            await db.SaveChangesAsync();
            workspaceId = workspace.Id;
        }
        var imported = await SeedStudentAsync(factory, workspaceId, "Imported", true);
        await SeedAsync(factory, "foreign-workspace", "other@example.invalid", "owner");
        using var client = factory.CreateClient();
        const string path = "/api/v1/teacher-registrations";
        var request = new TeacherOwnerRegistrationRequest(
            "claimed-workspace", "new-owner@example.invalid", Password, ClaimCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(path, request with { ClaimCode = "wrong-code-value-long-enough-12345" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(path, request with { Workspace = "foreign-workspace" })).StatusCode);

        var attempts = await Task.WhenAll(
            client.PostAsJsonAsync(path, request),
            client.PostAsJsonAsync(path, request with { Email = "second@example.invalid" }));
        Assert.Single(attempts, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Single(attempts, x => x.StatusCode == HttpStatusCode.Conflict);
        var winnerEmail = attempts[0].StatusCode == HttpStatusCode.Created
            ? request.Email! : "second@example.invalid";
        var session = await (await LoginAsync(client, "claimed-workspace", winnerEmail, Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        Assert.Equal(imported, Assert.Single((await client.GetFromJsonAsync<List<TeacherStudentView>>(
            "/api/v1/teacher/students"))!).MembershipId);
        await using var verify = factory.Services.CreateAsyncScope();
        var verifyDb = verify.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Equal(2, await verifyDb.Workspaces.CountAsync());
        Assert.Single(await verifyDb.WorkspaceMemberships.Where(x => x.WorkspaceId == workspaceId).ToListAsync());
        Assert.Equal("owner", (await verifyDb.WorkspaceMemberships.SingleAsync(x => x.WorkspaceId == workspaceId)).Role);
    }

    [Fact]
    public async Task ArchivingStudentRevokesCodeButKeepsLessonHistoryAndOtherWorkspace()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "archive-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "archive-south", "south@example.invalid", "teacher");
        var program = await SeedProgramAsync(factory, north.WorkspaceId);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "Other", true);
        using var client = factory.CreateClient();
        var session = await (await LoginAsync(client, "archive-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        var create = await client.PostAsJsonAsync("/api/v1/teacher/students",
            new TeacherCreateStudentRequest(Guid.NewGuid(), program, "Synthetic"));
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var student = await create.Content.ReadFromJsonAsync<TeacherCreateStudentResponse>();
        Assert.NotNull(student);
        await SeedHistoryAsync(factory, north.WorkspaceId, [student.MembershipId]);

        var path = $"/api/v1/teacher/students/{student.MembershipId}/archive";
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsync($"/api/v1/teacher/students/{foreign}/archive", null)).StatusCode);
        var archived = await client.PostAsync(path, null);
        Assert.Equal(HttpStatusCode.OK, archived.StatusCode);
        Assert.False((await archived.Content.ReadFromJsonAsync<TeacherArchiveStudentResponse>())!.IsActive);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync(path, null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/teacher/students/{student.MembershipId}")).StatusCode);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherStudentView>>(
            "/api/v1/teacher/students"))!);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/v1/student-sessions",
                new { workspace = "archive-north", code = student.InviteCode })).StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Single(await db.Lessons.AsNoTracking().ToListAsync());
            Assert.Single(await db.LessonParticipants.AsNoTracking().ToListAsync());
            Assert.True((await db.WorkspaceStudentMemberships.AsNoTracking()
                .SingleAsync(x => x.Id == foreign)).IsActive);
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(path, null)).StatusCode);
    }

    [Fact]
    public async Task LessonAndHomeworkCommitTogetherOrRollBackAndReplayAsOneOperation()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "combined-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "combined-south", "south@example.invalid", "teacher");
        var first = await SeedStudentAsync(factory, north.WorkspaceId, "First", true);
        var second = await SeedStudentAsync(factory, north.WorkspaceId, "Second", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "Foreign", true);
        await SeedHomeworkAsync(factory, north.WorkspaceId, first);
        Guid catalog;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            catalog = (await db.HomeworkCatalogItems.AsNoTracking().SingleAsync()).Id;
        }
        var lesson = new TeacherLessonWriteRequest(Guid.NewGuid(), DateTimeOffset.UtcNow,
        [
            new(first, 60, "6", "Synthetic topic", "Present"),
            new(second, 45, "6", "Synthetic topic", "Absent")
        ]);
        var request = new TeacherLessonHomeworkRequest(lesson, catalog, 48);
        const string path = "/api/v1/teacher/lessons-with-homework";
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
        var session = await (await LoginAsync(client, "combined-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(path, request with
            {
                Lesson = lesson with
                {
                    RequestId = Guid.NewGuid(), Participants = [new(foreign, 60, null, null, "Present")]
                }
            })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Empty(await db.Lessons.AsNoTracking().ToListAsync());
            Assert.Single(await db.HomeworkAssignments.AsNoTracking().ToListAsync());
            await db.HomeworkAssignments.ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.SubmittedAt, DateTimeOffset.UtcNow)
                .SetProperty(x => x.Status, "submitted"));
        }

        var responses = await Task.WhenAll(Enumerable.Range(0, 3)
            .Select(_ => client.PostAsJsonAsync(path, request)));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Equal(2, responses.Count(x => x.StatusCode == HttpStatusCode.OK));
        var returned = await responses[0].Content.ReadFromJsonAsync<TeacherLessonHomeworkResponse>();
        Assert.NotNull(returned);
        Assert.Equal(2, returned.Lesson.ParticipantCount);
        Assert.Equal(2, returned.Homework!.AssignmentIds.Count);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with { DeadlineHours = 72 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with
            {
                CatalogItemId = null, DeadlineHours = null
            })).StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var saved = Assert.Single(await db.Lessons.AsNoTracking().Include(x => x.Participants).ToListAsync());
            Assert.Equal(2, saved.Participants.Count);
            Assert.Contains(saved.Participants, x => x.MembershipId == first && x.AttendanceStatus == "Present");
            Assert.Contains(saved.Participants, x => x.MembershipId == second && x.AttendanceStatus == "Absent");
            Assert.Equal(3, await db.HomeworkAssignments.CountAsync());
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
    }

    [Fact]
    public async Task TeacherCreatesStudentWithRepeatablePrivateCodeAndCannotUseForeignProgram()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "create-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "create-south", "south@example.invalid", "teacher");
        var program = await SeedProgramAsync(factory, north.WorkspaceId);
        var foreignProgram = await SeedProgramAsync(factory, south.WorkspaceId);
        using var client = factory.CreateClient();
        const string path = "/api/v1/teacher/students";
        var request = new TeacherCreateStudentRequest(Guid.NewGuid(), program, " Synthetic Student ",
            new TeacherStudentProfile(Grade: " 11 ", GroupId: " Group A ", TargetScore: "85",
                ParentName: "Synthetic parent", Notes: "Initial notes"));
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
        var session = await (await LoginAsync(client, "create-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(path, request with
            {
                RequestId = Guid.NewGuid(), ProgramId = foreignProgram
            })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(path, request with
            {
                RequestId = Guid.NewGuid(), StudentName = " "
            })).StatusCode);

        var responses = await Task.WhenAll(Enumerable.Range(0, 4)
            .Select(_ => client.PostAsJsonAsync(path, request)));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Equal(3, responses.Count(x => x.StatusCode == HttpStatusCode.OK));
        var results = await Task.WhenAll(responses.Select(x =>
            x.Content.ReadFromJsonAsync<TeacherCreateStudentResponse>()));
        var created = results[0];
        Assert.NotNull(created);
        Assert.Equal("Synthetic Student", created.StudentName);
        Assert.Equal("11", created.Profile.Grade);
        Assert.Equal("Group A", created.Profile.GroupId);
        Assert.Equal(32, created.InviteCode.Length);
        foreach (var result in results)
            Assert.Equal(created.InviteCode, result!.InviteCode);

        Assert.DoesNotContain(created.InviteCode, await client.GetStringAsync(path));
        var listed = Assert.Single((await client.GetFromJsonAsync<List<TeacherStudentView>>(path))!);
        Assert.Equal("11", listed.Grade);
        Assert.Equal("Group A", listed.GroupId);
        Assert.Equal("Synthetic parent", listed.ParentName);
        Assert.Equal("Initial notes", listed.Notes);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with { StudentName = "Other" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with
            {
                Profile = request.Profile! with { TargetScore = "90" }
            })).StatusCode);
        var studentSession = await client.PostAsJsonAsync("/api/v1/student-sessions",
            new { workspace = "create-north", code = created.InviteCode });
        Assert.Equal(HttpStatusCode.OK, studentSession.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/v1/student-sessions",
                new { workspace = "create-south", code = created.InviteCode })).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Single(await db.Students.AsNoTracking().ToListAsync());
            var membership = Assert.Single(await db.WorkspaceStudentMemberships.AsNoTracking().ToListAsync());
            Assert.Equal(created.MembershipId, membership.Id);
            Assert.Equal("85", membership.TargetScore);
            Assert.NotEqual(System.Text.Encoding.UTF8.GetBytes(created.InviteCode), membership.CodeHash);
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
    }

    [Fact]
    public async Task TeacherCorrectsPairedLessonWithoutChangingLinkedHomeworkOrSubscriptions()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "correct-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "correct-south", "south@example.invalid", "owner");
        var first = await SeedStudentAsync(factory, north.WorkspaceId, "First", true);
        var second = await SeedStudentAsync(factory, north.WorkspaceId, "Second", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "Foreign", true);
        var catalog = await SeedCatalogAsync(factory, north.WorkspaceId, first);
        await SeedHistoryAsync(factory, south.WorkspaceId, [foreign]);
        Guid foreignLesson;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            foreignLesson = await db.Lessons.Where(x => x.WorkspaceId == south.WorkspaceId)
                .Select(x => x.Id).SingleAsync();
        }
        using var client = factory.CreateClient();
        var route = "/api/v1/teacher/lessons/";
        var unauthorized = await client.PostAsJsonAsync(route + foreignLesson + "/correct",
            new TeacherLessonCorrectionRequest(new string('A', 64), DateTimeOffset.UtcNow, []));
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);

        var session = (await (await LoginAsync(client, "correct-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        var when = DateTimeOffset.UtcNow.AddDays(-2);
        var create = new TeacherLessonWriteRequest(Guid.NewGuid(), when,
        [
            new(first, 60, "6", "Initial topic", "Present"),
            new(second, 60, "13", "Other topic", "Present")
        ]);
        var response = await client.PostAsJsonAsync("/api/v1/teacher/lessons-with-homework",
            new TeacherLessonHomeworkRequest(create, catalog, 24));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<TeacherLessonHomeworkResponse>())!;
        var id = created.Lesson.LessonId;
        var correctionPath = route + id + "/correct";
        var source = Assert.Single((await client.GetFromJsonAsync<List<TeacherLessonView>>(route))!);
        Assert.Equal(64, source.Revision.Length);
        var initialAssignments = (await client.GetFromJsonAsync<List<TeacherHomeworkAssignmentView>>(
            "/api/v1/teacher/homework/assignments"))!;
        Assert.Equal(2, initialAssignments.Count);
        var subscription = await client.PostAsJsonAsync(
            "/api/v1/teacher/subscriptions/" + first,
            new TeacherSubscriptionWriteRequest(8, null, 1500m, null, null));
        Assert.Equal(HttpStatusCode.Created, subscription.StatusCode);

        var expected = source.Participants.ToDictionary(x => x.MembershipId);
        var correction = new TeacherLessonCorrectionRequest(source.Revision, source.LessonAt.AddMinutes(45),
        [
            new(first, 75, " 6, 7 ", " Revised topic ", "Absent"),
            new(second, 45, "13", "Other topic", "Present")
        ], Complete: true);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(
            route + foreignLesson + "/correct", correction)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
            correctionPath, correction with { Participants = [correction.Participants![0]] })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
            correctionPath, correction with {
                Participants = [new(first, 0, null, null, "Present"), correction.Participants![1]]
            })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(
            correctionPath, correction with { ExpectedRevision = null })).StatusCode);

        var saved = await client.PostAsJsonAsync(correctionPath, correction);
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var current = (await saved.Content.ReadFromJsonAsync<TeacherLessonView>())!;
        Assert.Equal(id, current.Id);
        Assert.NotNull(current.CompletedAt);
        Assert.Equal(source.LegacyLessonId, current.LegacyLessonId);
        Assert.NotEqual(source.Revision, current.Revision);
        Assert.Equal(source.LessonAt.AddMinutes(45), current.LessonAt);
        Assert.Equal(2, current.Participants.Count);
        Assert.Equal("Absent", current.Participants.Single(x => x.MembershipId == first).AttendanceStatus);
        Assert.Equal("Revised topic", current.Participants.Single(x => x.MembershipId == first).TopicComment);
        Assert.Equal(75, current.Participants.Single(x => x.MembershipId == first).DurationMinutes);
        Assert.Equal("Present", current.Participants.Single(x => x.MembershipId == second).AttendanceStatus);

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(correctionPath, correction)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(correctionPath,
            correction with { LessonAt = source.LessonAt.AddDays(3) })).StatusCode);
        var afterRead = Assert.Single((await client.GetFromJsonAsync<List<TeacherLessonView>>(route))!);
        Assert.Equal(current.Revision, afterRead.Revision);
        Assert.Equal(current.CompletedAt, afterRead.CompletedAt);
        var resultPath = route + id + "/participants/" + first + "/result";
        var feedback = new TeacherLessonFeedbackRequest(afterRead.Revision, "positive", "  Хорошая работа  ");
        var feedbackResponse = await client.PostAsJsonAsync(resultPath, feedback);
        Assert.Equal(HttpStatusCode.OK, feedbackResponse.StatusCode);
        var withFeedback = (await feedbackResponse.Content.ReadFromJsonAsync<TeacherLessonView>())!;
        Assert.Equal("Хорошая работа", withFeedback.Participants.Single(x => x.MembershipId == first).Feedback);
        Assert.Equal("positive", withFeedback.Participants.Single(x => x.MembershipId == first).Reaction);
        Assert.Equal(afterRead.Participants.Single(x => x.MembershipId == second), withFeedback.Participants.Single(x => x.MembershipId == second));
        Assert.Equal(afterRead.CompletedAt, withFeedback.CompletedAt);
        Assert.Equal(afterRead.Participants.Single(x => x.MembershipId == first).AttendanceStatus,
            withFeedback.Participants.Single(x => x.MembershipId == first).AttendanceStatus);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(resultPath, feedback)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(resultPath, feedback with { Feedback = "Stale update" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(resultPath, feedback with { Reaction = "invalid" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(resultPath, feedback with { Feedback = new string('a', 2001) })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(route + foreignLesson + "/participants/" + first + "/result", feedback)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(route + id + "/participants/" + Guid.NewGuid() + "/result", feedback)).StatusCode);
        var persistedResult = Assert.Single((await client.GetFromJsonAsync<List<TeacherLessonView>>(route))!);
        Assert.Equal(withFeedback.Revision, persistedResult.Revision);
        var afterAssignments = (await client.GetFromJsonAsync<List<TeacherHomeworkAssignmentView>>(
            "/api/v1/teacher/homework/assignments"))!;
        Assert.Equal(initialAssignments.Select(x => x.Id).Order(),
            afterAssignments.Select(x => x.Id).Order());
        Assert.Equal(initialAssignments.Select(x => x.DeadlineAt).Order(),
            afterAssignments.Select(x => x.DeadlineAt).Order());
        Assert.Single((await client.GetFromJsonAsync<List<TeacherSubscriptionView>>(
            "/api/v1/teacher/subscriptions"))!);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Equal(2, await db.LessonParticipants.CountAsync(x => x.LessonId == id));
            Assert.Equal(2, await db.HomeworkAssignments.CountAsync(x => x.WorkspaceId == north.WorkspaceId));
            Assert.Single(await db.Lessons.Where(x => x.WorkspaceId == north.WorkspaceId).ToListAsync());
            Assert.Equal("Present", await db.LessonParticipants.Where(x =>
                x.WorkspaceId == south.WorkspaceId).Select(x => x.AttendanceStatus).SingleAsync());
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(
            correctionPath, correction)).StatusCode);
    }

    [Fact]
    public async Task TeacherEditsExistingStudentSafelyWithExpectedSnapshotAndNoCodeChange()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "edit-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "edit-south", "south@example.invalid", "teacher");
        var program = await SeedProgramAsync(factory, north.WorkspaceId);
        var foreignId = await SeedStudentAsync(factory, south.WorkspaceId, "Foreign", true);
        using var client = factory.CreateClient();
        var createRequest = new TeacherCreateStudentRequest(Guid.NewGuid(), program, "Old Name",
            new TeacherStudentProfile(Grade: "10", ParentName: "Parent", Notes: "Original"));
        var url = "/api/v1/teacher/students";
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(url + "/" + foreignId + "/edit", new { studentName = "Hacked" })).StatusCode);
        var login = await (await LoginAsync(client, "edit-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(login);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);
        var create = await client.PostAsJsonAsync(url, createRequest);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = (await create.Content.ReadFromJsonAsync<TeacherCreateStudentResponse>())!;
        var path = url + "/" + created.MembershipId + "/edit";
        var expected = new TeacherStudentProfile(Grade: "10", ParentName: "Parent", Notes: "Original");
        var desired = expected with { Grade = "11", ParentName = null, Notes = "  Updated  " };
        var edit = new TeacherEditStudentRequest(" New Name ", desired, "Old Name", expected);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(url + "/" + foreignId + "/edit", edit)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(path, edit with { StudentName = "  " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(path, edit with {
                Profile = desired with { Notes = new string('x', 4097) }
            })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(path, edit with { ExpectedProfile = null })).StatusCode);

        var updatedResponse = await client.PostAsJsonAsync(path, edit);
        Assert.Equal(HttpStatusCode.OK, updatedResponse.StatusCode);
        var updated = (await updatedResponse.Content.ReadFromJsonAsync<TeacherStudentView>())!;
        Assert.Equal("New Name", updated.StudentName);
        Assert.Equal("11", updated.Grade);
        Assert.Null(updated.ParentName);
        Assert.Equal("Updated", updated.Notes);
        Assert.Equal(created.ProgramId, updated.ProgramId);
        Assert.Equal(created.MembershipId, updated.MembershipId);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(path, edit)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, edit with {
                StudentName = "Stale overwrite", Profile = desired with { Notes = "Other" }
            })).StatusCode);
        Assert.Equal("New Name", (await client.GetFromJsonAsync<TeacherStudentView>(
            url + "/" + created.MembershipId))!.StudentName);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/v1/student-sessions",
                new { workspace = "edit-north", code = created.InviteCode })).StatusCode);
        Assert.Equal("Foreign", (await client.GetFromJsonAsync<List<TeacherStudentView>>(url))!
            .Where(x => x.MembershipId == foreignId).Select(x => x.StudentName).FirstOrDefault() ?? "Foreign");
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var foreign = await db.WorkspaceStudentMemberships.AsNoTracking()
                .Include(x => x.Student).SingleAsync(x => x.Id == foreignId);
            Assert.Equal("Foreign", foreign.Student.DisplayName);
            var own = await db.WorkspaceStudentMemberships.AsNoTracking()
                .SingleAsync(x => x.Id == created.MembershipId);
            Assert.Equal("11", own.Grade);
            Assert.Null(own.ParentName);
            Assert.Equal("Updated", own.Notes);
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync(path, edit)).StatusCode);
    }

    [Fact]
    public async Task SeparateTeacherFlowConnectsStudentCatalogPairedLessonHomeworkAndSubscription()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "flow-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "flow-south", "south@example.invalid", "owner");
        var program = await SeedProgramAsync(factory, north.WorkspaceId);
        Guid languageProgram;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var language = new LearningProgram
            {
                Id = Guid.NewGuid(), WorkspaceId = south.WorkspaceId,
                Code = "LANG", DisplayName = "Language"
            };
            db.Programs.Add(language);
            await db.SaveChangesAsync();
            languageProgram = language.Id;
        }
        using var client = factory.CreateClient();
        var session = await (await LoginAsync(client, "flow-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        async Task<Guid> AddStudent(string name)
        {
            var response = await client.PostAsJsonAsync("/api/v1/teacher/students",
                new TeacherCreateStudentRequest(Guid.NewGuid(), program, name));
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            return (await response.Content.ReadFromJsonAsync<TeacherCreateStudentResponse>())!.MembershipId;
        }
        var first = await AddStudent("First synthetic student");
        var second = await AddStudent("Second synthetic student");
        var catalogResponse = await client.PostAsJsonAsync("/api/v1/teacher/homework/catalog",
            new TeacherCreateHomeworkCatalogRequest(Guid.NewGuid(), program, 6,
                "Geometry practice", "https://tests.invalid/geometry"));
        Assert.Equal(HttpStatusCode.Created, catalogResponse.StatusCode);
        var catalog = await catalogResponse.Content.ReadFromJsonAsync<TeacherHomeworkCatalogView>();
        Assert.NotNull(catalog);

        var request = new TeacherLessonHomeworkRequest(new TeacherLessonWriteRequest(
            Guid.NewGuid(), DateTimeOffset.UtcNow,
            [new(first, 60, "6", "Geometry", "Present"),
             new(second, 45, "6", "Geometry", "Absent")]), catalog.Id, 48);
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons-with-homework", request)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons-with-homework", request)).StatusCode);
        var subscription = await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{first}",
            new TeacherSubscriptionWriteRequest(8, null, null, null, null));
        Assert.Equal(HttpStatusCode.Created, subscription.StatusCode);

        Assert.Equal(2, (await client.GetFromJsonAsync<List<TeacherStudentView>>(
            "/api/v1/teacher/students"))!.Count);
        var lesson = Assert.Single((await client.GetFromJsonAsync<List<TeacherLessonView>>(
            "/api/v1/teacher/lessons"))!);
        Assert.Contains(lesson.Participants, x => x.MembershipId == first && x.AttendanceStatus == "Present");
        Assert.Contains(lesson.Participants, x => x.MembershipId == second && x.AttendanceStatus == "Absent");
        Assert.Equal(2, (await client.GetFromJsonAsync<List<TeacherHomeworkAssignmentView>>(
            "/api/v1/teacher/homework/assignments"))!.Count);
        var savedSubscription = Assert.Single((await client.GetFromJsonAsync<List<TeacherSubscriptionView>>(
            "/api/v1/teacher/subscriptions"))!);
        Assert.Equal(first, savedSubscription.MembershipId);
        Assert.Null(savedSubscription.LessonPrice);
        Assert.Null(savedSubscription.BaseLessonCount);

        var southSession = await (await LoginAsync(client, "flow-south", "south@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(southSession);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", southSession.AccessToken);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherStudentView>>(
            "/api/v1/teacher/students"))!);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherLessonView>>(
            "/api/v1/teacher/lessons"))!);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherHomeworkCatalogView>>(
            "/api/v1/teacher/homework/catalog"))!);
        var otherWork = await client.PostAsJsonAsync("/api/v1/teacher/homework/catalog",
            new TeacherCreateHomeworkCatalogRequest(Guid.NewGuid(), languageProgram, 3,
                "Vocabulary", "https://tests.invalid/language"));
        Assert.Equal(HttpStatusCode.Created, otherWork.StatusCode);
        Assert.NotEqual(catalog.Id,
            Assert.Single((await client.GetFromJsonAsync<List<TeacherHomeworkCatalogView>>(
                "/api/v1/teacher/homework/catalog"))!).Id);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{first}",
                new TeacherSubscriptionWriteRequest(8, null, null, null, null))).StatusCode);
    }

    [Fact]
    public async Task TeacherCreatesWorkspaceScopedCatalogItemAndCanAssignItWithoutDuplicates()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "catalog-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "catalog-south", "south@example.invalid", "owner");
        var foreignProgram = await SeedProgramAsync(factory, south.WorkspaceId);
        var student = await SeedStudentAsync(factory, north.WorkspaceId, "Synthetic", true);
        Guid program;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            program = (await db.WorkspaceStudentMemberships.SingleAsync(x => x.Id == student)).ProgramId;
        }
        using var client = factory.CreateClient();
        const string path = "/api/v1/teacher/homework/catalog";
        var request = new TeacherCreateHomeworkCatalogRequest(
            Guid.NewGuid(), program, 6, "  New work  ", "  https://tests.invalid/new-work  ");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync(path, request)).StatusCode);
        var session = await (await LoginAsync(client, "catalog-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(path, request with { RequestId = Guid.NewGuid(), ProgramId = foreignProgram })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(path, request with { RequestId = Guid.NewGuid(), Url = "javascript:alert(1)" })).StatusCode);

        var writes = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => client.PostAsJsonAsync(path, request)));
        Assert.Single(writes, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Equal(2, writes.Count(x => x.StatusCode == HttpStatusCode.OK));
        var item = await writes[0].Content.ReadFromJsonAsync<TeacherHomeworkCatalogView>();
        Assert.NotNull(item);
        Assert.Equal("New work", item.Name);
        Assert.Equal("https://tests.invalid/new-work", item.Url);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with { Name = "Different" })).StatusCode);
        Assert.Equal(item.Id, Assert.Single((await client.GetFromJsonAsync<List<TeacherHomeworkCatalogView>>(path))!).Id);
        var assignment = await client.PostAsJsonAsync("/api/v1/teacher/homework/assignments",
            new TeacherAssignHomeworkRequest(Guid.NewGuid(), item.Id, DateTimeOffset.UtcNow, 48, [student]));
        Assert.Equal(HttpStatusCode.Created, assignment.StatusCode);
        await using var verify = factory.Services.CreateAsyncScope();
        var catalog = await verify.ServiceProvider.GetRequiredService<PlatformDbContext>()
            .HomeworkCatalogItems.AsNoTracking().ToListAsync();
        Assert.Single(catalog);
    }

    [Fact]
    public async Task TeacherAssignsHomeworkAtomicallyAndReplaysConcurrentBatchWithoutResettingSubmissions()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "assign-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "assign-south", "south@example.invalid", "teacher");
        var first = await SeedStudentAsync(factory, north.WorkspaceId, "First", true);
        var second = await SeedStudentAsync(factory, north.WorkspaceId, "Second", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "Foreign", true);
        var catalog = await SeedCatalogAsync(factory, north.WorkspaceId, first);
        var foreignCatalog = await SeedCatalogAsync(factory, south.WorkspaceId, foreign);
        var request = new TeacherAssignHomeworkRequest(
            Guid.NewGuid(), catalog, DateTimeOffset.UtcNow, 48, [first, second]);
        using var client = factory.CreateClient();
        const string path = "/api/v1/teacher/homework/assignments";
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
        var session = await (await LoginAsync(client, "assign-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(path, request with
            {
                RequestId = Guid.NewGuid(), MembershipIds = [first, foreign]
            })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync(path, request with
            {
                RequestId = Guid.NewGuid(), CatalogItemId = foreignCatalog
            })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync(path, request with
            {
                RequestId = Guid.NewGuid(), MembershipIds = [first, first]
            })).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Empty(await db.HomeworkAssignments.AsNoTracking().ToListAsync());
        }

        var responses = await Task.WhenAll(Enumerable.Range(0, 4)
            .Select(_ => client.PostAsJsonAsync(path, request)));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Equal(3, responses.Count(x => x.StatusCode == HttpStatusCode.OK));
        var response = await responses[0].Content.ReadFromJsonAsync<TeacherAssignHomeworkResponse>();
        Assert.NotNull(response);
        Assert.Equal(2, response.AssignmentIds.Count);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var assignments = await db.HomeworkAssignments.AsNoTracking().ToListAsync();
            Assert.Equal(2, assignments.Count);
            Assert.Equal(2, assignments.Select(x => x.StudentId).Distinct().Count());
            Assert.All(assignments, x => Assert.Equal(48, (x.DeadlineAt - x.AssignedAt).TotalHours));
            await db.HomeworkAssignments.Where(x => x.Id == assignments[0].Id)
                .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.Status, "submitted"));
        }
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync(path, request with { MembershipIds = [second, first] })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with { DeadlineHours = 72 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with { MembershipIds = [first] })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync(path, request with { RequestId = Guid.NewGuid() })).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Equal(2, await db.HomeworkAssignments.CountAsync());
            Assert.Equal(1, await db.HomeworkAssignments.CountAsync(x => x.Status == "submitted"));
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync(path, request)).StatusCode);
    }

    [Fact]
    public async Task TeacherCreatesOnePairedLessonAndReplayCannotChangeAttendanceOrCrossWorkspace()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "lesson-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "lesson-south", "south@example.invalid", "teacher");
        var first = await SeedStudentAsync(factory, north.WorkspaceId, "First", true);
        var second = await SeedStudentAsync(factory, north.WorkspaceId, "Second", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "Foreign", true);
        using var client = factory.CreateClient();
        var request = new TeacherLessonWriteRequest(Guid.NewGuid(), DateTimeOffset.UtcNow,
        [
            new(first, 60, "6", "Synthetic topic", "Present"),
            new(second, 45, "6", "Synthetic topic", "Absent")
        ]);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons", request)).StatusCode);
        var session = await (await LoginAsync(client, "lesson-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons", request with
            {
                RequestId = Guid.NewGuid(), Participants = [new(foreign, 60, null, null, "Present")]
            })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons", request with
            {
                RequestId = Guid.NewGuid(), Participants = [request.Participants![0], request.Participants[0]]
            })).StatusCode);

        var created = await client.PostAsJsonAsync("/api/v1/teacher/lessons", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var firstResponse = await created.Content.ReadFromJsonAsync<TeacherLessonWriteResponse>();
        Assert.NotNull(firstResponse);
        Assert.Equal(2, firstResponse.ParticipantCount);
        var replay = await client.PostAsJsonAsync("/api/v1/teacher/lessons", request with
        {
            Participants = [request.Participants![1], request.Participants[0]]
        });
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal(firstResponse.LessonId,
            (await replay.Content.ReadFromJsonAsync<TeacherLessonWriteResponse>())!.LessonId);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons", request with
            {
                Participants = [request.Participants[0] with { AttendanceStatus = "Absent" }, request.Participants[1]]
            })).StatusCode);

        var simultaneous = request with { RequestId = Guid.NewGuid() };
        var responses = await Task.WhenAll(Enumerable.Range(0, 4)
            .Select(_ => client.PostAsJsonAsync("/api/v1/teacher/lessons", simultaneous)));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Equal(3, responses.Count(x => x.StatusCode == HttpStatusCode.OK));

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var all = await db.Lessons.AsNoTracking().Include(x => x.Participants)
                .Where(x => x.WorkspaceId == north.WorkspaceId).ToListAsync();
            Assert.Equal(2, all.Count);
            var saved = Assert.Single(all, x => x.Id == firstResponse.LessonId);
            Assert.Equal(2, saved.Participants.Count);
            Assert.Contains(saved.Participants, x => x.MembershipId == first && x.AttendanceStatus == "Present");
            Assert.Contains(saved.Participants, x => x.MembershipId == second && x.AttendanceStatus == "Absent");
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync("/api/v1/teacher/lessons", request)).StatusCode);
    }

    [Fact]
    public async Task TeacherSubscriptionWritePreservesNullsAndRejectsStaleOrForeignEdits()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "subscription-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "subscription-south", "south@example.invalid", "teacher");
        var own = await SeedStudentAsync(factory, north.WorkspaceId, "North", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "South", true);
        using var client = factory.CreateClient();
        var blank = new TeacherSubscriptionWriteRequest(8, null, null, null, null);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}", blank)).StatusCode);
        var session = await (await LoginAsync(client, "subscription-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{foreign}", blank)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}",
                blank with { LessonPrice = -1 })).StatusCode);
        var created = await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}", blank);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var first = await created.Content.ReadFromJsonAsync<TeacherSubscriptionView>();
        Assert.NotNull(first);
        Assert.Null(first.LessonPrice);
        Assert.Null(first.ResetAt);
        Assert.Null(first.BaseLessonCount);

        var repeat = await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}", blank);
        Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
        Assert.Equal(first.UpdatedAt,
            (await repeat.Content.ReadFromJsonAsync<TeacherSubscriptionView>())!.UpdatedAt);
        var update = blank with { PackageSize = 10, ExpectedUpdatedAt = first.UpdatedAt };
        var changed = await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}", update);
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        var second = await changed.Content.ReadFromJsonAsync<TeacherSubscriptionView>();
        Assert.NotNull(second);
        Assert.True(second.UpdatedAt > first.UpdatedAt);
        Assert.Null(second.LessonPrice);
        Assert.Equal(HttpStatusCode.Conflict,
            (await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}",
                update with { PackageSize = 12 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}", update)).StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var stored = Assert.Single(await db.SubscriptionSnapshots.AsNoTracking()
                .Where(x => x.WorkspaceId == north.WorkspaceId).ToListAsync());
            Assert.Equal(10, stored.PackageSize);
            Assert.Null(stored.LessonPrice);
            Assert.Null(stored.ResetAt);
            Assert.Null(stored.BaseLessonCount);
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync($"/api/v1/teacher/subscriptions/{own}", update)).StatusCode);
    }

    [Fact]
    public async Task TeacherStudentDirectoryIsScopedAndRevokedSessionsCannotReadIt()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "south", "south@example.invalid", "teacher");
        var ownId = await SeedStudentAsync(factory, north.WorkspaceId, "North student", true);
        var otherId = await SeedStudentAsync(factory, south.WorkspaceId, "South student", true);
        var inactiveId = await SeedStudentAsync(factory, north.WorkspaceId, "Archived student", false);
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/teacher/students")).StatusCode);
        var session = await (await LoginAsync(client, "north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        var students = await client.GetFromJsonAsync<List<TeacherStudentView>>("/api/v1/teacher/students");
        var own = Assert.Single(students!);
        Assert.Equal(ownId, own.MembershipId);
        Assert.Equal("North student", own.StudentName);
        Assert.Equal("MATH", own.ProgramCode);
        Assert.Equal("source-north student", own.ImportExternalId);
        Assert.Null(own.Grade);
        Assert.Null(own.ParentName);
        var rawList = await client.GetStringAsync("/api/v1/teacher/students");
        Assert.DoesNotContain("codeHash", rawList, StringComparison.OrdinalIgnoreCase);

        Assert.Equal(HttpStatusCode.OK,
            (await client.GetAsync($"/api/v1/teacher/students/{ownId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/teacher/students/{otherId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/teacher/students/{inactiveId}")).StatusCode);

        var southSession = await (await LoginAsync(client, "south", "south@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(southSession);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", southSession.AccessToken);
        Assert.Equal(otherId, Assert.Single((await client.GetFromJsonAsync<List<TeacherStudentView>>(
            "/api/v1/teacher/students"))!).MembershipId);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/teacher/students/{ownId}")).StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync("/api/v1/teacher/students")).StatusCode);
    }

    [Fact]
    public async Task TeacherProgramsDoNotRevealOtherWorkspace()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "programs-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "programs-south", "south@example.invalid", "teacher");
        var own = await SeedProgramAsync(factory, north.WorkspaceId);
        await SeedProgramAsync(factory, south.WorkspaceId);
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/teacher/programs")).StatusCode);
        var session = await (await LoginAsync(client, "programs-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        var items = await client.GetFromJsonAsync<List<System.Text.Json.JsonElement>>(
            "/api/v1/teacher/programs");
        Assert.Equal(own.ToString(), Assert.Single(items!).GetProperty("id").GetString());
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync("/api/v1/teacher/programs")).StatusCode);
    }

    [Fact]
    public async Task TeacherHistoryKeepsPairAttendanceAndNullableSubscriptionsWithinWorkspace()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "history-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "history-south", "south@example.invalid", "teacher");
        var first = await SeedStudentAsync(factory, north.WorkspaceId, "First", true);
        var second = await SeedStudentAsync(factory, north.WorkspaceId, "Second", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "Foreign", true);
        await SeedHistoryAsync(factory, north.WorkspaceId, [first, second]);
        await SeedHistoryAsync(factory, south.WorkspaceId, [foreign]);
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/teacher/lessons")).StatusCode);
        var session = await (await LoginAsync(client, "history-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        var lesson = Assert.Single((await client.GetFromJsonAsync<List<TeacherLessonView>>(
            "/api/v1/teacher/lessons"))!);
        Assert.Equal(2, lesson.Participants.Count);
        Assert.Contains(lesson.Participants, x => x.MembershipId == first && x.AttendanceStatus == "Present");
        Assert.Contains(lesson.Participants, x => x.MembershipId == second && x.AttendanceStatus == "Absent");
        Assert.DoesNotContain(lesson.Participants, x => x.MembershipId == foreign);

        var subscriptions = await client.GetFromJsonAsync<List<TeacherSubscriptionView>>(
            "/api/v1/teacher/subscriptions");
        Assert.Equal(2, subscriptions!.Count);
        Assert.All(subscriptions, x =>
        {
            Assert.Null(x.LessonPrice);
            Assert.Null(x.ResetAt);
            Assert.Null(x.BaseLessonCount);
            Assert.NotEqual(foreign, x.MembershipId);
        });

        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync("/api/v1/teacher/subscriptions")).StatusCode);
    }

    [Fact]
    public async Task TeacherHomeworkReadsAreScopedIncludingMembershipFilter()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "homework-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "homework-south", "south@example.invalid", "teacher");
        var own = await SeedStudentAsync(factory, north.WorkspaceId, "North", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "South", true);
        await SeedHomeworkAsync(factory, north.WorkspaceId, own);
        await SeedHomeworkAsync(factory, south.WorkspaceId, foreign);
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/v1/teacher/homework/catalog")).StatusCode);
        var session = await (await LoginAsync(client, "homework-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        Assert.Single((await client.GetFromJsonAsync<List<TeacherHomeworkCatalogView>>(
            "/api/v1/teacher/homework/catalog"))!);
        var assignment = Assert.Single((await client.GetFromJsonAsync<List<TeacherHomeworkAssignmentView>>(
            "/api/v1/teacher/homework/assignments"))!);
        Assert.Equal(own, assignment.MembershipId);
        Assert.Equal("assigned", assignment.Status);
        var submission = Assert.Single((await client.GetFromJsonAsync<List<TeacherHomeworkSubmissionView>>(
            $"/api/v1/teacher/homework/submissions?membershipId={own}"))!);
        Assert.Equal(assignment.Id, submission.AssignmentId);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherHomeworkAssignmentView>>(
            $"/api/v1/teacher/homework/assignments?membershipId={foreign}"))!);
        Assert.Empty((await client.GetFromJsonAsync<List<TeacherHomeworkSubmissionView>>(
            $"/api/v1/teacher/homework/submissions?membershipId={foreign}"))!);
    }

    [Fact]
    public async Task TeacherHistoricalResultsKeepMissingValuesAndRejectForeignMembership()
    {
        await ResetAsync(factory);
        var north = await SeedAsync(factory, "results-north", "north@example.invalid", "owner");
        var south = await SeedAsync(factory, "results-south", "south@example.invalid", "teacher");
        var own = await SeedStudentAsync(factory, north.WorkspaceId, "North", true);
        var foreign = await SeedStudentAsync(factory, south.WorkspaceId, "South", true);
        await SeedResultsAsync(factory, north.WorkspaceId, own);
        await SeedResultsAsync(factory, south.WorkspaceId, foreign);
        using var client = factory.CreateClient();
        var session = await (await LoginAsync(client, "results-north", "north@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);

        var test = Assert.Single((await client.GetFromJsonAsync<List<TeacherTestResultView>>(
            "/api/v1/teacher/tests/history"))!);
        Assert.Equal(own, test.MembershipId);
        Assert.Equal(75, test.ScorePercent);
        Assert.Null(test.CorrectCount);
        Assert.Null(test.TotalCount);
        var mock = Assert.Single((await client.GetFromJsonAsync<List<TeacherMockResultView>>(
            "/api/v1/teacher/mocks/results"))!);
        Assert.Equal(own, mock.MembershipId);
        Assert.Null(mock.Score);
        var task = Assert.Single((await client.GetFromJsonAsync<List<TeacherMockTaskView>>(
            "/api/v1/teacher/mocks/tasks"))!);
        Assert.Equal(own, task.MembershipId);
        Assert.Null(task.EarnedPoints);

        var attempt = Assert.Single((await client.GetFromJsonAsync<List<TeacherLiveTestAttemptView>>(
            "/api/v1/teacher/tests/attempts"))!);
        Assert.Equal(own, attempt.MembershipId);
        Assert.Equal(80, attempt.Percent);
        var mockSessionResponse = await client.GetAsync("/api/v1/teacher/mocks/sessions");
        var mockSessionJson = await mockSessionResponse.Content.ReadAsStringAsync();
        var mockSession = Assert.Single((await mockSessionResponse.Content.ReadFromJsonAsync<List<TeacherMockSessionView>>())!);
        Assert.Equal(own, mockSession.MembershipId);
        Assert.Null(mockSession.ScorePercent);
        Assert.DoesNotContain("answersJson", mockSessionJson, StringComparison.OrdinalIgnoreCase);

        foreach (var path in new[] { "tests/history", "tests/attempts", "mocks/results", "mocks/tasks", "mocks/sessions" })
        {
            var response = await client.GetAsync($"/api/v1/teacher/{path}?membershipId={foreign}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("[]", await response.Content.ReadAsStringAsync());
        }
        await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.GetAsync("/api/v1/teacher/mocks/results")).StatusCode);
    }

    [Fact]
    public async Task TeacherSignsInToOwnWorkspaceAndLogoutRevokesToken()
    {
        await ResetAsync(factory);
        var seeded = await SeedAsync(factory, "school-north", "first@example.invalid", "owner");
        using var client = factory.CreateClient();

        var loggedIn = await LoginAsync(client, "school-north", " FIRST@example.invalid ", Password);
        Assert.Equal(HttpStatusCode.OK, loggedIn.StatusCode);
        var session = await loggedIn.Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        Assert.Equal(seeded.WorkspaceId, session.WorkspaceId);
        Assert.Equal(seeded.TeacherId, session.TeacherId);
        Assert.Equal("owner", session.WorkspaceRole);
        Assert.Equal("Bearer", session.TokenType);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        var me = await client.GetAsync("/api/v1/teacher/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var json = await me.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(seeded.WorkspaceId.ToString(), json.GetProperty("workspaceId").GetString());
        Assert.Equal(seeded.TeacherId.ToString(), json.GetProperty("teacherId").GetString());

        var logout = await client.PostAsync("/api/v1/teacher-sessions/logout", null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync("/api/v1/teacher-sessions/logout", null)).StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Single(await db.TeacherSessions.AsNoTracking().Where(x => x.MembershipId == seeded.MembershipId).ToListAsync());
        Assert.NotNull((await db.TeacherSessions.AsNoTracking().SingleAsync()).RevokedAt);
        Assert.NotEqual(Password, (await db.TeacherUsers.AsNoTracking().SingleAsync()).PasswordHash);
    }

    [Fact]
    public async Task InvalidCredentialsOrInactiveIdentityHaveSameGenericUnauthorizedResponse()
    {
        await ResetAsync(factory);
        var seeded = await SeedAsync(factory, "school-north", "first@example.invalid", "owner");
        using var client = factory.CreateClient();

        var incorrect = await LoginAsync(client, "school-north", "first@example.invalid", "WRONG-PASSWORD");
        var unknown = await LoginAsync(client, "school-north", "unknown@example.invalid", Password);
        var otherWorkspace = await LoginAsync(client, "school-south", "first@example.invalid", Password);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.WorkspaceMemberships.Where(x => x.Id == seeded.MembershipId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsActive, false));
        }
        var inactive = await LoginAsync(client, "school-north", "first@example.invalid", Password);

        foreach (var response in new[] { incorrect, unknown, otherWorkspace, inactive })
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        var expected = await incorrect.Content.ReadAsStringAsync();
        Assert.Equal(expected, await unknown.Content.ReadAsStringAsync());
        Assert.Equal(expected, await otherWorkspace.Content.ReadAsStringAsync());
        Assert.Equal(expected, await inactive.Content.ReadAsStringAsync());

        await using var verifyScope = factory.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Empty(await verifyDb.TeacherSessions.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task TeacherCannotAccessStudentPolicyAndStudentClaimsCannotAccessTeacher()
    {
        await ResetAsync(factory);
        var seeded = await SeedAsync(factory, "teacher-only", "t@example.invalid", "teacher");
        using var client = factory.CreateClient();
        var response = await LoginAsync(client, "teacher-only", "t@example.invalid", Password);
        var session = await response.Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/homework-assignments")).StatusCode);

        // A signed token carrying only student role is still refused by the teacher policy.
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            ForgeToken(Guid.NewGuid(), Guid.NewGuid(), seeded.WorkspaceId, seeded.MembershipId, "student"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);

        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);
    }

    [Fact]
    public async Task ValidSignatureCannotOverrideSessionWorkspaceOrMembership()
    {
        await ResetAsync(factory);
        var first = await SeedAsync(factory, "school-a", "a@example.invalid", "owner");
        var second = await SeedAsync(factory, "school-b", "b@example.invalid", "owner");
        using var client = factory.CreateClient();

        var response = await LoginAsync(client, "school-a", "a@example.invalid", Password);
        var session = await response.Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        var parsed = new JwtSecurityTokenHandler().ReadJwtToken(session.AccessToken);
        var sessionId = Guid.Parse(parsed.Claims.Single(x => x.Type == JwtRegisteredClaimNames.Jti).Value);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            ForgeToken(sessionId, first.TeacherId, second.WorkspaceId, first.MembershipId, "teacher"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            ForgeToken(sessionId, first.TeacherId, first.WorkspaceId, second.MembershipId, "teacher"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            ForgeToken(sessionId, second.TeacherId, first.WorkspaceId, first.MembershipId, "teacher"));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);
    }

    [Fact]
    public async Task RemovingWorkspaceAccessInvalidatesExistingJwtImmediately()
    {
        await ResetAsync(factory);
        var seed = await SeedAsync(factory, "school-x", "owner@example.invalid", "owner");
        using var client = factory.CreateClient();
        var session = await (await LoginAsync(client, "school-x", "owner@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.Workspaces.Where(x => x.Id == seed.WorkspaceId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsActive, false));
        }

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);
    }


    [Fact]
    public async Task ChangingTeacherRoleRevokesOldOwnerToken()
    {
        await ResetAsync(factory);
        var seed = await SeedAsync(factory, "school-roles", "owner@example.invalid", "owner");
        using var client = factory.CreateClient();
        var session = await (await LoginAsync(client, "school-roles", "owner@example.invalid", Password))
            .Content.ReadFromJsonAsync<TeacherLoginResponse>();
        Assert.NotNull(session);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.WorkspaceMemberships.Where(x => x.Id == seed.MembershipId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.Role, "teacher"));
        }

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher/me")).StatusCode);
    }

    [Fact]
    public async Task ViewerMembershipCannotObtainTeacherToken()
    {
        await ResetAsync(factory);
        await SeedAsync(factory, "viewer-school", "viewer@example.invalid", "viewer");
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await LoginAsync(client, "viewer-school", "viewer@example.invalid", Password)).StatusCode);
    }

    [Fact]
    public async Task TeacherSignInHasIndependentIpRateLimit()
    {
        await using var limited = new ApiFactory(rateLimit: 5);
        await ResetAsync(limited);
        using var client = limited.CreateClient();
        for (int i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.Unauthorized,
                (await LoginAsync(client, "none", "none@example.invalid", "bad")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests,
            (await LoginAsync(client, "none", "none@example.invalid", "bad")).StatusCode);
    }

    [Fact]
    public async Task PrivilegedBootstrapCreatesOnlyFirstWorkspaceOwner()
    {
        await ResetAsync(factory);
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["TeacherBootstrap:Email"] = "bootstrap@example.invalid",
                ["TeacherBootstrap:Password"] = Password,
                ["TeacherBootstrap:Workspace"] = "new-school"
            }).Build();
        await TeacherBootstrapper.RunAsync(factory.Services, config);
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => TeacherBootstrapper.RunAsync(factory.Services, config));

        using var client = factory.CreateClient();
        var loggedIn = await LoginAsync(client, "new-school", "bootstrap@example.invalid", Password);
        Assert.Equal(HttpStatusCode.OK, loggedIn.StatusCode);
    }

    private static async Task ResetAsync(ApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await db.Database.MigrateAsync();
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        await db.Database.ExecuteSqlRawAsync(
            "TRUNCATE TABLE platform.\"TeacherSessions\", platform.\"WorkspaceMemberships\", " +
            "platform.\"WorkspaceStudentMemberships\", platform.\"TeacherUsers\", " +
            "platform.\"Students\", platform.\"Workspaces\", platform.\"Programs\" CASCADE;");
    }

    private static async Task<SeededTeacher> SeedAsync(ApiFactory factory, string slug, string email, string role)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var workspace = new Workspace { Id = Guid.NewGuid(), Slug = slug };
        var teacher = new TeacherUser
        {
            Id = Guid.NewGuid(), Email = email, NormalizedEmail = email.ToUpperInvariant()
        };
        teacher.PasswordHash = new PasswordHasher<TeacherUser>().HashPassword(teacher, Password);
        var membership = new WorkspaceMembership
        {
            Id = Guid.NewGuid(), Workspace = workspace, TeacherUser = teacher, Role = role
        };
        db.WorkspaceMemberships.Add(membership);
        await db.SaveChangesAsync();
        return new SeededTeacher(workspace.Id, teacher.Id, membership.Id);
    }

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client, string workspace, string email, string password) =>
        client.PostAsJsonAsync("/api/v1/teacher-sessions", new { workspace, email, password });

    private static async Task<Guid> SeedStudentAsync(ApiFactory factory, Guid workspaceId, string name, bool active)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var program = await db.Programs.SingleOrDefaultAsync(x => x.WorkspaceId == workspaceId && x.Code == "MATH")
            ?? new LearningProgram
            {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId, Code = "MATH", DisplayName = "Mathematics"
            };
        var student = new Student { Id = Guid.NewGuid(), DisplayName = name };
        var membership = new WorkspaceStudentMembership
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, Student = student, Program = program,
            CodeHash = System.Security.Cryptography.SHA256.HashData(Guid.NewGuid().ToByteArray()),
            ImportSource = "synthetic", ImportExternalId = "source-" + name.ToLowerInvariant(),
            IsActive = active
        };
        db.WorkspaceStudentMemberships.Add(membership);
        await db.SaveChangesAsync();
        return membership.Id;
    }

    private static async Task<Guid> SeedProgramAsync(ApiFactory factory, Guid workspaceId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var program = new LearningProgram
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId,
            Code = "SYNTHETIC", DisplayName = "Synthetic subject"
        };
        db.Programs.Add(program);
        await db.SaveChangesAsync();
        return program.Id;
    }

    private static async Task SeedHistoryAsync(ApiFactory factory, Guid workspaceId, Guid[] membershipIds)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var students = await db.WorkspaceStudentMemberships
            .Where(x => x.WorkspaceId == workspaceId && membershipIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id);
        var now = DateTimeOffset.UtcNow;
        var lesson = new Lesson
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, LegacyLessonId = "synthetic-lesson",
            LessonAt = now, CreatedAt = now
        };
        db.Lessons.Add(lesson);
        for (var i = 0; i < membershipIds.Length; i++)
        {
            var student = students[membershipIds[i]];
            db.LessonParticipants.Add(new LessonParticipant
            {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId, Lesson = lesson,
                MembershipId = student.Id, StudentId = student.StudentId, ProgramId = student.ProgramId,
                DurationMinutes = 60, AttendanceStatus = i == 0 ? "Present" : "Absent", CreatedAt = now
            });
            db.SubscriptionSnapshots.Add(new SubscriptionSnapshot
            {
                Id = Guid.NewGuid(), WorkspaceId = workspaceId,
                MembershipId = student.Id, StudentId = student.StudentId, ProgramId = student.ProgramId,
                PackageSize = 8, UpdatedAt = now
            });
        }
        await db.SaveChangesAsync();
    }

    private static async Task SeedHomeworkAsync(ApiFactory factory, Guid workspaceId, Guid membershipId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var member = await db.WorkspaceStudentMemberships.SingleAsync(x => x.Id == membershipId);
        var assignedAt = DateTimeOffset.UtcNow.AddHours(-2);
        var catalog = new HomeworkCatalogItem
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, ProgramId = member.ProgramId,
            HomeworkId = "synthetic-hw", TaskNumber = 6, Name = "Synthetic homework",
            Url = "https://tests.invalid/homework", IsActive = true, SortOrder = 1, CreatedAt = assignedAt
        };
        db.HomeworkCatalogItems.Add(catalog);
        await db.SaveChangesAsync();
        var assignment = new HomeworkAssignment
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member.Id,
            StudentId = member.StudentId, ProgramId = member.ProgramId, CatalogItemId = catalog.Id,
            AssignmentRecordId = "synthetic-assignment", HomeworkId = catalog.HomeworkId,
            TaskNumber = 6, Name = catalog.Name, Url = catalog.Url, AssignedAt = assignedAt,
            DeadlineAt = assignedAt.AddHours(24), Status = "assigned", SchemaVersion = "2"
        };
        db.HomeworkAssignments.Add(assignment);
        await db.SaveChangesAsync();
        db.HomeworkSubmissions.Add(new HomeworkSubmission
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, AssignmentId = assignment.Id,
            MembershipId = member.Id, StudentId = member.StudentId, ProgramId = member.ProgramId,
            EventId = "synthetic-event", ScorePercent = 80, DurationSeconds = 60,
            CompletedAt = assignedAt.AddMinutes(30), IsLate = false, SchemaVersion = "2",
            CreatedAt = assignedAt.AddMinutes(30)
        });
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> SeedCatalogAsync(ApiFactory factory, Guid workspaceId, Guid membershipId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var member = await db.WorkspaceStudentMemberships.SingleAsync(x => x.Id == membershipId);
        var item = new HomeworkCatalogItem
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, ProgramId = member.ProgramId,
            HomeworkId = "batch-hw", TaskNumber = 6, Name = "Batch homework",
            Url = "https://tests.invalid/batch-hw", IsActive = true, SortOrder = 1,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.HomeworkCatalogItems.Add(item);
        await db.SaveChangesAsync();
        return item.Id;
    }

    private static async Task SeedResultsAsync(ApiFactory factory, Guid workspaceId, Guid membershipId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var member = await db.WorkspaceStudentMemberships.SingleAsync(x => x.Id == membershipId);
        var date = new DateOnly(2026, 11, 1);
        var now = DateTimeOffset.UtcNow;
        db.HistoricalTestResults.Add(new HistoricalTestResult
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member.Id,
            StudentId = member.StudentId, ProgramId = member.ProgramId,
            EventId = "synthetic-test", TestId = "test-1", TestDate = date,
            TopicId = "topic", TopicName = "Topic", TaskNumber = 6,
            ScorePercent = 75, DurationSeconds = 120, ServerSubmittedAt = now, SchemaVersion = "2"
        });
        db.HistoricalMockResults.Add(new HistoricalMockResult
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member.Id,
            StudentId = member.StudentId, ProgramId = member.ProgramId,
            EventId = "synthetic-mock", MockId = "mock-1", MockDate = date,
            VariantName = "Variant", PrimaryScore = 6, MaxPrimaryScore = 10,
            ScorePercent = 60, ServerSubmittedAt = now, SchemaVersion = "2"
        });
        db.HistoricalMockTaskResults.Add(new HistoricalMockTaskResult
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member.Id,
            StudentId = member.StudentId, ProgramId = member.ProgramId,
            EventId = "synthetic-mock", MockId = "mock-1", MockDate = date,
            TaskNumber = 6, TopicId = "topic", TopicName = "Topic",
            IsCorrect = false, Answered = true, ServerSubmittedAt = now, SchemaVersion = "2"
        });
        var completedAt = new DateTimeOffset(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);
        db.TestAttempts.Add(new TestAttempt
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member.Id,
            StudentId = member.StudentId, ProgramId = member.ProgramId,
            EventId = "synthetic-live-test", TestId = "test-live", Topic = "Live topic",
            TaskNumber = 6, Correct = 4, Total = 5, Percent = 80,
            StartedAt = completedAt.AddMinutes(-2), CompletedAt = completedAt,
            DurationSeconds = 120, SchemaVersion = "1.0", MoscowMonthKey = "2026-11", CreatedAt = now
        });
        db.HistoricalMockSessions.Add(new HistoricalMockSession
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, MembershipId = member.Id,
            StudentId = member.StudentId, ProgramId = member.ProgramId,
            SessionId = "synthetic-session", MockId = "mock-1", StartedAt = completedAt,
            DeadlineAt = completedAt.AddHours(1), Status = "submitted",
            SubmittedAt = completedAt.AddMinutes(30), AnswersJson = "{}", MockConfigJson = "{}",
            SchemaVersion = "2"
        });
        await db.SaveChangesAsync();
    }

    private static string ForgeToken(Guid sessionId, Guid userId, Guid workspaceId, Guid membershipId, string role)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, sessionId.ToString()),
            new Claim("workspace_id", workspaceId.ToString()),
            new Claim("membership_id", membershipId.ToString()),
            new Claim("role", role),
            new Claim("workspace_role", "owner")
        };
        var signed = new JwtSecurityToken(
            issuer: ApiFactory.Issuer, audience: ApiFactory.Audience, claims: claims,
            expires: DateTime.UtcNow.AddMinutes(4),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Convert.FromBase64String(ApiFactory.SigningKey)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(signed);
    }

    private sealed record SeededTeacher(Guid WorkspaceId, Guid TeacherId, Guid MembershipId);
}
