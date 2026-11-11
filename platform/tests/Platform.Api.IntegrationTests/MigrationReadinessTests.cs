using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.IntegrationTests;

public sealed class MigrationReadinessTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task MigrationHealthIsReadOnlyAndHealthyAfterCommittedMigrations()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await db.Database.MigrateAsync();
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());

        using var client = factory.CreateClient();
        var live = await client.GetAsync("/health/live");
        var ready = await client.GetAsync("/health/ready");
        var migrationStatus = await client.GetAsync("/health/migrations");
        Assert.Equal(HttpStatusCode.OK, live.StatusCode);
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
        Assert.Equal(HttpStatusCode.OK, migrationStatus.StatusCode);
        Assert.Equal("Healthy", await migrationStatus.Content.ReadAsStringAsync());

        // The health endpoint must not perform schema writes.
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }
}
