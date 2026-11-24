using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TestingHosting.Platform.Configuration;
using TestingHosting.Platform.IdentityAccess;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.IntegrationTests;

public sealed partial class TeacherSessionTests
{
    [Fact]
    public async Task ProgramLookupCachesPerWorkspaceAfterAuthorization()
    {
        await ResetAsync(factory);
        var first = await SeedAsync(factory, "cache-north", "cache-north@example.invalid", "owner");
        var second = await SeedAsync(factory, "cache-south", "cache-south@example.invalid", "owner");
        await SeedStudentAsync(factory, first.WorkspaceId, "Cache first", true);
        await SeedStudentAsync(factory, second.WorkspaceId, "Cache second", true);

        var connection = Environment.GetEnvironmentVariable("TEST_REDIS_CONNECTION_STRING");
        using var app = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
                new Dictionary<string, string?> { ["Redis:ConnectionString"] = connection ?? "127.0.0.1:1" }));
            if (string.IsNullOrWhiteSpace(connection))
                builder.ConfigureServices(services =>
                {
                    services.RemoveAll<IDistributedCache>();
                    services.AddDistributedMemoryCache();
                });
        });
        using var client = app.CreateClient();
        const string path = "/api/v1/teacher/programs";
        using var anonymous = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        Assert.False(anonymous.Headers.Contains("X-TAS-Cache"));
        await Login("cache-north");
        var original = await ReadPrograms(client, "miss");
        var cache = app.Services.GetRequiredService<IDistributedCache>();
        var key = $"{first.WorkspaceId:N}:programs";
        Assert.NotNull(await cache.GetStringAsync(key));
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var program = await db.Programs.SingleAsync(p => p.Id == original.Id);
            program.DisplayName = "Updated after cache fill";
            await db.SaveChangesAsync();
        }
        Assert.Equal(original, await ReadPrograms(client, "hit"));
        await Login("cache-south");
        var other = await ReadPrograms(client, "miss");
        Assert.NotEqual(original.Id, other.Id);
        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
        await cache.RemoveAsync(key);
        await Login("cache-north");
        Assert.Equal("Updated after cache fill", (await ReadPrograms(client, "miss")).DisplayName);

        await cache.SetStringAsync(key, "invalid JSON");
        var repaired = await ReadPrograms(client, "miss");
        Assert.Equal("Updated after cache fill", repaired.DisplayName);
        Assert.Equal(repaired, await ReadPrograms(client, "hit"));

        using var appWithUnreachableRedis = factory.WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
                new Dictionary<string, string?> { ["Redis:ConnectionString"] = "127.0.0.1:1" })));
        using var fallback = appWithUnreachableRedis.CreateClient();
        fallback.DefaultRequestHeaders.Authorization = client.DefaultRequestHeaders.Authorization;
        Assert.Equal(repaired, await ReadPrograms(fallback, "fallback"));
        Assert.True(appWithUnreachableRedis.Services.GetRequiredService<WorkspaceCacheAvailability>().IsCoolingDown);
        Assert.Equal(repaired, await ReadPrograms(fallback, "fallback"));

        using var appWithoutRedis = factory.WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(
                new Dictionary<string, string?> { ["Redis:ConnectionString"] = "" })));
        using var disabled = appWithoutRedis.CreateClient();
        disabled.DefaultRequestHeaders.Authorization = client.DefaultRequestHeaders.Authorization;
        Assert.Equal(repaired, await ReadPrograms(disabled, "disabled"));

        async Task<ProgramLookup> ReadPrograms(HttpClient caller, string expectedStatus)
        {
            using var response = await caller.GetAsync(path);
            response.EnsureSuccessStatusCode();
            Assert.Equal(expectedStatus, Assert.Single(response.Headers.GetValues("X-TAS-Cache")));
            Assert.True(response.Headers.CacheControl?.NoStore ?? false);
            return Assert.Single((await response.Content.ReadFromJsonAsync<ProgramLookup[]>())!);
        }

        async Task Login(string slug)
        {
            var response = await LoginAsync(client, slug, $"{slug}@example.invalid", Password);
            response.EnsureSuccessStatusCode();
            var session = (await response.Content.ReadFromJsonAsync<TeacherLoginResponse>())!;
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.AccessToken);
        }
    }

    [Fact]
    public void WorkspaceCacheRetriesAfterCooldown()
    {
        var clock = new CacheTestClock();
        var availability = new WorkspaceCacheAvailability(clock);
        Assert.False(availability.IsCoolingDown);
        availability.ReportFailure();
        clock.Advance(9);
        Assert.True(availability.IsCoolingDown);
        clock.Advance(1);
        Assert.False(availability.IsCoolingDown);
    }

    private sealed class CacheTestClock : TimeProvider
    {
        private long timestamp;

        public override long TimestampFrequency => 1000;
        public override long GetTimestamp() => timestamp;
        public void Advance(int seconds) => timestamp += seconds * TimestampFrequency;
    }
}
