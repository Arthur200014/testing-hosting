using System.Security.Claims;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using TestingHosting.Platform.IdentityAccess;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TestingHosting.Platform.Configuration;
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
builder.Services.AddScoped<TeacherStudentDirectory>();
builder.Services.AddScoped<TeacherHistoryReader>();
builder.Services.AddScoped<TeacherLessonService>();
builder.Services.AddScoped<TeacherLessonHomeworkService>();
builder.Services.AddScoped<TeacherSubscriptionService>();
builder.Services.AddScoped<TeacherHomeworkReader>();
builder.Services.AddScoped<TeacherHomeworkAssignmentService>();
builder.Services.AddSingleton(serviceProvider => new TeacherInviteCodeIssuer(
    StartupConfiguration.GetPepper(serviceProvider.GetRequiredService<IConfiguration>())));
builder.Services.AddScoped<TeacherStudentCreator>();
builder.Services.AddScoped<TeacherResultsReader>();
builder.Services.AddSingleton<IPasswordHasher<TeacherUser>, PasswordHasher<TeacherUser>>();
builder.Services.AddSingleton<TeacherTokenIssuer>();
builder.Services.AddScoped<IAuthorizationHandler, ActiveTeacherSessionHandler>();
builder.Services.AddScoped<TestAttemptService>();
builder.Services.AddScoped<HomeworkService>();
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
        .WithMethods("GET", "POST").WithHeaders("Content-Type", "Authorization")));
builder.Services.AddRateLimiter(options =>
{
    var studentSessionOptions = StartupConfiguration.GetStudentSessionOptions(builder.Configuration);
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
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

app.MapGet("/api/v1/teacher/me", (ClaimsPrincipal principal) => Results.Ok(new
{
    TeacherId = principal.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub),
    WorkspaceId = principal.FindFirstValue("workspace_id"),
    MembershipId = principal.FindFirstValue("membership_id"),
    WorkspaceRole = principal.FindFirstValue("workspace_role")
})).RequireAuthorization("teacher");

app.MapGet("/api/v1/teacher/students", async (
    ClaimsPrincipal principal, TeacherStudentDirectory directory, CancellationToken cancellationToken) =>
{
    var workspaceId = Guid.Parse(principal.FindFirstValue("workspace_id")!);
    return Results.Ok(await directory.ListAsync(workspaceId, cancellationToken));
}).RequireAuthorization("teacher");

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

app.MapGet("/api/v1/teacher/lessons", async (
    ClaimsPrincipal principal, TeacherHistoryReader history, CancellationToken cancellationToken) =>
    Results.Ok(await history.ListLessonsAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), cancellationToken)))
    .RequireAuthorization("teacher");

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

app.MapGet("/api/v1/teacher/homework/catalog", async (
    ClaimsPrincipal principal, TeacherHomeworkReader homework, CancellationToken cancellationToken) =>
    Results.Ok(await homework.CatalogAsync(
        Guid.Parse(principal.FindFirstValue("workspace_id")!), cancellationToken)))
    .RequireAuthorization("teacher");

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
