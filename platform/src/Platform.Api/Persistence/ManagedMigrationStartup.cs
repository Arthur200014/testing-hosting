using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace TestingHosting.Platform.Persistence;

/// <summary>
/// Opt-in bootstrap for App Platform deployments that have no interactive container shell.
/// Pinned to an existing migration so leaving the flag set cannot apply future migrations.
/// </summary>
public static class ManagedMigrationStartup
{
    public const string Setting = "TAS_MIGRATE_ON_STARTUP";
    public const string ApprovedValue = "apply-20261111120000_TeacherSessions";
    private const string TargetMigration = "20261111120000_TeacherSessions";

    public static async Task<bool> ApplyIfRequestedAsync(
        IConfiguration configuration,
        PlatformDbContext dbContext,
        ILogger logger,
        CancellationToken cancellationToken = default)
    {
        if (configuration[Setting] != ApprovedValue)
            return false;

        var applied = (await dbContext.Database.GetAppliedMigrationsAsync(cancellationToken)).ToArray();
        if (applied.Contains(TargetMigration, StringComparer.Ordinal))
        {
            logger.LogInformation("Approved database migration already applied; no schema changes.");
            return true;
        }

        var pending = (await dbContext.Database.GetPendingMigrationsAsync(cancellationToken)).ToArray();
        if (pending.LastOrDefault() != TargetMigration)
            throw new InvalidOperationException(
                "Approved migration target does not match the current application build.");

        logger.LogWarning("Applying explicitly approved database migrations up to the pinned target.");
        await dbContext.Database.MigrateAsync(cancellationToken);
        logger.LogInformation("Approved database migrations completed. Remove TAS_MIGRATE_ON_STARTUP.");
        return true;
    }
}
