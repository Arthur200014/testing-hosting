using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TestingHosting.Platform.Configuration;
using TestingHosting.Platform.HomeworkImport;
using TestingHosting.Platform.Persistence;
using TestingHosting.Platform.StudentImport;

var arguments = CliArguments.Parse(args);
if (arguments is null)
{
    Console.Error.WriteLine("Usage: Platform.HomeworkImport --xlsx PATH --program-map PATH --workspace SLUG [--apply]");
    return 2;
}

try
{
    var workbook = new HomeworkWorkbookParser().Parse(arguments.WorkbookPath);
    var programMap = new ProgramMapParser().Parse(arguments.ProgramMapPath);
    var configuration = new ConfigurationBuilder().AddEnvironmentVariables().Build();
    var connectionString = StartupConfiguration.GetConnectionString(configuration);
    var options = new DbContextOptionsBuilder<PlatformDbContext>()
        .UseNpgsql(connectionString, postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "public"))
        .Options;
    var service = new HomeworkImportService(() => new PlatformDbContext(options));
    var report = await service.ExecuteAsync(workbook, programMap, arguments.WorkspaceSlug, arguments.Apply);
    Console.WriteLine(JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
    return report.CanApply ? 0 : 1;
}
catch (Exception)
{
    Console.Error.WriteLine("Homework import failed without writing a diagnostic containing source values.");
    return 1;
}

internal sealed record CliArguments(string WorkbookPath, string ProgramMapPath, string WorkspaceSlug, bool Apply)
{
    public static CliArguments? Parse(IReadOnlyList<string> arguments)
    {
        string? workbook = null;
        string? programMap = null;
        string? workspace = null;
        var apply = false;
        for (var index = 0; index < arguments.Count; index++)
        {
            switch (arguments[index])
            {
                case "--xlsx" when index + 1 < arguments.Count:
                    workbook = arguments[++index];
                    break;
                case "--program-map" when index + 1 < arguments.Count:
                    programMap = arguments[++index];
                    break;
                case "--workspace" when index + 1 < arguments.Count:
                    workspace = arguments[++index];
                    break;
                case "--apply":
                    apply = true;
                    break;
                default:
                    return null;
            }
        }

        return string.IsNullOrWhiteSpace(workbook) || string.IsNullOrWhiteSpace(programMap) || string.IsNullOrWhiteSpace(workspace)
            ? null
            : new CliArguments(workbook, programMap, workspace, apply);
    }
}
