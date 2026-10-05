using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace TestingHosting.Platform.Persistence;

public sealed class DatabaseHealthCheck(PlatformDbContext dbContext) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await dbContext.Database.CanConnectAsync(cancellationToken)
                ? HealthCheckResult.Healthy()
                : HealthCheckResult.Unhealthy("Database connection failed.");
        }
        catch (Exception exception)
        {
            return HealthCheckResult.Unhealthy("Database connection failed.", exception);
        }
    }
}
