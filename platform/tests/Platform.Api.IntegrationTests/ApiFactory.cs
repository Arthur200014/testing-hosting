using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace TestingHosting.Platform.IntegrationTests;

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly int rateLimit;

    public ApiFactory() : this(100)
    {
    }

    internal ApiFactory(int rateLimit)
    {
        this.rateLimit = rateLimit;
    }

    public const string Issuer = "integration-test-issuer";
    public const string Audience = "integration-test-students";
    public static readonly string SigningKey = Convert.ToBase64String(Enumerable.Repeat((byte)0x31, 32).ToArray());
    public static readonly string Pepper = Convert.ToBase64String(Enumerable.Repeat((byte)0x62, 32).ToArray());

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var connectionString = Environment.GetEnvironmentVariable("TEST_DATABASE_CONNECTION_STRING")
            ?? throw new InvalidOperationException("TEST_DATABASE_CONNECTION_STRING is required.");

        builder.UseEnvironment("IntegrationTests");
        builder.UseContentRoot(AppContext.BaseDirectory);
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                ["Database:ConnectionString"] = connectionString,
                ["Jwt:Issuer"] = Issuer,
                ["Jwt:Audience"] = Audience,
                ["Jwt:SigningKey"] = SigningKey,
                ["Jwt:LifetimeMinutes"] = "5",
                ["StudentCodes:Pepper"] = Pepper,
                ["Cors:AllowedOrigins:0"] = "https://tests.invalid",
                ["StudentSessions:RateLimitPermitLimit"] = rateLimit.ToString(),
                ["StudentSessions:RateLimitWindowSeconds"] = "60"
            }));
    }
}
