using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace TestingHosting.Platform.Persistence;

/// <summary>Bounded, read-only EF migration check; never applies migrations.</summary>
public sealed class DatabaseMigrationsHealthCheck(
    PlatformDbContext dbContext,
    ILogger<DatabaseMigrationsHealthCheck> logger) : IHealthCheck
{
    private static readonly TimeSpan QueryTimeout = TimeSpan.FromSeconds(4);

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(QueryTimeout);
        try
        {
            // A blocked history-table read must not tie up Timeweb's HTTP proxy.
            // This DbContext is scoped to the health request.
            dbContext.Database.SetCommandTimeout(QueryTimeout);
            var pending = await dbContext.Database.GetPendingMigrationsAsync(timeout.Token);
            return pending.Any()
                ? HealthCheckResult.Unhealthy("Database migrations are pending.")
                : HealthCheckResult.Healthy();
        }
        catch (OperationCanceledException) when (timeout.IsCancellationRequested)
        {
            logger.LogWarning("Database migration health check timed out.");
            return HealthCheckResult.Unhealthy("Database migration check timed out.");
        }
        catch (Exception exception)
        {
            // Never log database connection strings, SQL or exception messages.
            logger.LogWarning("Database migration health check failed ({ExceptionType}).",
                exception.GetType().Name);
            return HealthCheckResult.Unhealthy("Database migration check failed.");
        }
    }
}
