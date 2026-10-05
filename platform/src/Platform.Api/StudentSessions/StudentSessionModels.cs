namespace TestingHosting.Platform.StudentSessions;

public sealed record StudentSessionRequest(string? Workspace, string? Code);

public sealed record StudentSessionStudent(Guid Id, string DisplayName, string ProgramId, Guid WorkspaceId);

public sealed record StudentSessionResponse(
    string AccessToken,
    string TokenType,
    DateTimeOffset ExpiresAt,
    StudentSessionStudent Student);

public sealed record StudentSessionIdentity(
    Guid MembershipId,
    Guid StudentId,
    string DisplayName,
    string ProgramId,
    Guid WorkspaceId);
