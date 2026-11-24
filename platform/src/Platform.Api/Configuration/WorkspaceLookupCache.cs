using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using StackExchange.Redis;

namespace TestingHosting.Platform.Configuration;

public sealed class WorkspaceLookupCache(IServiceProvider services, ILogger<WorkspaceLookupCache> log)
{
    private static readonly DistributedCacheEntryOptions Lifetime = new()
    {
        AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30)
    };

    public async Task<T> ReadAsync<T>(Guid workspaceId, string resource, Func<Task<T>> load, CancellationToken ct)
        where T : class
    {
        var cache = services.GetService<IDistributedCache>();
        if (cache is null) return await load();

        var key = $"{workspaceId:N}:{resource}";
        try
        {
            var cached = await cache.GetStringAsync(key, ct);
            if (cached is not null && JsonSerializer.Deserialize<T>(cached) is { } value)
                return value;
        }
        catch (Exception error) when (error is RedisException or TimeoutException or JsonException)
        {
            log.LogWarning("Workspace lookup cache read failed for {Resource}: {ErrorType}", resource, error.GetType().Name);
            return await load();
        }

        var fresh = await load();
        try
        {
            await cache.SetStringAsync(key, JsonSerializer.Serialize(fresh), Lifetime, ct);
        }
        catch (Exception error) when (error is RedisException or TimeoutException)
        {
            log.LogWarning("Workspace lookup cache write failed for {Resource}: {ErrorType}", resource, error.GetType().Name);
        }
        return fresh;
    }
}

public sealed record ProgramLookup(Guid Id, string Code, string DisplayName);
