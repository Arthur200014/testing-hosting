using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using StackExchange.Redis;

namespace TestingHosting.Platform.Configuration;

public sealed class WorkspaceLookupCache(
    IServiceProvider services,
    IConfiguration configuration,
    WorkspaceCacheAvailability availability,
    ILogger<WorkspaceLookupCache> log)
{
    private static readonly DistributedCacheEntryOptions Lifetime = new()
    {
        AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30)
    };

    public async Task<(T Value, string Status)> ReadAsync<T>(Guid workspaceId, string resource, Func<Task<T>> load, CancellationToken ct)
        where T : class
    {
        if (string.IsNullOrWhiteSpace(configuration["Redis:ConnectionString"])) return (await load(), "disabled");
        if (availability.IsCoolingDown) return (await load(), "fallback");

        var cache = services.GetRequiredService<IDistributedCache>();
        var key = $"{workspaceId:N}:{resource}";
        try
        {
            var cached = await cache.GetStringAsync(key, ct);
            if (cached is not null && JsonSerializer.Deserialize<T>(cached) is { } value)
                return (value, "hit");
        }
        catch (JsonException)
        {
            // A failed decode should be repaired on the same request, without treating Redis as down.
            log.LogWarning("Workspace lookup cache contained invalid JSON for {Resource}", resource);
        }
        catch (Exception error) when (error is RedisException or TimeoutException)
        {
            availability.ReportFailure();
            log.LogWarning("Workspace lookup cache read failed for {Resource}: {ErrorType}", resource, error.GetType().Name);
            return (await load(), "fallback");
        }

        var fresh = await load();
        if (availability.IsCoolingDown) return (fresh, "fallback");
        try
        {
            await cache.SetStringAsync(key, JsonSerializer.Serialize(fresh), Lifetime, ct);
        }
        catch (Exception error) when (error is RedisException or TimeoutException)
        {
            availability.ReportFailure();
            log.LogWarning("Workspace lookup cache write failed for {Resource}: {ErrorType}", resource, error.GetType().Name);
            return (fresh, "fallback");
        }
        return (fresh, "miss");
    }
}

public sealed class WorkspaceCacheAvailability(TimeProvider clock)
{
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(10);
    private long lastFailure = long.MinValue;

    public bool IsCoolingDown
    {
        get
        {
            var failure = Volatile.Read(ref lastFailure);
            return failure != long.MinValue && clock.GetElapsedTime(failure) < RetryDelay;
        }
    }

    public void ReportFailure() => Volatile.Write(ref lastFailure, clock.GetTimestamp());
}

public sealed record ProgramLookup(Guid Id, string Code, string DisplayName);
