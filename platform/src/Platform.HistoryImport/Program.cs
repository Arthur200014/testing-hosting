using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TestingHosting.Platform.Configuration;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.HistoryImport;

public static class HistoryImportProgram
{
    public static async Task<int> Main(string[] args)
    {
        string? xlsx = null, map = null, workspace = null;
        var apply = false;
        for (var i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--xlsx" when i + 1 < args.Length: xlsx = args[++i]; break;
                case "--program-map" when i + 1 < args.Length: map = args[++i]; break;
                case "--workspace" when i + 1 < args.Length: workspace = args[++i]; break;
                case "--apply": apply = true; break;
                default: return Usage();
            }
        }

        if (string.IsNullOrWhiteSpace(xlsx) || string.IsNullOrWhiteSpace(map) ||
            string.IsNullOrWhiteSpace(workspace)) return Usage();

        try
        {
            var config = new ConfigurationBuilder().AddEnvironmentVariables().Build();
            var options = new DbContextOptionsBuilder<PlatformDbContext>()
                .UseNpgsql(StartupConfiguration.GetConnectionString(config),
                    pg => pg.MigrationsHistoryTable("__EFMigrationsHistory", "public")).Options;
            var importer = new HistoryImportService(() => new PlatformDbContext(options));
            var report = await importer.ImportAsync(xlsx, map, workspace, apply);
            Console.WriteLine(JsonSerializer.Serialize(report));
            return report.CanApply ? 0 : 1;
        }
        catch (Exception)
        {
            // Do not print source cells, connection strings, user IDs or exception stack traces.
            Console.Error.WriteLine("History import failed; no source values printed.");
            return 1;
        }
    }

    private static int Usage()
    {
        Console.Error.WriteLine("Usage: Platform.HistoryImport --xlsx PATH --program-map PATH --workspace SLUG [--apply]");
        return 2;
    }
}
