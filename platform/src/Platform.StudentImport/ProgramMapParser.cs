using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace TestingHosting.Platform.StudentImport;

public sealed class ProgramMapParser
{
    public ParsedProgramMap Parse(string path)
    {
        string digest;
        byte[] bytes;
        using (var stream = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            digest = Convert.ToHexString(SHA256.HashData(stream));
        }

        bytes = File.ReadAllBytes(path);
        var diagnostics = new List<ImportDiagnostic>();
        ProgramMapDocument? document;
        try
        {
            document = JsonSerializer.Deserialize<ProgramMapDocument>(bytes, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = false,
                UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
            });
        }
        catch (JsonException)
        {
            diagnostics.Add(new ImportDiagnostic(0, "programMap", "malformed_json"));
            return new ParsedProgramMap(digest, new Dictionary<string, ProgramMapEntry>(), diagnostics);
        }

        if (document?.Programs is null || document.Programs.Count == 0)
        {
            diagnostics.Add(new ImportDiagnostic(0, "programMap", "missing_programs"));
            return new ParsedProgramMap(digest, new Dictionary<string, ProgramMapEntry>(), diagnostics);
        }

        var entries = new Dictionary<string, ProgramMapEntry>(StringComparer.Ordinal);
        var destinations = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var candidate in document.Programs)
        {
            var sourceId = StudentWorkbookParser.NormalizeExternalId(candidate.SourceId);
            var code = NormalizeProgramCode(candidate.Code);
            var displayName = candidate.DisplayName?.Normalize().Trim() ?? string.Empty;
            if (sourceId.Length is 0 or > 200 || code.Length is 0 or > 64 || displayName.Length is 0 or > 200 ||
                !code.All(character => character is >= 'A' and <= 'Z' or >= '0' and <= '9' or '_'))
            {
                diagnostics.Add(new ImportDiagnostic(0, "programMap", "invalid_entry"));
                continue;
            }

            if (!entries.TryAdd(sourceId, new ProgramMapEntry(sourceId, code, displayName)))
            {
                diagnostics.Add(new ImportDiagnostic(0, "programMap", "duplicate_source"));
            }

            if (destinations.TryGetValue(code, out var priorDisplayName) &&
                !string.Equals(priorDisplayName, displayName, StringComparison.Ordinal))
            {
                diagnostics.Add(new ImportDiagnostic(0, "programMap", "ambiguous_destination"));
            }
            else
            {
                destinations[code] = displayName;
            }
        }

        return new ParsedProgramMap(digest, entries, diagnostics);
    }

    private static string NormalizeProgramCode(string? value) =>
        (value ?? string.Empty).Normalize().Trim().ToUpperInvariant();

    private sealed record ProgramMapDocument(
        [property: JsonPropertyName("programs")] IReadOnlyList<ProgramMapItem>? Programs);

    private sealed record ProgramMapItem(
        [property: JsonPropertyName("sourceId")] string? SourceId,
        [property: JsonPropertyName("code")] string? Code,
        [property: JsonPropertyName("displayName")] string? DisplayName);
}
