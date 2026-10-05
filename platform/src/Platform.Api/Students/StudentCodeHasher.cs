using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace TestingHosting.Platform.Students;

public interface IStudentCodeHasher
{
    byte[] Hash(string workspaceSlug, string code);
    bool TryNormalizeWorkspace(string? workspaceSlug, out string normalized);
    bool TryNormalizeCode(string? code, out string normalized);
}

public sealed partial class StudentCodeHasher(byte[] pepper) : IStudentCodeHasher
{
    public byte[] Hash(string workspaceSlug, string code)
    {
        using var hmac = new HMACSHA256(pepper);
        return hmac.ComputeHash(Encoding.UTF8.GetBytes($"{workspaceSlug}\n{code}"));
    }

    public bool TryNormalizeWorkspace(string? workspaceSlug, out string normalized)
    {
        normalized = (workspaceSlug ?? string.Empty).Normalize(NormalizationForm.FormKC).Trim().ToLowerInvariant();
        return WorkspaceSlugRegex().IsMatch(normalized);
    }

    public bool TryNormalizeCode(string? code, out string normalized)
    {
        normalized = (code ?? string.Empty).Normalize(NormalizationForm.FormKC).Trim().ToUpperInvariant();
        return normalized.Length is >= 1 and <= 128;
    }

    [GeneratedRegex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", RegexOptions.CultureInvariant)]
    private static partial Regex WorkspaceSlugRegex();
}
