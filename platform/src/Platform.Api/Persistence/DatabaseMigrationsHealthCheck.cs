using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace TestingHosting.Platform.Persistence;

/// <summary>Read-only check of EF migration history. Does not apply migrations or expose schema details.</summary>
public sealed class DatabaseMigrationsHealthCheck(PlatformDbContext dbContext) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var pending = await dbContext.Database.GetPendingMigrationsAsync(cancellationToken);
            return pending.Any()
                ? HealthCheckResult.Unhealthy("Database migrations are pending.")
                : HealthCheckResult.Healthy();
        }
        catch (Exception)
        {
            return HealthCheckResult.Unhealthy("Database migration check failed.");
        }
    }
}
