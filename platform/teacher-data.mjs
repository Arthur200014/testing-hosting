export const teacherPaths = {
  classes: 'classes', groups: 'groups', scheduleRules: 'schedule-rules', programs: 'programs', students: 'students', lessons: 'lessons',
  catalog: 'homework/catalog', assignments: 'homework/assignments',
  submissions: 'homework/submissions', subscriptions: 'subscriptions',
  nativeTasks: 'homework/native/tasks', nativeAssignments: 'homework/native/assignments',
  recordings: 'recordings', libraryFolders: 'library-folders', materials: 'materials', classMaterialLinks: 'class-materials', lessonMaterialLinks: 'lesson-materials',
  lessonTopicSets: 'lesson-topics', classTopics: 'class-topics', topicMaterialLinks: 'topic-materials', topicTaskLinks: 'topic-tasks',
  tests: 'tests/history', liveTests: 'tests/attempts',
  mocks: 'mocks/results', mockSessions: 'mocks/sessions'
};

// Cache each group independently; never fall back to the truncated workspace feed.
export function groupHomeworkKey(id) { return 'groupHomework:' + id; }
export function contextHomeworkKey(item, lesson = null) {
  if (item.persistent === false && !lesson) return 'nativeAssignments';
  return lesson ? 'lessonHomework:' + lesson.id : item.kind === 'group' ? groupHomeworkKey(item.id) : 'classHomework:' + item.id;
}
export function teacherResourcePath(key) {
  if (Object.hasOwn(teacherPaths, key)) return teacherPaths[key];
  const pupil = /^studentHomework:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(tasks|results):(\d{1,8})(?::(all|\d{4}-\d{2}):(all|(?:group|individual)~[0-9a-f-]{36}))?$/i.exec(key);
  if(pupil) {
    let path='students/' + pupil[1] + '/homework?page=' + pupil[3] + '&results=' + (pupil[2] === 'results');
    if(pupil[4] && pupil[4]!=='all') path+='&month='+pupil[4];
    if(pupil[5] && pupil[5]!=='all') {const [kind,id]=pupil[5].split('~');path+='&classKind='+kind+'&classId='+id;}
    return path;
  }
  const history=/^studentHistory:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(imported|tests|liveTests|mocks|mockTasks|mockSessions):(tasks|results):(\d{1,8}):(all|\d{4}-\d{2}):([^:]*):(all|\d{4}-\d{2}-\d{2})$/.exec(key);
  if(history) {
    const query=new URLSearchParams({source:history[2],page:history[4],results:String(history[3]==='results')});
    if(history[5]!=='all') query.set('month',history[5]);
    if(history[6]) query.set('mockId',decodeURIComponent(history[6]));
    if(history[7]!=='all') query.set('mockDate',history[7]);
    return 'students/'+history[1]+'/history?'+query;
  }
  const match = /^(groupHomework|classHomework|lessonHomework):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(key);
  if (match) return ({groupHomework:'groups',classHomework:'classes',lessonHomework:'lessons'})[match[1]] + '/' + match[2] + '/homework';
  throw new Error('Unknown teacher resource: ' + key);
}

export const teacherNeeds = {
  overview: ['classes', 'groups', 'students', 'lessons', 'scheduleRules'],
  students: ['students', 'programs'],
  lessons: ['classes', 'groups', 'scheduleRules', 'students', 'programs', 'lessons', 'catalog'],
  homework: ['students', 'programs', 'catalog', 'assignments', 'submissions', 'nativeTasks', 'nativeAssignments'],
  library: ['recordings','libraryFolders','programs','students','classes','groups','lessons','nativeTasks','materials','classMaterialLinks','lessonMaterialLinks','classTopics','topicMaterialLinks','topicTaskLinks'],
  subscriptions: ['students', 'subscriptions'],
  results: ['students', 'tests', 'liveTests', 'mocks', 'mockSessions'],
  report: ['students', 'lessons', 'assignments', 'nativeAssignments', 'tests', 'liveTests', 'mocks']
};

export const teacherMutationKeys = {
  classForm: ['classes'], classEditForm: ['classes'],
  groupForm: ['groups'], groupEditForm: ['groups'], classScheduleRuleForm: ['scheduleRules'],
  studentForm: ['students'], studentEditForm: ['students','classes','groups'],
  lessonForm: ['lessons', 'assignments'], lessonCorrectionForm: ['lessons'], lessonPlannerForm: ['lessons','lessonTopicSets'],
  nativeTaskForm: ['nativeTasks'], nativeAssignForm: ['nativeAssignments'],
  groupNativeTaskForm: ['nativeTasks'], lessonNativeTaskForm: ['nativeTasks'], lessonNativeAssignForm: ['nativeAssignments'],
  classNativeTaskForm: ['nativeTasks'], classNativeAssignForm: ['nativeAssignments'], groupNativeAssignForm: ['nativeAssignments'],
  classMaterialLinkForm: ['materials','classMaterialLinks'], classMaterialAttachForm: ['classMaterialLinks'],
  lessonMaterialAttachForm: ['lessonMaterialLinks'],
  lessonTopicSetForm: ['lessonTopicSets'], topicLessonAttachForm: ['lessonTopicSets'],
  classTopicForm: ['classTopics'], topicMaterialAttachForm: ['topicMaterialLinks'], topicTaskAttachForm: ['topicTaskLinks'],
  catalogForm: ['catalog'], homeworkForm: ['assignments'],
  subscriptionForm: ['subscriptions']
};

// This full reset is required on logout, login or a different workspace.
export function invalidateTeacherData(state) {
  state.fileUpload = null;
  state.library = {query:'',kind:'all',programId:'',sort:'newest',selected:'',manageOpen:false,folderId:'',folderEditor:'',section:'materials',recordingEditor:'',recordingQuery:'',recordingClass:''};
  state.generation++;
  state.data = {};
  state.loadedAt = {};
  state.inflight = {};
  state.keyVersions = {};
}

// After a confirmed write, refetch only resources modified by that write.
// Per-key versions also reject older in-flight responses from before the write.
export function invalidateTeacherKeys(state, keys) {
  for (const key of keys) {
    teacherResourcePath(key);
    state.keyVersions ||= {};
    state.keyVersions[key] = (state.keyVersions[key] || 0) + 1;
    delete state.data[key];
    delete state.loadedAt[key];
    delete state.inflight[key];
  }
}

export function loadTeacherKey(state, key, request, onUpdate, force = false, now = Date.now) {
  if (state.inflight[key]) return state.inflight[key];
  if (!force && state.loadedAt[key] != null && now() - state.loadedAt[key] < 30000)
    return Promise.resolve();
  // Keep the previous successful value visible while a stale/forced read refreshes.
  // Session changes and successful mutations still clear all cached data via
  // invalidateTeacherData, preventing cross-session or post-write stale data.
  const generation = state.generation;
  const keyVersion = state.keyVersions?.[key] || 0;
  const promise = Promise.resolve().then(() => request(teacherResourcePath(key))).then(value => {
    if (generation !== state.generation || keyVersion !== (state.keyVersions?.[key] || 0)) return;
    state.data[key] = value;
    state.loadedAt[key] = now();
    onUpdate(key);
  }).finally(() => { if (state.inflight[key] === promise) delete state.inflight[key]; });
  state.inflight[key] = promise;
  return promise;
}
