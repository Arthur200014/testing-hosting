using ClosedXML.Excel;
using TestingHosting.Platform.HomeworkImport;

namespace TestingHosting.Platform.IntegrationTests;

public sealed class HomeworkWorkbookParserRegressionTests
{
    [Fact]
    public void MissingRequiredAssignmentDatesDoNotProduceDerivedDeadlineDiagnostics()
    {
        var path = Path.Combine(Path.GetTempPath(), $"homework-date-regression-{Guid.NewGuid():N}.xlsx");
        try
        {
            using (var workbook = new XLWorkbook())
            {
                var catalog = workbook.AddWorksheet("ДЗ_Каталог");
                WriteRow(catalog, 1, "homeworkId", "taskNumber", "name", "url", "active", "order", "createdAt", "programId");
                WriteRow(catalog, 2, "hw-date-regression", 6, "Synthetic homework", "https://tests.invalid/homework", true, 1,
                    "15.08.2026", "legacy-ege");

                var assignments = workbook.AddWorksheet("ДЗ_Назначения");
                WriteRow(assignments, 1, "assignmentRecordId", "studentId", "homeworkId", "taskNumber", "homeworkName",
                    "homeworkUrl", "assignedAt", "deadlineAt", "submittedAt", "status", "scorePercent",
                    "homeworkEventId", "lessonId", "schemaVersion", "programId");
                WriteRow(assignments, 2, "missing-assigned", "student-1", "hw-date-regression", 6, "Synthetic homework",
                    "https://tests.invalid/homework", "", "2026-10-02 12:00:00", "", "assigned", "", "", "", "2", "legacy-ege");
                WriteRow(assignments, 3, "missing-deadline", "student-1", "hw-date-regression", 6, "Synthetic homework",
                    "https://tests.invalid/homework", "2026-10-01 12:00:00", "", "", "assigned", "", "", "", "2", "legacy-ege");
                workbook.SaveAs(path);
            }

            var parsed = new HomeworkWorkbookParser().Parse(path);

            Assert.Empty(parsed.Assignments);
            Assert.Contains(parsed.Diagnostics, x => x.RowNumber == 2 && x.Field == "assignedAt" && x.Category == "invalid_datetime");
            Assert.Contains(parsed.Diagnostics, x => x.RowNumber == 3 && x.Field == "deadlineAt" && x.Category == "invalid_datetime");
            Assert.DoesNotContain(parsed.Diagnostics, x =>
                (x.RowNumber == 2 || x.RowNumber == 3) &&
                x.Field == "deadlineAt" &&
                (x.Category == "invalid_deadline" || x.Category == "unsupported_deadline_window"));
        }
        finally
        {
            File.Delete(path);
        }
    }

    private static void WriteRow(IXLWorksheet sheet, int rowNumber, params object[] values)
    {
        for (var column = 0; column < values.Length; column++)
        {
            var cell = sheet.Cell(rowNumber, column + 1);
            switch (values[column])
            {
                case string text:
                    cell.Value = text;
                    break;
                case int number:
                    cell.Value = number;
                    break;
                case bool flag:
                    cell.Value = flag;
                    break;
                default:
                    throw new ArgumentException("Unsupported synthetic cell value.");
            }
        }
    }
}
