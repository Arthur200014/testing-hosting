using Microsoft.EntityFrameworkCore;
using Npgsql;
using TestingHosting.Platform.Persistence;

namespace TestingHosting.Platform.Classes;

public sealed record TeacherClassView(
    Guid Id, string Title, string Description, string Kind, Guid StudentMembershipId,
    string StudentName, Guid ProgramId, string ProgramName,
    bool IsArchived, DateTimeOffset CreatedAt,
    int? DurationMinutes, decimal? PriceAmount, string? PriceCurrency, string? PriceBasis,
    bool AllowLessonChat, bool AllowPrivateMessages, int Revision,
    string CoverStyle, string? InvitationStatus, DateTimeOffset? InvitationExpiresAt,
    DateTimeOffset? InvitationAcceptedAt);

public sealed record TeacherCreateClassRequest(
    Guid RequestId, Guid StudentMembershipId, string? Title, string? Description = null,
    int? DurationMinutes = null, decimal? PriceAmount = null, string? PriceCurrency = null,
    string? PriceBasis = null, bool AllowLessonChat = false, bool AllowPrivateMessages = false,
    string? CoverStyle = null);

public enum TeacherCreateClassStatus
{
    Created, Duplicate, Conflict, InvalidRequest, MembershipNotFound
}

public sealed record TeacherCreateClassResult(
    TeacherCreateClassStatus Status, TeacherClassView? Response = null,
    Dictionary<string, string[]>? Errors = null);


public sealed record TeacherUpdateClassRequest(
    int ExpectedRevision, string? Title, string? Description = null,
    int? DurationMinutes = null, decimal? PriceAmount = null, string? PriceCurrency = null,
    string? PriceBasis = null, bool AllowLessonChat = false, bool AllowPrivateMessages = false,
    string? CoverStyle = null);

public sealed record TeacherClassRevisionRequest(int ExpectedRevision);
public enum TeacherClassMutationStatus { Updated, Unchanged, NotFound, Conflict, InvalidRequest }
public sealed record TeacherClassMutationResult(
    TeacherClassMutationStatus Status, TeacherClassView? Response = null,
    Dictionary<string, string[]>? Errors = null);

public sealed class TeacherClassService(PlatformDbContext db, TimeProvider clock)
{
    public Task<List<TeacherClassView>> ListAsync(
        Guid workspaceId, CancellationToken cancellationToken) =>
        Project(db.TeacherClasses.AsNoTracking().Where(x => x.WorkspaceId == workspaceId)
            .OrderBy(x => x.IsArchived).ThenBy(x => x.Title).ThenBy(x => x.Id))
            .ToListAsync(cancellationToken);

    public async Task<TeacherCreateClassResult> CreateAsync(
        Guid workspaceId, TeacherCreateClassRequest request, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.RequestId == Guid.Empty)
            errors["requestId"] = ["A non-empty request ID is required."];
        if (request.StudentMembershipId == Guid.Empty)
            errors["studentMembershipId"] = ["An active student is required."];
        var title = request.Title?.Trim();
        if (string.IsNullOrWhiteSpace(title) || title.Length > 50)
            errors["title"] = ["Title must be between 1 and 50 characters."];
        var description = request.Description?.Trim() ?? string.Empty;
        if (description.Length > 200)
            errors["description"] = ["Description must not exceed 200 characters."];
        var coverStyle = NormalizeCover(request.CoverStyle);
        if (!AllowedCover(coverStyle)) errors["coverStyle"] = ["Unknown cover style."];
        if (request.DurationMinutes is int minutes && (minutes < 15 || minutes > 240 || minutes % 5 != 0))
            errors["durationMinutes"] = ["Duration must be 15–240 minutes in 5-minute increments."];
        var priceCurrency = string.IsNullOrWhiteSpace(request.PriceCurrency)
            ? null : request.PriceCurrency.Trim().ToUpperInvariant();
        var priceBasis = string.IsNullOrWhiteSpace(request.PriceBasis)
            ? null : request.PriceBasis.Trim().ToLowerInvariant();
        if (request.PriceAmount is decimal price)
        {
            if (price < 0 || price > 10000000m || price != decimal.Round(price, 2))
                errors["priceAmount"] = ["Price must be between 0 and 10000000, with at most 2 decimal places."];
            if (priceCurrency is not ("RUB" or "EUR" or "USD"))
                errors["priceCurrency"] = ["Select RUB, EUR or USD."];
            if (priceBasis is not ("lesson" or "month"))
                errors["priceBasis"] = ["Select lesson or month."];
        }
        else if (priceCurrency is not null || priceBasis is not null)
            errors["priceAmount"] = ["Price amount is required when currency or basis is set."];
        if (errors.Count > 0)
            return new(TeacherCreateClassStatus.InvalidRequest, Errors: errors);

        var existing = await FindByRequestAsync(workspaceId, request.RequestId, cancellationToken);
        if (existing is not null)
            return Compare(existing, request.StudentMembershipId, title!, description,
                request.DurationMinutes, request.PriceAmount, priceCurrency, priceBasis,
                request.AllowLessonChat, request.AllowPrivateMessages, coverStyle!);

        var member = await db.WorkspaceStudentMemberships.AsNoTracking()
            .Where(x => x.WorkspaceId == workspaceId && x.Id == request.StudentMembershipId &&
                x.IsActive && x.Student.IsActive && x.Program.IsActive)
            .Select(x => new { x.StudentId })
            .SingleOrDefaultAsync(cancellationToken);
        if (member is null)
            return new(TeacherCreateClassStatus.MembershipNotFound);

        var item = new TeacherClass
        {
            Id = Guid.NewGuid(), WorkspaceId = workspaceId, RequestId = request.RequestId,
            StudentMembershipId = request.StudentMembershipId, StudentId = member.StudentId,
            Title = title!, Description = description, CoverStyle = coverStyle!,
            DurationMinutes = request.DurationMinutes, PriceAmount = request.PriceAmount,
            PriceCurrency = priceCurrency, PriceBasis = priceBasis,
            AllowLessonChat = request.AllowLessonChat, AllowPrivateMessages = request.AllowPrivateMessages,
            CreatedAt = clock.GetUtcNow()
        };
        db.TeacherClasses.Add(item);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (
            exception.InnerException is PostgresException postgres &&
            postgres.SqlState == PostgresErrorCodes.UniqueViolation &&
            postgres.ConstraintName == "IX_TeacherClasses_WorkspaceId_RequestId")
        {
            db.ChangeTracker.Clear();
            var winner = await FindByRequestAsync(workspaceId, request.RequestId, cancellationToken);
            if (winner is null) throw;
            return Compare(winner, request.StudentMembershipId, title!, description,
                request.DurationMinutes, request.PriceAmount, priceCurrency, priceBasis,
                request.AllowLessonChat, request.AllowPrivateMessages, coverStyle!);
        }

        var created = await FindByRequestAsync(workspaceId, request.RequestId, cancellationToken)
            ?? throw new InvalidOperationException("Created class could not be read back.");
        return new(TeacherCreateClassStatus.Created, ToView(created));
    }


    // PATCH never changes student ownership or membership; only class metadata.
    public async Task<TeacherClassMutationResult> UpdateAsync(
        Guid workspaceId, Guid classId, TeacherUpdateClassRequest request,
        CancellationToken cancellationToken)
    {
        if (request.ExpectedRevision < 1)
            return new(TeacherClassMutationStatus.InvalidRequest,
                Errors: new() { ["expectedRevision"] = ["A positive revision is required."] });
        var item = await LoadTrackedAsync(workspaceId, classId, cancellationToken);
        if (item is null) return new(TeacherClassMutationStatus.NotFound);
        if (item.IsArchived || item.Revision != request.ExpectedRevision)
            return new(TeacherClassMutationStatus.Conflict);
        var coverStyle = NormalizeCover(request.CoverStyle);
        var errors = ValidateClassFields(request.Title, request.Description, request.DurationMinutes,
            request.PriceAmount, request.PriceCurrency, request.PriceBasis);
        if (!AllowedCover(coverStyle)) errors["coverStyle"] = ["Unknown cover style."];
        // Imported/legacy titles can exceed the new limit until their title actually changes.
        if (item.Title.Length > 50 && item.Title == request.Title?.Trim())
            errors.Remove("title");
        if (errors.Count > 0)
            return new(TeacherClassMutationStatus.InvalidRequest, Errors: errors);
        var title = request.Title!.Trim();
        var description = request.Description?.Trim() ?? string.Empty;
        var currency = request.PriceAmount is null ? null : request.PriceCurrency!.Trim().ToUpperInvariant();
        var basis = request.PriceAmount is null ? null : request.PriceBasis!.Trim().ToLowerInvariant();
        if (item.Title == title && item.Description == description &&
            item.DurationMinutes == request.DurationMinutes && item.PriceAmount == request.PriceAmount &&
            item.PriceCurrency == currency && item.PriceBasis == basis &&
            item.AllowLessonChat == request.AllowLessonChat &&
            item.AllowPrivateMessages == request.AllowPrivateMessages && item.CoverStyle == coverStyle)
            return new(TeacherClassMutationStatus.Unchanged, ToView(item));
        item.CoverStyle = coverStyle!;
        item.Title = title;
        item.Description = description;
        item.DurationMinutes = request.DurationMinutes;
        item.PriceAmount = request.PriceAmount;
        item.PriceCurrency = currency;
        item.PriceBasis = basis;
        item.AllowLessonChat = request.AllowLessonChat;
        item.AllowPrivateMessages = request.AllowPrivateMessages;
        item.Revision++;
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return new(TeacherClassMutationStatus.Conflict);
        }
        return new(TeacherClassMutationStatus.Updated, ToView(item));
    }

    public async Task<TeacherClassMutationResult> SetArchivedAsync(
        Guid workspaceId, Guid classId, TeacherClassRevisionRequest request, bool archived,
        CancellationToken cancellationToken)
    {
        if (request.ExpectedRevision < 1)
            return new(TeacherClassMutationStatus.InvalidRequest,
                Errors: new() { ["expectedRevision"] = ["A positive revision is required."] });
        var item = await LoadTrackedAsync(workspaceId, classId, cancellationToken);
        if (item is null) return new(TeacherClassMutationStatus.NotFound);
        if (item.Revision != request.ExpectedRevision)
            return new(TeacherClassMutationStatus.Conflict);
        if (item.IsArchived == archived)
            return new(TeacherClassMutationStatus.Unchanged, ToView(item));
        item.IsArchived = archived;
        if (archived && item.InvitationStatus == "pending") {
            item.InvitationStatus = "revoked";
            item.InvitationCodeHash = null;
        }
        item.Revision++;
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return new(TeacherClassMutationStatus.Conflict);
        }
        return new(TeacherClassMutationStatus.Updated, ToView(item));
    }

    private Task<TeacherClass?> LoadTrackedAsync(
        Guid workspaceId, Guid classId, CancellationToken cancellationToken) =>
        db.TeacherClasses
            .Include(x => x.StudentMembership).ThenInclude(x => x.Student)
            .Include(x => x.StudentMembership).ThenInclude(x => x.Program)
            .SingleOrDefaultAsync(x => x.WorkspaceId == workspaceId && x.Id == classId,
                cancellationToken);

    public static string NormalizeCover(string? style) => string.IsNullOrWhiteSpace(style)
        ? "lavender" : style.Trim().ToLowerInvariant();
    public static bool AllowedCover(string? style) => style is "lavender" or "sky" or "peach" or "mint";

    private static Dictionary<string, string[]> ValidateClassFields(
        string? title, string? description, int? duration, decimal? price,
        string? priceCurrency, string? priceBasis)
    {
        var errors = new Dictionary<string, string[]>();
        var cleanTitle = title?.Trim();
        if (string.IsNullOrWhiteSpace(cleanTitle) || cleanTitle.Length > 50)
            errors["title"] = ["Title must be between 1 and 50 characters."];
        if ((description?.Trim().Length ?? 0) > 200)
            errors["description"] = ["Description must not exceed 200 characters."];
        if (duration is int minutes && (minutes < 15 || minutes > 240 || minutes % 5 != 0))
            errors["durationMinutes"] = ["Duration must be 15–240 minutes in 5-minute increments."];
        var currency = string.IsNullOrWhiteSpace(priceCurrency) ? null : priceCurrency.Trim().ToUpperInvariant();
        var basis = string.IsNullOrWhiteSpace(priceBasis) ? null : priceBasis.Trim().ToLowerInvariant();
        if (price is decimal value)
        {
            if (value < 0 || value > 10000000m || value != decimal.Round(value, 2))
                errors["priceAmount"] = ["Price must be between 0 and 10000000, with at most 2 decimal places."];
            if (currency is not ("RUB" or "EUR" or "USD"))
                errors["priceCurrency"] = ["Select RUB, EUR or USD."];
            if (basis is not ("lesson" or "month"))
                errors["priceBasis"] = ["Select lesson or month."];
        }
        else if (currency is not null || basis is not null)
            errors["priceAmount"] = ["Price amount is required when currency or basis is set."];
        return errors;
    }

    private Task<TeacherClass?> FindByRequestAsync(
        Guid workspaceId, Guid requestId, CancellationToken cancellationToken) =>
        db.TeacherClasses.AsNoTracking()
            .Include(x => x.StudentMembership).ThenInclude(x => x.Student)
            .Include(x => x.StudentMembership).ThenInclude(x => x.Program)
            .SingleOrDefaultAsync(x => x.WorkspaceId == workspaceId && x.RequestId == requestId,
                cancellationToken);

    private static IQueryable<TeacherClassView> Project(IQueryable<TeacherClass> classes) =>
        classes.Select(x => new TeacherClassView(
            x.Id, x.Title, x.Description, x.Kind, x.StudentMembershipId,
            x.StudentMembership.Student.DisplayName, x.StudentMembership.ProgramId,
            x.StudentMembership.Program.DisplayName, x.IsArchived, x.CreatedAt,
            x.DurationMinutes, x.PriceAmount, x.PriceCurrency, x.PriceBasis,
            x.AllowLessonChat, x.AllowPrivateMessages, x.Revision,
            x.CoverStyle, x.InvitationStatus, x.InvitationExpiresAt, x.InvitationAcceptedAt));

    private static TeacherClassView ToView(TeacherClass item) => new(
        item.Id, item.Title, item.Description, item.Kind, item.StudentMembershipId,
        item.StudentMembership.Student.DisplayName, item.StudentMembership.ProgramId,
        item.StudentMembership.Program.DisplayName, item.IsArchived, item.CreatedAt,
        item.DurationMinutes, item.PriceAmount, item.PriceCurrency, item.PriceBasis,
        item.AllowLessonChat, item.AllowPrivateMessages, item.Revision,
        item.CoverStyle, item.InvitationStatus, item.InvitationExpiresAt, item.InvitationAcceptedAt);

    private static TeacherCreateClassResult Compare(
        TeacherClass existing, Guid studentMembershipId, string title, string description,
        int? durationMinutes, decimal? priceAmount, string? priceCurrency, string? priceBasis,
        bool allowLessonChat, bool allowPrivateMessages, string coverStyle) =>
        existing.Kind == "individual" && !existing.IsArchived &&
        existing.StudentMembershipId == studentMembershipId && existing.Title == title &&
        existing.Description == description && existing.DurationMinutes == durationMinutes &&
        existing.PriceAmount == priceAmount && existing.PriceCurrency == priceCurrency &&
        existing.PriceBasis == priceBasis && existing.AllowLessonChat == allowLessonChat &&
        existing.AllowPrivateMessages == allowPrivateMessages && existing.CoverStyle == coverStyle
            ? new(TeacherCreateClassStatus.Duplicate, ToView(existing))
            : new(TeacherCreateClassStatus.Conflict);
}
