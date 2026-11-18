using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Billing;

internal static class TuitionLedgerEndpoints
{
    public sealed record Invoice(Guid Id, Guid MembershipId, string StudentName, string Description, decimal Amount,
        decimal Paid, DateOnly? DueOn, DateTimeOffset CreatedAt, DateTimeOffset? CancelledAt);
    public sealed record Payment(Guid Id, decimal Amount, DateOnly ReceivedOn, string? Note, DateTimeOffset RecordedAt);
    public sealed record CreateInvoice(Guid RequestId, Guid MembershipId, string? Description, decimal Amount, DateOnly? DueOn);
    public sealed record RecordPayment(Guid RequestId, decimal Amount, DateOnly ReceivedOn, string? Note);

    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/v1/teacher/tuition-invoices").RequireAuthorization("teacher");
        group.AddEndpointFilter(async (context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            return await next(context);
        });
        group.MapGet("", async (ClaimsPrincipal principal, PlatformDbContext db, CancellationToken ct) =>
            Results.Ok(await Invoices(db, Workspace(principal)).OrderByDescending(x => x.CreatedAt)
                .ThenByDescending(x => x.Id).ToListAsync(ct)));
        group.MapPost("", CreateAsync);
        group.MapGet("/{id:guid}/payments", ListPaymentsAsync);
        group.MapPost("/{id:guid}/payments", RecordAsync);
        group.MapPost("/{id:guid}/cancel", CancelAsync);
    }

    private static Guid Workspace(ClaimsPrincipal principal) => Guid.Parse(principal.FindFirstValue("workspace_id")!);
    private static bool ValidAmount(decimal amount) => amount is > 0 and <= 9_999_999_999.99m && decimal.Round(amount, 2) == amount;
    private static IResult Invalid(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });
    private static IResult Conflict(string message) => Results.Conflict(new { title = message });

    private static IQueryable<Invoice> Invoices(PlatformDbContext db, Guid workspace) =>
        db.Database.SqlQuery<Invoice>($"""
            SELECT i."Id", i."MembershipId", s."DisplayName" AS "StudentName", i."Description", i."Amount",
                COALESCE(p."Total", 0) AS "Paid", i."DueOn", i."CreatedAt", i."CancelledAt"
            FROM platform."TuitionInvoices" i
            JOIN platform."WorkspaceStudentMemberships" m ON m."Id"=i."MembershipId" AND m."WorkspaceId"=i."WorkspaceId"
            JOIN platform."Students" s ON s."Id"=m."StudentId"
            LEFT JOIN LATERAL (
                SELECT SUM("Amount") AS "Total" FROM platform."TuitionPayments" WHERE "InvoiceId"=i."Id"
            ) p ON true
            WHERE i."WorkspaceId"={workspace}
            """);

    private sealed record InvoiceRequest(Guid Id);
    private static async Task<IResult> CreateAsync(CreateInvoice input, ClaimsPrincipal principal, PlatformDbContext db, CancellationToken ct)
    {
        var description = input.Description?.Trim() ?? "";
        if (input.RequestId == Guid.Empty) return Invalid("requestId", "Требуется идентификатор операции.");
        if (description.Length is < 1 or > 160 || description.Any(char.IsControl))
            return Invalid("description", "Введите назначение счёта до 160 символов.");
        if (!ValidAmount(input.Amount)) return Invalid("amount", "Введите положительную сумму с точностью до копеек.");

        var workspace = Workspace(principal);
        var id = Guid.NewGuid();
        var inserted = await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO platform."TuitionInvoices" ("Id","WorkspaceId","MembershipId","RequestId","Description","Amount","DueOn")
            SELECT {id}, {workspace}, m."Id", {input.RequestId}, {description}, {input.Amount}, {input.DueOn}
            FROM platform."WorkspaceStudentMemberships" m
            JOIN platform."Students" s ON s."Id"=m."StudentId" AND s."IsActive"
            WHERE m."Id"={input.MembershipId} AND m."WorkspaceId"={workspace} AND m."IsActive"
            ON CONFLICT ("WorkspaceId","RequestId") DO NOTHING
            """, ct);
        if (inserted == 1)
            return Results.Json(await Invoices(db, workspace).SingleAsync(x => x.Id == id, ct), statusCode: 201);

        var previous = await db.Database.SqlQuery<InvoiceRequest>($"""
            SELECT "Id" FROM platform."TuitionInvoices" WHERE "WorkspaceId"={workspace} AND "RequestId"={input.RequestId}
            """).SingleOrDefaultAsync(ct);
        if (previous is null) return Results.NotFound();
        var invoice = await Invoices(db, workspace).SingleAsync(x => x.Id == previous.Id, ct);
        return invoice.MembershipId == input.MembershipId && invoice.Description == description &&
            invoice.Amount == input.Amount && invoice.DueOn == input.DueOn
                ? Results.Ok(invoice) : Conflict("Этот запрос уже использован для другого счёта.");
    }

    private static IQueryable<Payment> Payments(PlatformDbContext db, Guid workspace, Guid id) =>
        db.Database.SqlQuery<Payment>($"""
            SELECT p."Id", p."Amount", p."ReceivedOn", p."Note", p."RecordedAt"
            FROM platform."TuitionPayments" p
            JOIN platform."TuitionInvoices" i ON i."Id"=p."InvoiceId"
            WHERE i."Id"={id} AND i."WorkspaceId"={workspace}
            """);

    private static async Task<IResult> ListPaymentsAsync(Guid id, ClaimsPrincipal principal, PlatformDbContext db, CancellationToken ct)
    {
        var workspace = Workspace(principal);
        if (!await Invoices(db, workspace).AnyAsync(x => x.Id == id, ct)) return Results.NotFound();
        return Results.Ok(await Payments(db, workspace, id).OrderByDescending(x => x.ReceivedOn)
            .ThenByDescending(x => x.RecordedAt).ThenByDescending(x => x.Id).ToListAsync(ct));
    }

    // Mutators lock the same invoice row before reading the paid total or changing its status.
    private static async Task<Invoice?> LockAsync(PlatformDbContext db, Guid workspace, Guid id, CancellationToken ct)
    {
        var ids = await db.Database.SqlQuery<Guid>($"""
            SELECT "Id" AS "Value" FROM platform."TuitionInvoices"
            WHERE "Id"={id} AND "WorkspaceId"={workspace} FOR UPDATE
            """).ToListAsync(ct);
        return ids.Count == 0 ? null : await Invoices(db, workspace).SingleAsync(x => x.Id == id, ct);
    }

    private static async Task<IResult> RecordAsync(Guid id, RecordPayment input, ClaimsPrincipal principal,
        PlatformDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var note = string.IsNullOrWhiteSpace(input.Note) ? null : input.Note.Trim();
        if (input.RequestId == Guid.Empty) return Invalid("requestId", "Требуется идентификатор операции.");
        if (!ValidAmount(input.Amount)) return Invalid("amount", "Введите положительную сумму с точностью до копеек.");
        if (input.ReceivedOn == default || input.ReceivedOn > DateOnly.FromDateTime(clock.GetUtcNow().ToOffset(TimeSpan.FromHours(3)).DateTime))
            return Invalid("receivedOn", "Укажите дату уже полученной оплаты.");
        if (note is not null && (note.Length > 200 || note.Any(char.IsControl)))
            return Invalid("note", "Введите примечание до 200 символов.");

        var workspace = Workspace(principal);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var invoice = await LockAsync(db, workspace, id, ct);
        if (invoice is null) return Results.NotFound();
        var previous = await db.Database.SqlQuery<Payment>($"""
            SELECT "Id","Amount","ReceivedOn","Note","RecordedAt" FROM platform."TuitionPayments"
            WHERE "InvoiceId"={id} AND "RequestId"={input.RequestId}
            """).SingleOrDefaultAsync(ct);
        if (previous is not null)
            return previous.Amount == input.Amount && previous.ReceivedOn == input.ReceivedOn && previous.Note == note
                ? Results.Ok(previous) : Conflict("Этот запрос уже использован для другой оплаты.");
        if (invoice.CancelledAt is not null) return Conflict("Счёт отменён.");
        if (input.Amount > invoice.Amount - invoice.Paid) return Conflict("Сумма превышает остаток по счёту.");

        var paymentId = Guid.NewGuid();
        var teacher = Guid.Parse(principal.FindFirstValue("sub")!);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO platform."TuitionPayments" ("Id","InvoiceId","RequestId","Amount","ReceivedOn","Note","RecordedBy")
            VALUES ({paymentId},{id},{input.RequestId},{input.Amount},{input.ReceivedOn},{note},{teacher})
            """, ct);
        var payment = await Payments(db, workspace, id).SingleAsync(x => x.Id == paymentId, ct);
        await transaction.CommitAsync(ct);
        return Results.Json(payment, statusCode: 201);
    }

    private static async Task<IResult> CancelAsync(Guid id, ClaimsPrincipal principal, PlatformDbContext db, CancellationToken ct)
    {
        var workspace = Workspace(principal);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var invoice = await LockAsync(db, workspace, id, ct);
        if (invoice is null) return Results.NotFound();
        if (invoice.CancelledAt is not null) return Results.Ok(invoice);
        if (invoice.Paid != 0) return Conflict("По этому счёту уже есть поступления.");
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE platform."TuitionInvoices" SET "CancelledAt"=now() WHERE "Id"={id} AND "WorkspaceId"={workspace}
            """, ct);
        var result = await Invoices(db, workspace).SingleAsync(x => x.Id == id, ct);
        await transaction.CommitAsync(ct);
        return Results.Ok(result);
    }
}
