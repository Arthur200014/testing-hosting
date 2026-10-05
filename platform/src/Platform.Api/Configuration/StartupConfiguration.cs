using Npgsql;

namespace TestingHosting.Platform.Configuration;

public sealed record JwtOptions(string Issuer, string Audience, string SigningKey, int LifetimeMinutes);

public sealed record StudentCodeOptions(string Pepper);

public sealed record StudentSessionOptions(int RateLimitPermitLimit, int RateLimitWindowSeconds);

public static class StartupConfiguration
{
    private static readonly string[] PlaceholderMarkers =
    [
        "change-me", "changeme", "replace", "placeholder", "example", "your-", "set-a-"
    ];

    public static void Validate(IConfiguration configuration)
    {
        _ = GetJwtOptions(configuration);
        _ = GetPepper(configuration);
        _ = GetConnectionString(configuration);
        _ = GetAllowedOrigins(configuration);
        _ = GetStudentSessionOptions(configuration);

        var jwtBytes = DecodeSecret(configuration["Jwt:SigningKey"], "Jwt:SigningKey");
        var pepperBytes = DecodeSecret(configuration["StudentCodes:Pepper"], "StudentCodes:Pepper");
        if (jwtBytes.AsSpan().SequenceEqual(pepperBytes))
        {
            throw new InvalidOperationException("JWT signing key and student-code pepper must be different secrets.");
        }
    }

    public static JwtOptions GetJwtOptions(IConfiguration configuration)
    {
        var issuer = Required(configuration["Jwt:Issuer"], "Jwt:Issuer");
        var audience = Required(configuration["Jwt:Audience"], "Jwt:Audience");
        var signingKey = Required(configuration["Jwt:SigningKey"], "Jwt:SigningKey");
        var lifetime = configuration.GetValue<int>("Jwt:LifetimeMinutes");
        if (lifetime is < 1 or > 15)
        {
            throw new InvalidOperationException("Jwt:LifetimeMinutes must be between 1 and 15.");
        }

        _ = DecodeSecret(signingKey, "Jwt:SigningKey");
        return new JwtOptions(issuer, audience, signingKey, lifetime);
    }

    public static byte[] GetPepper(IConfiguration configuration) =>
        DecodeSecret(configuration["StudentCodes:Pepper"], "StudentCodes:Pepper");

    public static string GetConnectionString(IConfiguration configuration)
    {
        var value = Required(configuration["Database:ConnectionString"], "Database:ConnectionString");
        NpgsqlConnectionStringBuilder parsed;
        try
        {
            parsed = new NpgsqlConnectionStringBuilder(value);
        }
        catch (ArgumentException exception)
        {
            throw new InvalidOperationException("Database:ConnectionString is invalid.", exception);
        }

        if (string.IsNullOrWhiteSpace(parsed.Host) || string.IsNullOrWhiteSpace(parsed.Database) ||
            string.IsNullOrWhiteSpace(parsed.Username))
        {
            throw new InvalidOperationException("Database connection must specify host, database, and username.");
        }

        ValidatePassword(parsed.Password, "database password", 16);
        return value;
    }

    public static string[] GetAllowedOrigins(IConfiguration configuration)
    {
        var origins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        if (origins.Length == 0)
        {
            throw new InvalidOperationException("At least one explicit Cors:AllowedOrigins entry is required.");
        }

        foreach (var origin in origins)
        {
            if (origin == "*" || !Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
                (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) ||
                uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
            {
                throw new InvalidOperationException("CORS origins must be explicit HTTP(S) origins without paths, queries, or wildcards.");
            }
        }

        return origins.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    }

    public static StudentSessionOptions GetStudentSessionOptions(IConfiguration configuration)
    {
        var permitLimit = configuration.GetValue<int>("StudentSessions:RateLimitPermitLimit");
        var windowSeconds = configuration.GetValue<int>("StudentSessions:RateLimitWindowSeconds");
        if (permitLimit is < 1 or > 100 || windowSeconds is < 1 or > 3600)
        {
            throw new InvalidOperationException("Student-session rate-limit configuration is outside the supported range.");
        }

        return new StudentSessionOptions(permitLimit, windowSeconds);
    }

    public static byte[] DecodeSecret(string? value, string name)
    {
        var required = Required(value, name);
        if (ContainsPlaceholder(required))
        {
            throw new InvalidOperationException($"{name} contains a placeholder value.");
        }

        try
        {
            var decoded = Convert.FromBase64String(required);
            if (decoded.Length < 32)
            {
                throw new InvalidOperationException($"{name} must decode to at least 32 bytes.");
            }

            return decoded;
        }
        catch (FormatException exception)
        {
            throw new InvalidOperationException($"{name} must be base64-encoded.", exception);
        }
    }

    private static string Required(string? value, string name)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException($"Required configuration '{name}' is missing.");
        }

        return value;
    }

    private static void ValidatePassword(string? value, string name, int minimumLength)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length < minimumLength || ContainsPlaceholder(value))
        {
            throw new InvalidOperationException($"The {name} is missing, weak, or a placeholder.");
        }
    }

    private static bool ContainsPlaceholder(string value) =>
        PlaceholderMarkers.Any(marker => value.Contains(marker, StringComparison.OrdinalIgnoreCase));
}
