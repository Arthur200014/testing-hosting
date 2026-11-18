using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.IdentityAccess;

internal static class TeacherWorkspaceSettingsEndpoints
{
    public sealed record Settings(bool LessonReminders, bool OverdueInvoiceReminders,
        string? PaymentRecipient, string? PaymentBank, string? PaymentUrl);
    public sealed record RemindersRequest(bool? LessonReminders, bool? OverdueInvoiceReminders);
    public sealed record PaymentDetailsRequest(string? Recipient, string? Bank, string? Url);

    public static void Map(RouteGroupBuilder profile)
    {
        var settings = profile.MapGroup("/settings");
        settings.AddEndpointFilter((context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            return next(context);
        });
        settings.MapGet("", ReadAsync);
        settings.MapPatch("/reminders", SaveRemindersAsync);
        settings.MapPatch("/payment-details", SavePaymentDetailsAsync);
        settings.MapPost("/payment-details/clear", ClearPaymentDetailsAsync);
    }

    private static async Task<IResult> ReadAsync(ClaimsPrincipal user, PlatformDbContext db, CancellationToken ct)
    {
        var membership = Membership(user);
        var row = await db.Database.SqlQuery<Settings>($"""
            SELECT "LessonReminders", "OverdueInvoiceReminders", "PaymentRecipient", "PaymentBank", "PaymentUrl"
            FROM platform."TeacherWorkspaceSettings" WHERE "MembershipId"={membership}
            """).SingleOrDefaultAsync(ct);
        return Results.Ok(row ?? new Settings(false, false, null, null, null));
    }

    private static async Task<IResult> SaveRemindersAsync(RemindersRequest input, ClaimsPrincipal user,
        PlatformDbContext db, CancellationToken ct)
    {
        if (input.LessonReminders is not bool lessons || input.OverdueInvoiceReminders is not bool invoices)
            return Invalid("reminders", "Укажите настройки обоих напоминаний.");

        var membership = Membership(user);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO platform."TeacherWorkspaceSettings" ("MembershipId", "LessonReminders", "OverdueInvoiceReminders")
            VALUES ({membership}, {lessons}, {invoices})
            ON CONFLICT ("MembershipId") DO UPDATE SET
                "LessonReminders"=EXCLUDED."LessonReminders", "OverdueInvoiceReminders"=EXCLUDED."OverdueInvoiceReminders"
            """, ct);
        return Results.NoContent();
    }

    private static async Task<IResult> SavePaymentDetailsAsync(PaymentDetailsRequest input, ClaimsPrincipal user,
        PlatformDbContext db, CancellationToken ct)
    {
        var recipient = input.Recipient?.Trim() ?? "";
        var bank = input.Bank?.Trim() ?? "";
        var url = input.Url?.Trim() ?? "";
        if (!ValidLabel(recipient)) return Invalid("recipient", "Укажите имя получателя длиной до 120 символов.");
        if (!ValidLabel(bank)) return Invalid("bank", "Укажите банк длиной до 120 символов.");
        if (url.Length > 500 || url.Any(char.IsWhiteSpace) || url.Any(char.IsControl) ||
            !Uri.TryCreate(url, UriKind.Absolute, out var parsed) || parsed.Scheme != Uri.UriSchemeHttps ||
            parsed.UserInfo.Length != 0 || parsed.Host.Length == 0 || !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            return Invalid("url", "Укажите HTTPS-ссылку на оплату без логина и пароля.");

        var membership = Membership(user);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO platform."TeacherWorkspaceSettings" ("MembershipId", "PaymentRecipient", "PaymentBank", "PaymentUrl")
            VALUES ({membership}, {recipient}, {bank}, {url})
            ON CONFLICT ("MembershipId") DO UPDATE SET "PaymentRecipient"=EXCLUDED."PaymentRecipient",
                "PaymentBank"=EXCLUDED."PaymentBank", "PaymentUrl"=EXCLUDED."PaymentUrl"
            """, ct);
        return Results.NoContent();
    }

    private static async Task<IResult> ClearPaymentDetailsAsync(ClaimsPrincipal user, PlatformDbContext db, CancellationToken ct)
    {
        var membership = Membership(user);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE platform."TeacherWorkspaceSettings"
            SET "PaymentRecipient"=NULL, "PaymentBank"=NULL, "PaymentUrl"=NULL WHERE "MembershipId"={membership}
            """, ct);
        return Results.NoContent();
    }

    private static Guid Membership(ClaimsPrincipal principal) => Guid.Parse(principal.FindFirstValue("membership_id")!);
    private static bool ValidLabel(string value) => value.Length is > 0 and <= 120 && !value.Any(char.IsControl);
    private static IResult Invalid(string key, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });
}
