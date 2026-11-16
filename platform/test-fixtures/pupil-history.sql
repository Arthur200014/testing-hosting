-- Disposable calendar-browser database ONLY; invoked after synthetic memberships exist.
CREATE TEMP TABLE pupil_history_fixture AS
SELECT m."Id" AS membership, m."WorkspaceId" AS workspace, m."StudentId" AS student, m."ProgramId" AS program
FROM platform."WorkspaceStudentMemberships" m JOIN platform."Workspaces" w ON w."Id"=m."WorkspaceId"
WHERE w."Slug"='tas-calendar-north' AND m."Id"=:'pupil_membership'::uuid;
DO $$ BEGIN IF (SELECT count(*) FROM pupil_history_fixture) <> 1 THEN RAISE EXCEPTION 'Synthetic pupil missing'; END IF; END $$;

INSERT INTO platform."HomeworkAssignments"
("Id","WorkspaceId","MembershipId","StudentId","ProgramId","AssignmentRecordId","HomeworkId","TaskNumber","Name","Url","AssignedAt","DeadlineAt","SubmittedAt","Status","ScorePercent","SchemaVersion")
SELECT gen_random_uuid(),workspace,membership,student,program,'pupil-history-'||i,'history-work-'||i,6,
'Историческая работа '||i,'https://tests.invalid/history/'||i,'2026-11-01 00:00:00+03'::timestamptz + i * interval '1 minute',
'2026-11-03 00:00:00+03'::timestamptz,CASE WHEN i=21 THEN '2026-11-01 02:00:00+03'::timestamptz END,
CASE WHEN i=21 THEN 'submitted' ELSE 'assigned' END,CASE WHEN i=21 THEN 0 END,'2'
FROM pupil_history_fixture CROSS JOIN generate_series(1,21) AS i;
INSERT INTO platform."HomeworkSubmissions"
("Id","WorkspaceId","AssignmentId","MembershipId","StudentId","ProgramId","EventId","ScorePercent","DurationSeconds","CompletedAt","IsLate","SchemaVersion","CreatedAt")
SELECT gen_random_uuid(),a."WorkspaceId",a."Id",a."MembershipId",a."StudentId",a."ProgramId",'pupil-history-attempt',0,60,
'2026-11-01 02:00:00+03',false,'2','2026-11-01 02:00:00+03'
FROM platform."HomeworkAssignments" a JOIN pupil_history_fixture f ON f.membership=a."MembershipId" WHERE a."AssignmentRecordId"='pupil-history-21';

INSERT INTO platform."HistoricalTestResults"
("Id","WorkspaceId","MembershipId","StudentId","ProgramId","EventId","TestId","TestDate","TopicId","TopicName","TaskNumber","ScorePercent","DurationSeconds","ServerSubmittedAt","SchemaVersion")
SELECT gen_random_uuid(),workspace,membership,student,program,'pupil-test-event','pupil-test','2026-11-01','topic','Исторический тест',6,0,120,now(),'2' FROM pupil_history_fixture;
INSERT INTO platform."TestAttempts"
("Id","WorkspaceId","MembershipId","StudentId","ProgramId","EventId","TestId","Topic","TaskNumber","Correct","Total","Percent","StartedAt","CompletedAt","DurationSeconds","SchemaVersion","MoscowMonthKey","CreatedAt")
SELECT gen_random_uuid(),workspace,membership,student,program,'pupil-live-event','pupil-live','Тест на границе месяца',6,1,2,50,
'2026-10-31 20:59:00+00','2026-10-31 21:00:00+00',60,'1.0','2026-11',now() FROM pupil_history_fixture;
INSERT INTO platform."HistoricalMockResults"
("Id","WorkspaceId","MembershipId","StudentId","ProgramId","EventId","MockId","MockDate","VariantName","PrimaryScore","MaxPrimaryScore","ScorePercent","DurationSeconds","ServerSubmittedAt","SchemaVersion")
SELECT gen_random_uuid(),workspace,membership,student,program,'pupil-mock-event','pupil-mock','2026-11-01','Пробник с разбором',6,10,60,120,now(),'2' FROM pupil_history_fixture;
INSERT INTO platform."HistoricalMockTaskResults"
("Id","WorkspaceId","MembershipId","StudentId","ProgramId","EventId","MockId","MockDate","TaskNumber","TopicId","TopicName","IsCorrect","Answered","ServerSubmittedAt","SchemaVersion")
SELECT gen_random_uuid(),workspace,membership,student,program,'pupil-mock-part','pupil-mock','2026-11-01',6,'topic','Тригонометрия: разбор',false,true,now(),'2' FROM pupil_history_fixture;
INSERT INTO platform."HistoricalMockSessions"
("Id","WorkspaceId","MembershipId","StudentId","ProgramId","SessionId","MockId","StartedAt","DeadlineAt","SubmittedAt","AnswersJson","Status","SchemaVersion","MockConfigJson")
SELECT gen_random_uuid(),workspace,membership,student,program,'pupil-session','pupil-mock','2026-11-01 12:00:00+03','2026-11-01 13:00:00+03',
'2026-11-01 12:30:00+03','{}','submitted','2','{}' FROM pupil_history_fixture;
