using System.Security.Claims;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using TestingHosting.Platform.IdentityAccess;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TestingHosting.Platform.Configuration;
using TestingHosting.Platform.Classes;
using TestingHosting.Platform.Homework;
using TestingHosting.Platform.Lessons;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.StudentSessions;
using TestingHosting.Platform.Students;
using TestingHosting.Platform.Subscriptions;
using TestingHosting.Platform.TestAttempts;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton(serviceProvider =>
    StartupConfiguration.GetJwtOptions(serviceProvider.GetRequiredService<IConfiguration>()));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IStudentCodeHasher>(serviceProvider =>
    new StudentCodeHasher(StartupConfiguration.GetPepper(serviceProvider.GetRequiredService<IConfiguration>())));
builder.Services.AddScoped<StudentSessionService>();
builder.Services.AddScoped<TeacherSessionService>();
builder.Services.AddScoped<TeacherOwnerRegistration>();
builder.Services.AddScoped<TeacherStudentDirectory>();
builder.Services.AddScoped<TeacherHistoryReader>();
builder.Services.AddScoped<TeacherLessonService>();
builder.Services.AddScoped<TeacherLessonCorrectionService>();
builder.Services.AddScoped<TeacherLessonHomeworkService>();
builder.Services.AddScoped<TeacherSubscriptionService>();
builder.Services.AddScoped<TeacherHomeworkReader>();
builder.Services.AddScoped<TeacherHomeworkCatalogService>();
builder.Services.AddScoped<TeacherHomeworkAssignmentService>();
builder.Services.AddSingleton(serviceProvider => new TeacherInviteCodeIssuer(
    StartupConfiguration.GetPepper(serviceProvider.GetRequiredService<IConfiguration>())));
builder.Services.AddScoped<TeacherStudentCreator>();
builder.Services.AddScoped<TeacherStudentArchiver>();
builder.Services.AddScoped<TeacherStudentEditor>();
builder.Services.AddScoped<TeacherResultsReader>();
builder.Services.AddScoped<TeacherClassService>();
builder.Services.AddScoped<TeacherMaterialService>();
builder.Services.AddScoped<TeacherFileService>();
builder.Services.AddScoped<TeacherMaterialManagement>();
builder.Services.AddScoped<TeacherLibraryFolderService>();
builder.Services.AddScoped<TeacherClassTopicService>();
builder.Services.AddScoped<TeacherLessonMaterialService>();
builder.Services.AddScoped<LessonRecordingService>();
builder.Services.AddScoped<TeacherLessonTopicService>();
builder.Services.AddScoped<TeacherGroupService>();
builder.Services.AddScoped<TeacherScheduleRuleService>();
builder.Services.AddScoped<TeacherPeriodPreviewService>();
builder.Services.AddScoped<TeacherPeriodPlanService>();
builder.Services.AddScoped<TeacherClassInvitationService>();
builder.Services.AddSingleton<IPasswordHasher<TeacherUser>, PasswordHasher<TeacherUser>>();
builder.Services.AddSingleton<TeacherTokenIssuer>();
builder.Services.AddScoped<IAuthorizationHandler, ActiveTeacherSessionHandler>();
builder.Services.AddScoped<TestAttemptService>();
builder.Services.AddScoped<HomeworkService>();
builder.Services.AddScoped<NativeHomeworkService>();
builder.Services.AddSingleton<StudentTokenIssuer>();
builder.Services.AddDbContext<PlatformDbContext>(options =>
    options.UseNpgsql(
        StartupConfiguration.GetConnectionString(builder.Configuration),
        postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "public")));
builder.Services.AddHealthChecks()
    .AddCheck<DatabaseHealthCheck>("database", tags: ["ready"])
    .AddCheck<DatabaseMigrationsHealthCheck>("migrations", tags: ["migrations"],
        timeout: TimeSpan.FromSeconds(6));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var jwtOptions = StartupConfiguration.GetJwtOptions(builder.Configuration);
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Convert.FromBase64String(jwtOptions.SigningKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            RoleClaimType = "role",
            NameClaimType = ClaimsIdentity.DefaultNameClaimType
        };
    });
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("student", policy => policy.RequireAuthenticatedUser().RequireClaim("role", "student"));
    options.AddPolicy("teacher", policy => policy.RequireAuthenticatedUser()
        .RequireClaim("role", "teacher").AddRequirements(new ActiveTeacherSessionRequirement()));
});
builder.Services.AddCors(options => options.AddPolicy("browser", policy =>
    policy.WithOrigins(StartupConfiguration.GetAllowedOrigins(builder.Configuration))
        .WithMethods("GET", "POST", "PATCH").WithHeaders("Content-Type", "Authorization")));
builder.Services.AddRateLimiter(options =>
{
    var studentSessionOptions = StartupConfiguration.GetStudentSessionOptions(builder.Configuration);
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddConcurrencyLimiter("file-uploads", limiter => { limiter.PermitLimit=2;limiter.QueueLimit=0; });
    options.AddPolicy("teacher-sessions", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = studentSessionOptions.RateLimitPermitLimit,
            Window = TimeSpan.FromSeconds(studentSessionOptions.RateLimitWindowSeconds),
            QueueLimit = 0, AutoReplenishment = true
        }));
    options.AddPolicy("student-sessions", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = studentSessionOptions.RateLimitPermitLimit,
            Window = TimeSpan.FromSeconds(studentSessionOptions.RateLimitWindowSeconds),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
});

var app = builder.Build();
StartupConfiguration.Validate(app.Configuration);

if (args.Contains("--migrate", StringComparer.Ordinal))
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().Database.MigrateAsync();
    return;
}

if (args.Contains("--bootstrap-teacher", StringComparer.Ordinal))
{
    await TeacherBootstrapper.RunAsync(app.Services, app.Configuration);
    return;
}

app.UseExceptionHandler(exceptionHandlerApp => exceptionHandlerApp.Run(async context =>
{
    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
    context.Response.ContentType = "application/problem+json";
    await context.Response.WriteAsJsonAsync(new { title = "An unexpected error occurred.", status = 500 });
}));
app.UseCors("browser");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapPost("/api/v1/student-sessions", async (
    StudentSessionRequest request,
    StudentSessionService sessions,
    StudentTokenIssuer tokenIssuer,
    CancellationToken cancellationToken) =>
{
    var identity = await sessions.ExchangeAsync(request.Workspace, request.Code, cancellationToken);
    return identity is null
        ? Results.Json(new { title = "Invalid student credentials.", status = 401 }, statusCode: 401,
            contentType: "application/problem+json")
        : Results.Ok(tokenIssuer.Issue(identity));
}).RequireRateLimiting("student-sessions");

app.MapPost("/api/v1/teacher-sessions", async (
    TeacherLoginRequest request, TeacherSessionService sessions, CancellationToken cancellationToken) =>
{
    var session = await sessions.LoginAsync(request, cancellationToken);
    return session is null
        ? Results.Json(new { title = "Invalid teacher credentials.", status = 401 }, statusCode: 401,
            contentType: "application/problem+json")
        : Results.Ok(session);
}).RequireRateLimiting("teacher-sessions");

app.MapPost("/api/v1/teacher-registrations", async (
    TeacherOwnerRegistrationRequest request, TeacherOwnerRegistration registration,
    CancellationToken cancellationToken) =>
{
    var result = await registration.RegisterAsync(request, cancellationToken);
    return result.Status switch
    {
        TeacherOwnerRegistrationStatus.Created => Results.Created("/api/v1/teacher-sessions", new { created = true }),
        TeacherOwnerRegistrationStatus.Unavailable => Results.Problem(statusCode: 503,
            title: "Owner registration is not configured."),
        TeacherOwnerRegistrationStatus.InvalidCode => Results.Problem(statusCode: 401,
            title: "Invalid registration code or workspace."),
        TeacherOwnerRegistrationStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        TeacherOwnerRegistrationStatus.Conflict => Results.Problem(statusCode: 409,
            title: "This workspace already has an owner or cannot be claimed."),
        _ => throw new InvalidOperationException("Unknown owner registration result.")
    };
}).RequireRateLimiting("teacher-sessions");

app.MapGet("/api/v1/teacher/me", (ClaimsPrincipal principal) => Results.Ok(new
{
    TeacherId = principal.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub),
    WorkspaceId = principal.FindFirstValue("workspace_id"),
    MembershipId = principal.FindFirstValue("membership_id"),
    WorkspaceRole = principal.FindFirstValue("workspace_role")
})).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/programs", async (
    ClaimsPrincipal principal, PlatformDbContext db, CancellationToken cancellationToken) =>
{
    var workspaceId = Guid.Parse(principal.FindFirstValue("workspace_id")!);
    var programs = await db.Programs.AsNoTracking()
        .Where(x => x.WorkspaceId == workspaceId && x.IsActive)
        .OrderBy(x => x.DisplayName).ThenBy(x => x.Id)
        .Select(x => new { x.Id, x.Code, x.DisplayName })
        .ToListAsync(cancellationToken);
    return Results.Ok(programs);
}).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/students", async (
    ClaimsPrincipal principal, TeacherStudentDirectory directory, CancellationToken cancellationToken) =>
{
    var workspaceId = Guid.Parse(principal.FindFirstValue("workspace_id")!);
    return Results.Ok(await directory.ListAsync(workspaceId, cancellationToken));
}).RequireAuthorization("teacher");


app.MapGet("/api/v1/teacher/groups", async (
    ClaimsPrincipal principal, TeacherGroupService groups, CancellationToken ct) =>
    Results.Ok(await groups.ListAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), ct)))
    .RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/groups", async (
    TeacherCreateGroupRequest request, ClaimsPrincipal principal, TeacherGroupService groups, CancellationToken ct) =>
{
    var outcome = await groups.CreateAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct);
    return outcome.Status switch
    {
        TeacherGroupStatus.Created => Results.Created($"/api/v1/teacher/groups/{outcome.Response!.Id}", outcome.Response),
        TeacherGroupStatus.Unchanged => Results.Ok(outcome.Response),
        TeacherGroupStatus.NotFound => Results.NotFound(),
        TeacherGroupStatus.Conflict => Results.Problem(statusCode: 409, title: "Request ID already used for another group."),
        TeacherGroupStatus.InvalidRequest => Results.ValidationProblem(outcome.Errors!),
        _ => throw new InvalidOperationException("Unexpected group create result.")
    };
}).RequireAuthorization("teacher");

app.MapPatch("/api/v1/teacher/groups/{groupId:guid}", async (
    Guid groupId, TeacherUpdateGroupRequest request, ClaimsPrincipal principal,
    TeacherGroupService groups, CancellationToken ct) =>
{
    var result = await groups.UpdateAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), groupId, request, ct);
    return result.Status switch
    {
        TeacherGroupStatus.Updated or TeacherGroupStatus.Unchanged => Results.Ok(result.Response),
        TeacherGroupStatus.NotFound => Results.NotFound(),
        TeacherGroupStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        TeacherGroupStatus.Conflict => Results.Problem(statusCode: 409, title: "Group changed or archived."),
        _ => throw new InvalidOperationException("Unexpected group update result.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/groups/{groupId:guid}/archive", async (
    Guid groupId, TeacherClassRevisionRequest request, ClaimsPrincipal principal,
    TeacherGroupService groups, CancellationToken ct) =>
{
    var result = await groups.ArchiveAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), groupId, request, true, ct);
    return result.Status switch
    {
        TeacherGroupStatus.Updated or TeacherGroupStatus.Unchanged => Results.Ok(result.Response),
        TeacherGroupStatus.NotFound => Results.NotFound(),
        TeacherGroupStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        TeacherGroupStatus.Conflict => Results.Problem(statusCode: 409, title: "Group changed."),
        _ => throw new InvalidOperationException("Unexpected group archive result.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/groups/{groupId:guid}/restore", async (
    Guid groupId, TeacherClassRevisionRequest request, ClaimsPrincipal principal,
    TeacherGroupService groups, CancellationToken ct) =>
{
    var result = await groups.ArchiveAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), groupId, request, false, ct);
    return result.Status switch
    {
        TeacherGroupStatus.Updated or TeacherGroupStatus.Unchanged => Results.Ok(result.Response),
        TeacherGroupStatus.NotFound => Results.NotFound(),
        TeacherGroupStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        TeacherGroupStatus.Conflict => Results.Problem(statusCode: 409, title: "Group changed."),
        _ => throw new InvalidOperationException("Unexpected group restore result.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/groups/{groupId:guid}/invitation", async (
    Guid groupId, TeacherClassRevisionRequest request, ClaimsPrincipal principal,
    TeacherGroupService groups, CancellationToken ct) =>
{
    var result = await groups.InviteAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), groupId, request, false, ct);
    return result.Status switch
    {
        TeacherGroupStatus.Updated => Results.Ok(result.Response),
        TeacherGroupStatus.NotFound => Results.NotFound(),
        TeacherGroupStatus.InvalidRequest => Results.ValidationProblem(new Dictionary<string,string[]> {
            ["expectedRevision"] = ["Positive revision required."] }),
        TeacherGroupStatus.Conflict => Results.Problem(statusCode: 409, title: "Group changed or archived."),
        _ => throw new InvalidOperationException("Unexpected group invite result.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/groups/{groupId:guid}/invitation/revoke", async (
    Guid groupId, TeacherClassRevisionRequest request, ClaimsPrincipal principal,
    TeacherGroupService groups, CancellationToken ct) =>
{
    var result = await groups.InviteAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), groupId, request, true, ct);
    return result.Status switch
    {
        TeacherGroupStatus.Updated => Results.Ok(result.Response),
        TeacherGroupStatus.NotFound => Results.NotFound(),
        TeacherGroupStatus.InvalidRequest => Results.ValidationProblem(new Dictionary<string,string[]> {
            ["expectedRevision"] = ["Positive revision required."] }),
        TeacherGroupStatus.Conflict => Results.Problem(statusCode: 409, title: "Group changed or invitation unavailable."),
        _ => throw new InvalidOperationException("Unexpected group invite revoke result.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/groups/{groupId:guid}/members/{membershipId:guid}/approve", async (
    Guid groupId, Guid membershipId, TeacherClassRevisionRequest request, ClaimsPrincipal principal,
    TeacherGroupService groups, CancellationToken ct) =>
{
    var result = await groups.ApproveAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), groupId, membershipId, request, ct);
    return result.Status switch
    {
        TeacherGroupStatus.Updated or TeacherGroupStatus.Unchanged => Results.Ok(result.Response),
        TeacherGroupStatus.NotFound => Results.NotFound(),
        TeacherGroupStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        TeacherGroupStatus.Conflict => Results.Problem(statusCode: 409, title: "Group changed or archived."),
        _ => throw new InvalidOperationException("Unexpected group approval result.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/student/groups/invitations/accept", async (
    AcceptClassInvitationRequest request, ClaimsPrincipal principal,
    TeacherGroupService groups, CancellationToken ct) =>
{
    var result = await groups.JoinAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!),
        Guid.Parse(principal.FindFirstValue("membership_id")!),
        Guid.Parse(principal.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)!),
        request.Code, ct);
    return result.Status switch
    {
        TeacherGroupStatus.Updated or TeacherGroupStatus.Unchanged => Results.Ok(result.Response),
        TeacherGroupStatus.NotFound => Results.NotFound(),
        TeacherGroupStatus.InvalidRequest => Results.ValidationProblem(new Dictionary<string,string[]> {
            ["code"] = ["Code must contain 64 hexadecimal characters."] }),
        TeacherGroupStatus.Conflict => Results.Problem(statusCode: 409, title: "Group full, archived or invitation unavailable."),
        _ => throw new InvalidOperationException("Unexpected group invitation accept result.")
    };
}).RequireAuthorization("student");

app.MapPost("/api/v1/teacher/schedule-rules/period-plan", async (
    TeacherPeriodPlanRequest request, ClaimsPrincipal principal,
    TeacherPeriodPlanService planner, CancellationToken ct) =>
{
    var result = await planner.SaveAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct);
    return result.Status == 200 ? Results.Ok(result.Response) : Results.Problem(statusCode: result.Status,
        title: "Период изменился, содержит конфликт или класс недоступен. Обновите предпросмотр.");
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/schedule-rules/period-preview", async (
    TeacherPeriodPreviewRequest request, ClaimsPrincipal principal,
    TeacherPeriodPreviewService preview, CancellationToken ct) =>
{
    var result = await preview.PreviewAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct);
    return result.NotFound ? Results.NotFound()
        : result.Errors is not null ? Results.ValidationProblem(result.Errors)
        : Results.Ok(result.Candidates);
}).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/schedule-rules", async (
    ClaimsPrincipal principal, TeacherScheduleRuleService schedule, CancellationToken ct) =>
    Results.Ok(await schedule.ListAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), ct))
).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/schedule-rules", async (
    TeacherScheduleRuleCreateRequest request, ClaimsPrincipal principal,
    TeacherScheduleRuleService schedule, CancellationToken ct) =>
{
    var result = await schedule.CreateAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct);
    return result.Status switch
    {
        TeacherScheduleRuleStatus.Created => Results.Created(
            $"/api/v1/teacher/schedule-rules/{result.Response!.Id}", result.Response),
        TeacherScheduleRuleStatus.Unchanged => Results.Ok(result.Response),
        TeacherScheduleRuleStatus.NotFound => Results.NotFound(),
        TeacherScheduleRuleStatus.Invalid => Results.ValidationProblem(result.Errors!),
        TeacherScheduleRuleStatus.Conflict => Results.Problem(statusCode: 409,
            title: "Schedule overlaps another active class slot, the zone differs, or request ID is reused."),
        _ => throw new InvalidOperationException("Unexpected schedule create status.")
    };
}).RequireAuthorization("teacher");

app.MapPatch("/api/v1/teacher/schedule-rules/{ruleId:guid}", async (
    Guid ruleId, TeacherScheduleRuleUpdateRequest request, ClaimsPrincipal principal,
    TeacherScheduleRuleService schedule, CancellationToken ct) =>
{
    var result = await schedule.UpdateAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), ruleId, request, ct);
    return result.Status switch
    {
        TeacherScheduleRuleStatus.Updated or TeacherScheduleRuleStatus.Unchanged => Results.Ok(result.Response),
        TeacherScheduleRuleStatus.NotFound => Results.NotFound(),
        TeacherScheduleRuleStatus.Invalid => Results.ValidationProblem(result.Errors!),
        TeacherScheduleRuleStatus.Conflict => Results.Problem(statusCode: 409,
            title: "Schedule changed, is archived, or overlaps another active slot."),
        _ => throw new InvalidOperationException("Unexpected schedule update status.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/schedule-rules/{ruleId:guid}/disable", async (
    Guid ruleId, TeacherClassRevisionRequest request, ClaimsPrincipal principal,
    TeacherScheduleRuleService schedule, CancellationToken ct) =>
{
    var result = await schedule.DisableAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), ruleId,
        request.ExpectedRevision, ct);
    return result.Status switch
    {
        TeacherScheduleRuleStatus.Updated or TeacherScheduleRuleStatus.Unchanged => Results.Ok(result.Response),
        TeacherScheduleRuleStatus.NotFound => Results.NotFound(),
        TeacherScheduleRuleStatus.Invalid => Results.ValidationProblem(result.Errors!),
        TeacherScheduleRuleStatus.Conflict => Results.Problem(statusCode: 409,
            title: "Schedule changed. Refresh and retry."),
        _ => throw new InvalidOperationException("Unexpected schedule disable status.")
    };
}).RequireAuthorization("teacher");

// Workspace-bound reusable materials and their class attachments.
// Class-scoped program topics are independent from the legacy LearningProgram directory.
app.MapGet("/api/v1/teacher/class-topics", async (
    ClaimsPrincipal principal, TeacherClassTopicService service, CancellationToken ct) =>
    Results.Ok(await service.ListAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), ct))
).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/topic-materials", async (
    ClaimsPrincipal principal, TeacherClassTopicService service, CancellationToken ct) =>
    Results.Ok(await service.MaterialsAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), ct))
).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/topic-tasks", async (
    ClaimsPrincipal principal, TeacherClassTopicService service, CancellationToken ct) =>
    Results.Ok(await service.TasksAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), ct))
).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/topic-tasks", async (
    TeacherTopicTaskRequest request, ClaimsPrincipal principal,
    TeacherClassTopicService service, CancellationToken ct) =>
{
    var result = await service.AttachTaskAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct);
    return result.Status switch
    {
        TeacherTopicStatus.Created => Results.Created("/api/v1/teacher/topic-tasks", result.TaskLink),
        TeacherTopicStatus.Duplicate => Results.Ok(result.TaskLink),
        TeacherTopicStatus.Invalid => Results.ValidationProblem(result.Errors!),
        TeacherTopicStatus.NotFound => Results.NotFound(),
        TeacherTopicStatus.Conflict => Results.Problem(statusCode:409, title:"Task already attached or request conflicts."),
        _ => throw new InvalidOperationException("Unexpected topic task status.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/class-topics", async (
    TeacherClassTopicCreateRequest request, ClaimsPrincipal principal,
    TeacherClassTopicService service, CancellationToken ct) =>
{
    var result = await service.CreateAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct);
    return result.Status switch
    {
        TeacherTopicStatus.Created => Results.Created("/api/v1/teacher/class-topics", result.Topic),
        TeacherTopicStatus.Duplicate => Results.Ok(result.Topic),
        TeacherTopicStatus.Invalid => Results.ValidationProblem(result.Errors!),
        TeacherTopicStatus.NotFound => Results.NotFound(),
        TeacherTopicStatus.Conflict => Results.Problem(statusCode:409, title:"Topic request conflicts."),
        _ => throw new InvalidOperationException("Unexpected topic create status.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/topic-materials", async (
    TeacherTopicMaterialRequest request, ClaimsPrincipal principal,
    TeacherClassTopicService service, CancellationToken ct) =>
{
    var result = await service.AttachAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct);
    return result.Status switch
    {
        TeacherTopicStatus.Created => Results.Created("/api/v1/teacher/topic-materials", result.Material),
        TeacherTopicStatus.Duplicate => Results.Ok(result.Material),
        TeacherTopicStatus.Invalid => Results.ValidationProblem(result.Errors!),
        TeacherTopicStatus.NotFound => Results.NotFound(),
        TeacherTopicStatus.Conflict => Results.Problem(statusCode:409, title:"Topic material already attached or request conflicts."),
        _ => throw new InvalidOperationException("Unexpected topic material status.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/class-topics/completion", async (
    TeacherTopicCompletionRequest request, ClaimsPrincipal principal,
    TeacherClassTopicService service, CancellationToken ct) =>
{
    var result = await service.CompleteAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct);
    return result.Status switch
    {
        TeacherTopicStatus.Updated => Results.Ok(result.Topic),
        TeacherTopicStatus.Invalid => Results.ValidationProblem(result.Errors!),
        TeacherTopicStatus.NotFound => Results.NotFound(),
        TeacherTopicStatus.Conflict => Results.Problem(statusCode:409, title:"Topic status changed. Reload before updating."),
        _ => throw new InvalidOperationException("Unexpected topic completion status.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/class-topics/move", async (
    TeacherTopicMoveRequest request, ClaimsPrincipal principal,
    TeacherClassTopicService service, CancellationToken ct) =>
{
    var result = await service.MoveAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct);
    return result.Status switch
    {
        TeacherTopicStatus.Updated => Results.Ok(result.Topic),
        TeacherTopicStatus.Invalid => Results.ValidationProblem(result.Errors!),
        TeacherTopicStatus.NotFound => Results.NotFound(),
        TeacherTopicStatus.Conflict => Results.Problem(statusCode:409, title:"Topics changed. Reload before moving."),
        _ => throw new InvalidOperationException("Unexpected topic move status.")
    };
}).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/lesson-topics", async (
    ClaimsPrincipal principal, TeacherLessonTopicService service, CancellationToken ct) =>
    Results.Ok(await service.ListAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), ct))
).RequireAuthorization("teacher");
app.MapPost("/api/v1/teacher/lesson-topics", async (
    TeacherLessonTopicRequest request, ClaimsPrincipal principal,
    TeacherLessonTopicService service, CancellationToken ct) =>
{
    var result = await service.ReplaceAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct);
    return result.Status switch {
        TeacherLessonTopicStatus.Updated => Results.Ok(result.Value),
        TeacherLessonTopicStatus.Invalid => Results.ValidationProblem(new Dictionary<string,string[]> {
            ["topics"] = ["Укажите занятие, ревизию и до 50 разных тем."] }),
        TeacherLessonTopicStatus.NotFound => Results.NotFound(),
        TeacherLessonTopicStatus.Conflict => Results.Problem(statusCode:409,
            title:"Темы занятия изменены. Обновите данные перед сохранением."),
        _ => throw new InvalidOperationException("Unexpected lesson topics status.")
    };
}).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/materials", async (
    ClaimsPrincipal principal, TeacherMaterialService materials, CancellationToken ct) =>
    Results.Ok(await materials.LibraryAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), ct))
).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/lesson-materials", async (
    ClaimsPrincipal principal, TeacherLessonMaterialService materials, CancellationToken ct) =>
    Results.Ok(await materials.ListAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), ct))
).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/lesson-materials", async (
    TeacherLessonMaterialWriteRequest request, ClaimsPrincipal principal,
    TeacherLessonMaterialService materials, CancellationToken ct) =>
{
    var result = await materials.AttachAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct);
    return result.Status switch
    {
        TeacherLessonMaterialStatus.Created => Results.Created("/api/v1/teacher/lesson-materials", result.Response),
        TeacherLessonMaterialStatus.Duplicate => Results.Ok(result.Response),
        TeacherLessonMaterialStatus.Invalid => Results.ValidationProblem(result.Errors!),
        TeacherLessonMaterialStatus.NotFound => Results.NotFound(),
        TeacherLessonMaterialStatus.Conflict => Results.Problem(
            statusCode: 409, title: "Material already attached or request ID conflicts."),
        _ => throw new InvalidOperationException("Unexpected lesson material link status.")
    };
}).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/class-materials", async (
    ClaimsPrincipal principal, TeacherMaterialService materials, CancellationToken ct) =>
    Results.Ok(await materials.LinksAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), ct))
).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/class-materials", async (
    TeacherClassMaterialWriteRequest request, ClaimsPrincipal principal,
    TeacherMaterialService materials, CancellationToken ct) =>
{
    var result = await materials.CreateAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct);
    return result.Status switch
    {
        TeacherClassMaterialStatus.Created => Results.Created(
            "/api/v1/teacher/class-materials", result.Response),
        TeacherClassMaterialStatus.Duplicate => Results.Ok(result.Response),
        TeacherClassMaterialStatus.Invalid => Results.ValidationProblem(result.Errors!),
        TeacherClassMaterialStatus.NotFound => Results.NotFound(),
        TeacherClassMaterialStatus.Conflict => Results.Problem(
            statusCode: 409, title: "Material is already attached or request ID conflicts."),
        _ => throw new InvalidOperationException("Unexpected class material write result.")
    };
}).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/classes", async (
    ClaimsPrincipal principal, TeacherClassService classes, CancellationToken cancellationToken) =>
{
    var workspaceId = Guid.Parse(principal.FindFirstValue("workspace_id")!);
    return Results.Ok(await classes.ListAsync(workspaceId, cancellationToken));
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/classes", async (
    TeacherCreateClassRequest request, ClaimsPrincipal principal,
    TeacherClassService classes, CancellationToken cancellationToken) =>
{
    var result = await classes.CreateAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), request, cancellationToken);
    return result.Status switch
    {
        TeacherCreateClassStatus.Created => Results.Created(
            $"/api/v1/teacher/classes/{result.Response!.Id}", result.Response),
        TeacherCreateClassStatus.Duplicate => Results.Ok(result.Response),
        TeacherCreateClassStatus.Conflict => Results.Problem(statusCode: 409,
            title: "The request ID is already associated with a different class."),
        TeacherCreateClassStatus.MembershipNotFound => Results.NotFound(),
        TeacherCreateClassStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        _ => throw new InvalidOperationException("Unknown teacher class create result.")
    };
}).RequireAuthorization("teacher");


app.MapPatch("/api/v1/teacher/classes/{classId:guid}", async (
    Guid classId, TeacherUpdateClassRequest request, ClaimsPrincipal principal,
    TeacherClassService classes, CancellationToken cancellationToken) =>
{
    var outcome = await classes.UpdateAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), classId, request, cancellationToken);
    return outcome.Status switch
    {
        TeacherClassMutationStatus.Updated or TeacherClassMutationStatus.Unchanged => Results.Ok(outcome.Response),
        TeacherClassMutationStatus.NotFound => Results.NotFound(),
        TeacherClassMutationStatus.Conflict => Results.Problem(statusCode: 409,
            title: "Class changed or is archived. Refresh and retry."),
        TeacherClassMutationStatus.InvalidRequest => Results.ValidationProblem(outcome.Errors!),
        _ => throw new InvalidOperationException("Unexpected class edit result.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/classes/{classId:guid}/archive", async (
    Guid classId, TeacherClassRevisionRequest request, ClaimsPrincipal principal,
    TeacherClassService classes, CancellationToken cancellationToken) =>
{
    var outcome = await classes.SetArchivedAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), classId, request, true, cancellationToken);
    return outcome.Status switch
    {
        TeacherClassMutationStatus.Updated or TeacherClassMutationStatus.Unchanged => Results.Ok(outcome.Response),
        TeacherClassMutationStatus.NotFound => Results.NotFound(),
        TeacherClassMutationStatus.Conflict => Results.Problem(statusCode: 409,
            title: "Class changed. Refresh and retry."),
        TeacherClassMutationStatus.InvalidRequest => Results.ValidationProblem(outcome.Errors!),
        _ => throw new InvalidOperationException("Unexpected class archive result.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/classes/{classId:guid}/restore", async (
    Guid classId, TeacherClassRevisionRequest request, ClaimsPrincipal principal,
    TeacherClassService classes, CancellationToken cancellationToken) =>
{
    var outcome = await classes.SetArchivedAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), classId, request, false, cancellationToken);
    return outcome.Status switch
    {
        TeacherClassMutationStatus.Updated or TeacherClassMutationStatus.Unchanged => Results.Ok(outcome.Response),
        TeacherClassMutationStatus.NotFound => Results.NotFound(),
        TeacherClassMutationStatus.Conflict => Results.Problem(statusCode: 409,
            title: "Class changed. Refresh and retry."),
        TeacherClassMutationStatus.InvalidRequest => Results.ValidationProblem(outcome.Errors!),
        _ => throw new InvalidOperationException("Unexpected class restore result.")
    };
}).RequireAuthorization("teacher");


app.MapPost("/api/v1/teacher/classes/{classId:guid}/invitation", async (
    Guid classId, TeacherClassRevisionRequest request, ClaimsPrincipal principal,
    TeacherClassInvitationService invitations, CancellationToken ct) =>
{
    var result = await invitations.IssueAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), classId, request.ExpectedRevision, ct);
    return result.Status switch
    {
        ClassInviteStatus.Created => Results.Ok(result.Response),
        ClassInviteStatus.NotFound => Results.NotFound(),
        ClassInviteStatus.Conflict => Results.Problem(statusCode: 409, title: "Class changed or archived."),
        ClassInviteStatus.Invalid => Results.ValidationProblem(new Dictionary<string, string[]> { ["expectedRevision"] = ["Invalid revision."] }),
        _ => throw new InvalidOperationException("Unexpected invitation issue result.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/classes/{classId:guid}/invitation/revoke", async (
    Guid classId, TeacherClassRevisionRequest request, ClaimsPrincipal principal,
    TeacherClassInvitationService invitations, CancellationToken ct) =>
{
    var result = await invitations.RevokeAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), classId, request.ExpectedRevision, ct);
    return result.Status switch
    {
        ClassInviteStatus.Updated => Results.Ok(result.Response),
        ClassInviteStatus.NotFound => Results.NotFound(),
        ClassInviteStatus.Conflict => Results.Problem(statusCode: 409, title: "Class changed or invitation unavailable."),
        ClassInviteStatus.Invalid => Results.ValidationProblem(new Dictionary<string, string[]> { ["expectedRevision"] = ["Invalid revision."] }),
        _ => throw new InvalidOperationException("Unexpected invitation revoke result.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/student/classes/invitations/accept", async (
    AcceptClassInvitationRequest request, ClaimsPrincipal principal,
    TeacherClassInvitationService invitations, CancellationToken ct) =>
{
    var result = await invitations.AcceptAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!),
        Guid.Parse(principal.FindFirstValue("membership_id")!),
        Guid.Parse(principal.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)!),
        request.Code, ct);
    return result.Status switch
    {
        ClassInviteStatus.Updated => Results.Ok(result.Response),
        ClassInviteStatus.NotFound => Results.NotFound(),
        ClassInviteStatus.Invalid => Results.ValidationProblem(new Dictionary<string, string[]> { ["code"] = ["Code must contain 64 hexadecimal characters."] }),
        ClassInviteStatus.Conflict => Results.Problem(statusCode: 409, title: "Invitation expired or unavailable."),
        _ => throw new InvalidOperationException("Unexpected invitation accept result.")
    };
}).RequireAuthorization("student");

app.MapPost("/api/v1/teacher/students", async (
    TeacherCreateStudentRequest request, ClaimsPrincipal principal,
    TeacherStudentCreator students, CancellationToken cancellationToken) =>
{
    var result = await students.CreateAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), request, cancellationToken);
    return result.Status switch
    {
        TeacherCreateStudentStatus.Created => Results.Created(
            $"/api/v1/teacher/students/{result.Response!.MembershipId}", result.Response),
        TeacherCreateStudentStatus.Duplicate => Results.Ok(result.Response),
        TeacherCreateStudentStatus.Conflict => Results.Problem(statusCode: 409,
            title: "The request ID is already associated with a different student."),
        TeacherCreateStudentStatus.ProgramNotFound => Results.NotFound(),
        TeacherCreateStudentStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        _ => throw new InvalidOperationException("Unknown teacher student create result.")
    };
}).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/students/{membershipId:guid}", async (
    Guid membershipId, ClaimsPrincipal principal, TeacherStudentDirectory directory,
    CancellationToken cancellationToken) =>
{
    var workspaceId = Guid.Parse(principal.FindFirstValue("workspace_id")!);
    var student = await directory.GetAsync(workspaceId, membershipId, cancellationToken);
    return student is null ? Results.NotFound() : Results.Ok(student);
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/students/{membershipId:guid}/edit", async (
    Guid membershipId, TeacherEditStudentRequest request, ClaimsPrincipal principal,
    TeacherStudentEditor students, CancellationToken cancellationToken) =>
{
    var result = await students.EditAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), membershipId, request, cancellationToken);
    return result.Status switch
    {
        TeacherEditStudentStatus.Updated or TeacherEditStudentStatus.Unchanged =>
            Results.Ok(result.Response),
        TeacherEditStudentStatus.Conflict => Results.Problem(statusCode: 409,
            title: "Student details changed since they were loaded, or the name is shared. Reload before editing."),
        TeacherEditStudentStatus.NotFound => Results.NotFound(),
        TeacherEditStudentStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        _ => throw new InvalidOperationException("Unknown teacher edit result.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/students/{membershipId:guid}/archive", async (
    Guid membershipId, ClaimsPrincipal principal, TeacherStudentArchiver students,
    CancellationToken cancellationToken) =>
{
    var result = await students.ArchiveAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), membershipId, cancellationToken);
    return result.Status == TeacherArchiveStudentStatus.NotFound
        ? Results.NotFound()
        : Results.Ok(result.Response);
}).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/lessons", async (
    ClaimsPrincipal principal, TeacherHistoryReader history, CancellationToken cancellationToken) =>
    Results.Ok(await history.ListLessonsAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), cancellationToken)))
    .RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/lessons/{lessonId:guid}/participants/{membershipId:guid}/result", async (
    Guid lessonId, Guid membershipId, TeacherLessonFeedbackRequest request, ClaimsPrincipal principal,
    TeacherLessonCorrectionService lessons, CancellationToken ct) =>
{
    var result = await lessons.FeedbackAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), lessonId, membershipId, request, ct);
    return result.Status switch
    {
        TeacherLessonCorrectionStatus.Updated or TeacherLessonCorrectionStatus.Unchanged => Results.Ok(result.Response),
        TeacherLessonCorrectionStatus.NotFound => Results.NotFound(),
        TeacherLessonCorrectionStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        _ => Results.Problem(statusCode: 409, title: "Результаты изменились. Обновите занятие и повторите изменение.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/lessons/{lessonId:guid}/correct", async (
    Guid lessonId, TeacherLessonCorrectionRequest request, ClaimsPrincipal principal,
    TeacherLessonCorrectionService lessons, CancellationToken cancellationToken) =>
{
    var result = await lessons.CorrectAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), lessonId, request, cancellationToken);
    return result.Status switch
    {
        TeacherLessonCorrectionStatus.Updated or TeacherLessonCorrectionStatus.Unchanged =>
            Results.Ok(result.Response),
        TeacherLessonCorrectionStatus.Conflict => Results.Problem(statusCode: 409,
            title: "The lesson has changed. Reload before correcting it."),
        TeacherLessonCorrectionStatus.NotFound => Results.NotFound(),
        TeacherLessonCorrectionStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        _ => throw new InvalidOperationException("Unknown lesson correction result.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/lessons", async (
    TeacherLessonWriteRequest request, ClaimsPrincipal principal, TeacherLessonService lessons,
    CancellationToken cancellationToken) =>
{
    var workspaceId = Guid.Parse(principal.FindFirstValue("workspace_id")!);
    var result = await lessons.SaveAsync(workspaceId, request, cancellationToken);
    return result.Status switch
    {
        TeacherLessonWriteStatus.Created => Results.Created(
            $"/api/v1/teacher/lessons/{result.Response!.LessonId}", result.Response),
        TeacherLessonWriteStatus.Duplicate => Results.Ok(result.Response),
        TeacherLessonWriteStatus.Conflict => Results.Problem(statusCode: 409,
            title: "The request ID is already associated with a different lesson."),
        TeacherLessonWriteStatus.MembershipNotFound => Results.NotFound(),
        TeacherLessonWriteStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        _ => throw new InvalidOperationException("Unknown teacher lesson write result.")
    };
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/lessons-with-homework", async (
    TeacherLessonHomeworkRequest request, ClaimsPrincipal principal,
    TeacherLessonHomeworkService lessons, CancellationToken cancellationToken) =>
{
    var result = await lessons.SaveAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), request, cancellationToken);
    return result.Status switch
    {
        TeacherLessonHomeworkStatus.Created => Results.Created(
            $"/api/v1/teacher/lessons/{result.Response!.Lesson.LessonId}", result.Response),
        TeacherLessonHomeworkStatus.Duplicate => Results.Ok(result.Response),
        TeacherLessonHomeworkStatus.Conflict => Results.Problem(statusCode: 409,
            title: "The request conflicts with a saved lesson or pending homework assignment."),
        TeacherLessonHomeworkStatus.NotFound => Results.NotFound(),
        TeacherLessonHomeworkStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        _ => throw new InvalidOperationException("Unknown combined lesson write result.")
    };
}).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/subscriptions", async (
    ClaimsPrincipal principal, TeacherHistoryReader history, CancellationToken cancellationToken) =>
    Results.Ok(await history.ListSubscriptionsAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), cancellationToken)))
    .RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/subscriptions/{membershipId:guid}", async (
    Guid membershipId, TeacherSubscriptionWriteRequest request, ClaimsPrincipal principal,
    TeacherSubscriptionService subscriptions, CancellationToken cancellationToken) =>
{
    var result = await subscriptions.SaveAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), membershipId, request, cancellationToken);
    return result.Status switch
    {
        TeacherSubscriptionWriteStatus.Created => Results.Created(
            $"/api/v1/teacher/subscriptions/{membershipId}", result.Response),
        TeacherSubscriptionWriteStatus.Updated or TeacherSubscriptionWriteStatus.Duplicate => Results.Ok(result.Response),
        TeacherSubscriptionWriteStatus.Conflict => Results.Problem(statusCode: 409,
            title: "The subscription changed; reload it before saving."),
        TeacherSubscriptionWriteStatus.NotFound => Results.NotFound(),
        TeacherSubscriptionWriteStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        _ => throw new InvalidOperationException("Unknown teacher subscription write result.")
    };
}).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/library-folders",async(ClaimsPrincipal principal,TeacherLibraryFolderService folders,CancellationToken ct)=>
    Results.Ok(await folders.ListAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!),ct))).RequireAuthorization("teacher");
app.MapPost("/api/v1/teacher/library-folders",async(CreateLibraryFolderRequest request,ClaimsPrincipal principal,TeacherLibraryFolderService folders,CancellationToken ct)=>
    NativeWrite(await folders.WriteAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!),null,request.RequestId,0,request.Title,ct))).RequireAuthorization("teacher");
app.MapPost("/api/v1/teacher/library-folders/{id:guid}/rename",async(Guid id,RenameLibraryFolderRequest request,ClaimsPrincipal principal,TeacherLibraryFolderService folders,CancellationToken ct)=>
    NativeWrite(await folders.WriteAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!),id,request.RequestId,request.ExpectedRevision,request.Title,ct))).RequireAuthorization("teacher");
app.MapPost("/api/v1/teacher/materials/{id:guid}/move",async(Guid id,MoveMaterialRequest request,ClaimsPrincipal principal,TeacherMaterialManagement materials,CancellationToken ct)=>
    NativeWrite(await materials.MoveAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!),id,request,ct))).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/recordings",async(ClaimsPrincipal principal,HttpResponse response,LessonRecordingService recordings,CancellationToken ct)=> {
    response.Headers.CacheControl="no-store";return Results.Ok(await recordings.TeacherListAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!),ct));
}).RequireAuthorization("teacher");
app.MapPost("/api/v1/teacher/recordings",async(RecordingWriteRequest request,ClaimsPrincipal principal,LessonRecordingService recordings,CancellationToken ct)=>
    NativeWrite(await recordings.WriteAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!),null,request,ct))).RequireAuthorization("teacher");
app.MapPost("/api/v1/teacher/recordings/{id:guid}/edit",async(Guid id,RecordingWriteRequest request,ClaimsPrincipal principal,LessonRecordingService recordings,CancellationToken ct)=>
    NativeWrite(await recordings.WriteAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!),id,request,ct))).RequireAuthorization("teacher");
app.MapGet("/api/v1/teacher/recordings/{id:guid}/source",async(Guid id,ClaimsPrincipal principal,HttpResponse response,LessonRecordingService recordings,CancellationToken ct)=> {
    response.Headers.CacheControl="no-store";return await recordings.TeacherSourceAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!),id,ct) is {} url?Results.Ok(new{url}):Results.NotFound();
}).RequireAuthorization("teacher");
app.MapGet("/api/v1/recordings",async(ClaimsPrincipal principal,HttpResponse response,LessonRecordingService recordings,CancellationToken ct)=> {
    response.Headers.CacheControl="no-store";return await recordings.StudentListAsync(principal,ct) is {} rows?Results.Ok(rows):Results.Unauthorized();
}).RequireAuthorization("student");
app.MapGet("/api/v1/recordings/{id:guid}/source",async(Guid id,ClaimsPrincipal principal,HttpResponse response,LessonRecordingService recordings,CancellationToken ct)=> {
    response.Headers.CacheControl="no-store";return await recordings.StudentSourceAsync(principal,id,ct) is {} url?Results.Ok(new{url}):Results.NotFound();
}).RequireAuthorization("student");

app.MapPost("/api/v1/teacher/materials/{id:guid}/rename",async(Guid id,RenameMaterialRequest request,ClaimsPrincipal principal,TeacherMaterialManagement materials,CancellationToken ct)=>
    NativeWrite(await materials.RenameAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!),id,request,ct))).RequireAuthorization("teacher");
app.MapPost("/api/v1/teacher/materials/{id:guid}/unlink",async(Guid id,UnlinkMaterialRequest request,ClaimsPrincipal principal,TeacherMaterialManagement materials,CancellationToken ct)=>
    NativeWrite(await materials.UnlinkAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!),id,request,ct))).RequireAuthorization("teacher");
app.MapPost("/api/v1/teacher/materials/{id:guid}/delete",async(Guid id,DeleteMaterialRequest request,ClaimsPrincipal principal,TeacherMaterialManagement materials,CancellationToken ct)=>
    NativeWrite(await materials.DeleteAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!),id,request,ct))).RequireAuthorization("teacher");

// Authorization is carried in headers; file IDs are never public download URLs.
static IResult FileResult(HttpResponse response, FileDownload? file)
{
    response.Headers.CacheControl="no-store";response.Headers["X-Content-Type-Options"]="nosniff";
    return file is null ? Results.NotFound() : Results.File(file.Bytes,file.ContentType,file.FileName);
}
app.MapPost("/api/v1/teacher/files/{requestId:guid}", async (Guid requestId,string? fileName,string? title,
    HttpRequest request,ClaimsPrincipal principal,TeacherFileService files,CancellationToken ct) =>
{
    var result=await files.UploadAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!),requestId,fileName,title,request.Body,request.ContentLength,ct);
    return result.Status is 200 or 201 ? Results.Json(result.Value,statusCode:result.Status) : Results.Problem(statusCode:result.Status,title:result.Value?.ToString());
}).RequireAuthorization("teacher").RequireRateLimiting("file-uploads");
app.MapGet("/api/v1/teacher/files/{id:guid}/content",async(Guid id,HttpResponse response,ClaimsPrincipal principal,TeacherFileService files,CancellationToken ct)=>
    FileResult(response,await files.TeacherDownloadAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!),id,ct))).RequireAuthorization("teacher");
app.MapGet("/api/v1/files",async(HttpResponse response,ClaimsPrincipal principal,TeacherFileService files,CancellationToken ct)=>
{
    response.Headers.CacheControl="no-store";
    return await files.StudentFilesAsync(principal,ct) is {} rows ? Results.Ok(rows) : Results.Unauthorized();
}).RequireAuthorization("student");
app.MapGet("/api/v1/files/{id:guid}/content",async(Guid id,HttpResponse response,ClaimsPrincipal principal,TeacherFileService files,CancellationToken ct)=>
    FileResult(response,await files.StudentDownloadAsync(principal,id,ct))).RequireAuthorization("student");

app.MapGet("/api/v1/teacher/homework/catalog", async (
    ClaimsPrincipal principal, TeacherHomeworkReader homework, CancellationToken cancellationToken) =>
    Results.Ok(await homework.CatalogAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), cancellationToken)))
    .RequireAuthorization("teacher");

static IResult NativeWrite((int Status, object? Value) result) => result.Status switch
{
    200 => Results.Ok(result.Value),
    201 => Results.Json(result.Value, statusCode: 201),
    400 => Results.Problem(statusCode: 400, title: result.Value?.ToString()),
    404 => Results.NotFound(),
    409 => Results.Problem(statusCode: 409, title: result.Value?.ToString()),
    401 => Results.Unauthorized(),
    _ => throw new InvalidOperationException("Unknown native homework result.")
};

app.MapGet("/api/v1/teacher/homework/native/tasks", async (ClaimsPrincipal principal,
    NativeHomeworkService homework, CancellationToken ct) =>
    Results.Ok(await homework.TasksAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), ct)))
    .RequireAuthorization("teacher");
app.MapPost("/api/v1/teacher/homework/native/tasks", async (CreateNativeTaskRequest request,
    ClaimsPrincipal principal, NativeHomeworkService homework, CancellationToken ct) =>
    NativeWrite(await homework.CreateAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct)))
    .RequireAuthorization("teacher");
app.MapGet("/api/v1/teacher/homework/native/assignments", async (ClaimsPrincipal principal,
    NativeHomeworkService homework, CancellationToken ct) =>
    Results.Ok(await homework.TeacherAssignmentsAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), ct)))
    .RequireAuthorization("teacher");
app.MapGet("/api/v1/teacher/groups/{groupId:guid}/homework", async (Guid groupId, ClaimsPrincipal principal,
    NativeHomeworkService homework, CancellationToken ct) =>
    await homework.GroupAssignmentsAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), groupId, ct) is { } rows
        ? Results.Ok(rows) : Results.NotFound())
    .RequireAuthorization("teacher");
app.MapGet("/api/v1/teacher/classes/{classId:guid}/homework", async (Guid classId, ClaimsPrincipal principal,
    NativeHomeworkService homework, CancellationToken ct) =>
    await homework.ClassAssignmentsAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), classId, ct) is { } rows
        ? Results.Ok(rows) : Results.NotFound())
    .RequireAuthorization("teacher");
app.MapGet("/api/v1/teacher/lessons/{lessonId:guid}/homework", async (Guid lessonId, ClaimsPrincipal principal,
    NativeHomeworkService homework, CancellationToken ct) =>
    await homework.LessonAssignmentsAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), lessonId, ct) is { } rows
        ? Results.Ok(rows) : Results.NotFound())
    .RequireAuthorization("teacher");
app.MapPost("/api/v1/teacher/homework/native/context-assignments", async (AssignNativeTaskRequest request,
    ClaimsPrincipal principal, NativeHomeworkService homework, CancellationToken ct) =>
    request.GroupClassId is null && request.IndividualClassId is null
        ? NativeWrite((400, "Class context is required."))
        : NativeWrite(await homework.AssignAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct)))
    .RequireAuthorization("teacher");
app.MapPost("/api/v1/teacher/homework/native/group-assignments", async (AssignNativeTaskRequest request,
    ClaimsPrincipal principal, NativeHomeworkService service, CancellationToken ct) =>
    request.GroupClassId is null
        ? NativeWrite((400, "Group is required."))
        : NativeWrite(await service.AssignAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct)))
    .RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/homework/native/assignments", async (AssignNativeTaskRequest request,
    ClaimsPrincipal principal, NativeHomeworkService homework, CancellationToken ct) =>
    NativeWrite(await homework.AssignAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct)))
    .RequireAuthorization("teacher");
app.MapPost("/api/v1/teacher/homework/native/grades", async (GradeNativeAnswerRequest request,
    ClaimsPrincipal principal, NativeHomeworkService homework, CancellationToken ct) =>
    NativeWrite(await homework.GradeAsync(Guid.Parse(principal.FindFirstValue("workspace_id")!), request, ct)))
    .RequireAuthorization("teacher");
app.MapGet("/api/v1/homework/native/assignments", async (ClaimsPrincipal principal,
    NativeHomeworkService homework, CancellationToken ct) =>
    await homework.StudentAssignmentsAsync(principal, ct) is { } items ? Results.Ok(items) : Results.Unauthorized())
    .RequireAuthorization("student");
app.MapPost("/api/v1/homework/native/submissions", async (SubmitNativeAnswerRequest request,
    ClaimsPrincipal principal, NativeHomeworkService homework, CancellationToken ct) =>
    NativeWrite(await homework.SubmitAsync(principal, request, ct)))
    .RequireAuthorization("student");

app.MapPost("/api/v1/teacher/homework/catalog", async (
    TeacherCreateHomeworkCatalogRequest request, ClaimsPrincipal principal,
    TeacherHomeworkCatalogService catalog, CancellationToken cancellationToken) =>
{
    var result = await catalog.CreateAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), request, cancellationToken);
    return result.Status switch
    {
        TeacherCreateHomeworkCatalogStatus.Created => Results.Created(
            $"/api/v1/teacher/homework/catalog/{result.Response!.Id}", result.Response),
        TeacherCreateHomeworkCatalogStatus.Duplicate => Results.Ok(result.Response),
        TeacherCreateHomeworkCatalogStatus.Conflict => Results.Problem(statusCode: 409,
            title: "The request ID is already associated with another catalog item."),
        TeacherCreateHomeworkCatalogStatus.NotFound => Results.NotFound(),
        TeacherCreateHomeworkCatalogStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        _ => throw new InvalidOperationException("Unknown catalog create result.")
    };
}).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/homework/assignments", async (
    Guid? membershipId, ClaimsPrincipal principal, TeacherHomeworkReader homework,
    CancellationToken cancellationToken) =>
    Results.Ok(await homework.AssignmentsAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), membershipId, cancellationToken)))
    .RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher/homework/assignments", async (
    TeacherAssignHomeworkRequest request, ClaimsPrincipal principal,
    TeacherHomeworkAssignmentService homework, CancellationToken cancellationToken) =>
{
    var result = await homework.AssignAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), request, cancellationToken);
    return result.Status switch
    {
        TeacherAssignHomeworkStatus.Created => Results.Created(
            "/api/v1/teacher/homework/assignments", result.Response),
        TeacherAssignHomeworkStatus.Duplicate => Results.Ok(result.Response),
        TeacherAssignHomeworkStatus.Conflict => Results.Problem(statusCode: 409,
            title: "The request ID is already associated with different assignments."),
        TeacherAssignHomeworkStatus.NotFound => Results.NotFound(),
        TeacherAssignHomeworkStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        _ => throw new InvalidOperationException("Unknown teacher homework assignment result.")
    };
}).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/homework/submissions", async (
    Guid? membershipId, ClaimsPrincipal principal, TeacherHomeworkReader homework,
    CancellationToken cancellationToken) =>
    Results.Ok(await homework.SubmissionsAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), membershipId, cancellationToken)))
    .RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/tests/history", async (
    Guid? membershipId, ClaimsPrincipal principal, TeacherResultsReader results,
    CancellationToken cancellationToken) =>
    Results.Ok(await results.TestsAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), membershipId, cancellationToken)))
    .RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/tests/attempts", async (
    Guid? membershipId, ClaimsPrincipal principal, TeacherResultsReader results,
    CancellationToken cancellationToken) =>
    Results.Ok(await results.LiveTestsAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), membershipId, cancellationToken)))
    .RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/mocks/results", async (
    Guid? membershipId, ClaimsPrincipal principal, TeacherResultsReader results,
    CancellationToken cancellationToken) =>
    Results.Ok(await results.MocksAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), membershipId, cancellationToken)))
    .RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/mocks/tasks", async (
    Guid? membershipId, ClaimsPrincipal principal, TeacherResultsReader results,
    CancellationToken cancellationToken) =>
    Results.Ok(await results.MockTasksAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), membershipId, cancellationToken)))
    .RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/mocks/sessions", async (
    Guid? membershipId, ClaimsPrincipal principal, TeacherResultsReader results,
    CancellationToken cancellationToken) =>
    Results.Ok(await results.MockSessionsAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), membershipId, cancellationToken)))
    .RequireAuthorization("teacher");

app.MapPost("/api/v1/teacher-sessions/logout", async (
    ClaimsPrincipal principal, TeacherSessionService sessions, CancellationToken cancellationToken) =>
{
    await sessions.RevokeCurrentAsync(principal, cancellationToken);
    return Results.NoContent();
}).RequireAuthorization("teacher");

app.MapPost("/api/v1/test-attempts", async (
    TestAttemptRequest request,
    ClaimsPrincipal principal,
    TestAttemptService attempts,
    CancellationToken cancellationToken) =>
{
    var result = await attempts.SubmitAsync(principal, request, cancellationToken);
    return result.Status switch
    {
        TestAttemptWriteStatus.Created => Results.Created(
            $"/api/v1/test-attempts/{result.Response!.AttemptId}", result.Response),
        TestAttemptWriteStatus.Duplicate => Results.Ok(result.Response),
        TestAttemptWriteStatus.Conflict => Results.Problem(
            statusCode: StatusCodes.Status409Conflict,
            title: "The event ID is already associated with a different test attempt."),
        TestAttemptWriteStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        TestAttemptWriteStatus.InvalidIdentity => Results.Problem(
            statusCode: StatusCodes.Status401Unauthorized,
            title: "The student session is invalid."),
        _ => throw new InvalidOperationException("Unknown test-attempt write result.")
    };
}).RequireAuthorization("student");

app.MapGet("/api/v1/homework-assignments", async (
    ClaimsPrincipal principal,
    HomeworkService homework,
    CancellationToken cancellationToken) =>
{
    var assignments = await homework.ListAssignmentsAsync(principal, cancellationToken);
    return assignments is null
        ? Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "The student session is invalid.")
        : Results.Ok(assignments);
}).RequireAuthorization("student");

app.MapPost("/api/v1/homework-submissions", async (
    HomeworkSubmissionRequest request,
    ClaimsPrincipal principal,
    HomeworkService homework,
    CancellationToken cancellationToken) =>
{
    var result = await homework.SubmitAsync(principal, request, cancellationToken);
    return result.Status switch
    {
        HomeworkSubmissionWriteStatus.Created => Results.Created(
            $"/api/v1/homework-submissions/{result.Response!.SubmissionId}", result.Response),
        HomeworkSubmissionWriteStatus.Duplicate => Results.Ok(result.Response),
        HomeworkSubmissionWriteStatus.Conflict => Results.Problem(
            statusCode: StatusCodes.Status409Conflict,
            title: "The event ID is already associated with a different homework submission."),
        HomeworkSubmissionWriteStatus.AssignmentNotFound => Results.Problem(
            statusCode: StatusCodes.Status404NotFound,
            title: "No matching homework assignment was found for this student."),
        HomeworkSubmissionWriteStatus.InvalidRequest => Results.ValidationProblem(result.Errors!),
        HomeworkSubmissionWriteStatus.InvalidIdentity => Results.Problem(
            statusCode: StatusCodes.Status401Unauthorized,
            title: "The student session is invalid."),
        _ => throw new InvalidOperationException("Unknown homework write result.")
    };
}).RequireAuthorization("student");

app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = registration => registration.Tags.Contains("ready") });
app.MapHealthChecks("/health/migrations", new HealthCheckOptions { Predicate = registration => registration.Tags.Contains("migrations") });

await app.RunAsync();

public partial class Program;
