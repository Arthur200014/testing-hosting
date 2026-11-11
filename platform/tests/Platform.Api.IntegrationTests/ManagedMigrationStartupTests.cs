using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.IntegrationTests;

public sealed class ManagedMigrationStartupTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task RequiresExactOptInAndDoesNotMigrateWithoutIt()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("MigrationStartupTest");

        var defaultConfiguration = new ConfigurationBuilder().Build();
        Assert.False(await ManagedMigrationStartup.ApplyIfRequestedAsync(
            defaultConfiguration, db, logger));

        var wrongValue = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                [ManagedMigrationStartup.Setting] = "true"
            }).Build();
        Assert.False(await ManagedMigrationStartup.ApplyIfRequestedAsync(
            wrongValue, db, logger));
    }

    [Fact]
    public async Task PinnedOptInIsSafeToRepeatForAlreadyAppliedMigrations()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await db.Database.MigrateAsync();

        var approvedConfiguration = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>
            {
                [ManagedMigrationStartup.Setting] = ManagedMigrationStartup.ApprovedValue
            }).Build();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("MigrationStartupTest");

        Assert.True(await ManagedMigrationStartup.ApplyIfRequestedAsync(
            approvedConfiguration, db, logger));
        Assert.Contains("20261111120000_TeacherSessions",
            await db.Database.GetAppliedMigrationsAsync());
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }
}
