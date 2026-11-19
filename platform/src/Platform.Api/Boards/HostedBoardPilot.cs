using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using Npgsql;
using TestingHosting.Platform.Configuration;
using Yarp.ReverseProxy.Forwarder;
using Yarp.ReverseProxy.Transforms;
using Yarp.ReverseProxy.Transforms.Builder;

namespace TestingHosting.Platform.Boards;

internal sealed class HostedBoardPilot(IConfiguration configuration, IWebHostEnvironment environment, ILogger<HostedBoardPilot> log) : IHostedService
{
    public const string Prefix = "/board-pilot";
    private const string Relay = "http://127.0.0.1:18448";
    private const string RelayKeyHeader = "X-TAS-Board-Relay-Key";
    private readonly string relayKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
    private Process? process;

    public bool Enabled => environment.IsProduction() &&
        configuration.GetValue<bool>("BoardPrototype:Enabled") &&
        configuration.GetValue<bool>("BoardPrototype:HostedPilot");

    public static void Register(WebApplicationBuilder builder)
    {
        builder.Services.AddHttpForwarder();
        builder.Services.AddSingleton<HostedBoardPilot>();
        builder.Services.AddHostedService(services => services.GetRequiredService<HostedBoardPilot>());
    }

    private static Uri GetOrigin(IConfiguration config)
    {
        var value = config["BoardPrototype:HostedOrigin"];
        if (!Uri.TryCreate(value, UriKind.Absolute, out var url) || url.Scheme != "https" ||
            url.GetLeftPart(UriPartial.Authority) != value || !url.IsDefaultPort || url.UserInfo.Length != 0)
            throw new InvalidOperationException("An explicit hosted board HTTPS origin is required.");
        return url;
    }

    public bool IsRelay(HttpContext context) =>
        context.Connection.RemoteIpAddress is IPAddress address && IPAddress.IsLoopback(address) &&
        context.Request.Headers.TryGetValue(RelayKeyHeader, out var supplied) && supplied.Count == 1 &&
        CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(relayKey), Encoding.ASCII.GetBytes(supplied.ToString()));

    public void Map(WebApplication app)
    {
        if (!Enabled) return;
        var origin = GetOrigin(configuration);
        var transforms = app.Services.GetRequiredService<ITransformBuilder>().Create(context =>
        {
            context.AddPathRemovePrefix(new PathString(Prefix));
            context.AddOriginalHost(true);
        });
        var forwarderOptions = new ForwarderRequestConfig { ActivityTimeout = TimeSpan.FromMinutes(2) };
        foreach (var path in new[] { "/cabinet/{**asset}", "/board/{**asset}", "/socket.io/{**asset}" })
            app.MapForwarder(Prefix + path, Relay, forwarderOptions, transforms)
                .RequireHost(origin.Authority);
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!Enabled) return;
        try
        {
            var origin = GetOrigin(configuration);
            var db = new NpgsqlConnectionStringBuilder(StartupConfiguration.GetConnectionString(configuration));
            if (db.Host!.Contains(',') || db.Host.StartsWith('/'))
            {
                log.LogWarning("Hosted board pilot requires one PostgreSQL host. The relay did not start.");
                return;
            }
            var script = Path.Combine(AppContext.BaseDirectory, "board-cabinet", "board-prototype", "staging.mjs");
            if (!File.Exists(script))
            {
                log.LogWarning("Hosted board pilot assets unavailable. The primary API remains available.");
                return;
            }
            var start = new ProcessStartInfo("node", [script])
            {
                UseShellExecute = false
            };
            start.Environment.Clear();
            start.Environment["PATH"] = "/usr/local/bin:/usr/bin:/bin";
            start.Environment["TAS_BOARD_HOSTED_ORIGIN"] = origin.GetLeftPart(UriPartial.Authority);
            start.Environment["TAS_BOARD_HOSTED_WORKSPACE"] = Guid.Parse(configuration["BoardPrototype:StagingWorkspaceId"]!).ToString("N");
            var apiPort = configuration.GetValue("BoardPrototype:HostedApiPort", 8080);
            start.Environment["TAS_BOARD_STAGING_API"] = $"http://127.0.0.1:{apiPort}";
            start.Environment["TAS_BOARD_STAGING_SIGNING_KEY"] = configuration["BoardPrototype:SigningKey"]!;
            start.Environment["TAS_BOARD_HOSTED_RELAY_KEY"] = relayKey;
            start.Environment["PGHOST"] = db.Host;
            start.Environment["PGPORT"] = db.Port.ToString(System.Globalization.CultureInfo.InvariantCulture);
            start.Environment["PGDATABASE"] = db.Database!;
            start.Environment["PGUSER"] = db.Username!;
            start.Environment["PGPASSWORD"] = db.Password!;
            if (!string.IsNullOrEmpty(db.RootCertificate))
                start.Environment["TAS_BOARD_HOSTED_PG_CA"] = await File.ReadAllTextAsync(db.RootCertificate, cancellationToken);
            process = new Process { StartInfo = start, EnableRaisingEvents = true };
            process.Exited += (_, _) => log.LogWarning("Hosted board pilot relay stopped. The primary API remains available.");
            process.Start();
        }
        catch (Exception exception) when (exception is IOException or InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            log.LogWarning("Hosted board pilot relay unavailable ({ErrorType}). The primary API remains available.", exception.GetType().Name);
        }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        if (process is null) return;
        using (process)
        {
            try
            {
                if (!process.HasExited) process.Kill(entireProcessTree: true);
                await process.WaitForExitAsync(cancellationToken);
            }
            catch (InvalidOperationException) { }
        }
    }
}
