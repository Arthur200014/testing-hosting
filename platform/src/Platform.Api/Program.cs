using System.Security.Claims;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TestingHosting.Platform.Configuration;
using TestingHosting.Platform.Homework;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.StudentSessions;
using TestingHosting.Platform.Students;
using TestingHosting.Platform.TestAttempts;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton(serviceProvider =>
    StartupConfiguration.GetJwtOptions(serviceProvider.GetRequiredService<IConfiguration>()));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IStudentCodeHasher>(serviceProvider =>
    new StudentCodeHasher(StartupConfiguration.GetPepper(serviceProvider.GetRequiredService<IConfiguration>())));
builder.Services.AddScoped<StudentSessionService>();
builder.Services.AddScoped<TestAttemptService>();
builder.Services.AddScoped<HomeworkService>();
builder.Services.AddSingleton<StudentTokenIssuer>();
builder.Services.AddDbContext<PlatformDbContext>(options =>
    options.UseNpgsql(
        StartupConfiguration.GetConnectionString(builder.Configuration),
        postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "public")));
builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database", tags: ["ready"]);

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
builder.Services.AddAuthorization(options => options.AddPolicy("student", policy =>
    policy.RequireAuthenticatedUser().RequireClaim("role", "student")));
builder.Services.AddCors(options => options.AddPolicy("browser", policy =>
    policy.WithOrigins(StartupConfiguration.GetAllowedOrigins(builder.Configuration))
        .WithMethods("GET", "POST").WithHeaders("Content-Type", "Authorization")));
builder.Services.AddRateLimiter(options =>
{
    var studentSessionOptions = StartupConfiguration.GetStudentSessionOptions(builder.Configuration);
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
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

await app.RunAsync();

public partial class Program;
