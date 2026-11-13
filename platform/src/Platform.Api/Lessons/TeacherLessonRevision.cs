using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace TestingHosting.Platform.Lessons;

// A stable snapshot fingerprint: no schema migration or mutable timestamps.
// Include every editable field and the exact (workspace-scoped) participant set.
public static class TeacherLessonRevision
{
    public static string Compute(DateTimeOffset lessonAt, IEnumerable<TeacherLessonParticipantView> participants)
    {
        var rows = participants.OrderBy(x => x.MembershipId).Select(x => new
        {
            x.MembershipId, x.StudentId, x.ProgramId, x.DurationMinutes,
            x.TaskNumbers, x.TopicComment, x.AttendanceStatus
        }).ToArray();
        var payload = JsonSerializer.Serialize(new { Ticks = lessonAt.ToUniversalTime().Ticks, Rows = rows });
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload)));
    }

    public static TeacherLessonView FromEntity(Lesson lesson)
    {
        var rows = lesson.Participants.OrderBy(x => x.MembershipId)
            .Select(x => new TeacherLessonParticipantView(
                x.MembershipId, x.StudentId, x.ProgramId, x.DurationMinutes,
                x.TaskNumbers, x.TopicComment, x.AttendanceStatus)).ToList();
        return new(lesson.Id, lesson.LegacyLessonId, lesson.LessonAt,
            rows, Compute(lesson.LessonAt, rows));
    }
}
