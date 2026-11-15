// Calendar projections are read-only: rule occurrences never become Lessons.
export const calendarZone = 'Europe/Moscow';
const formatters = new Map();
function parts(value, zone) {
  if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }));
  return Object.fromEntries(formatters.get(zone).formatToParts(new Date(value)).map(p => [p.type, p.value]));
}
export function calendarDay(value = Date.now(), zone = calendarZone) {
  const p = parts(value, zone);
  return `${p.year}-${p.month}-${p.day}`;
}
export function shiftCalendarDay(day, delta) {
  const value = new Date(day + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(+value) || calendarDay(value, 'UTC') !== day) return null;
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}
export function calendarTime(value, zone = calendarZone) {
  const p = parts(value, zone);
  return `${p.hour}:${p.minute}`;
}
// Probe the offsets on both sides of a transition and verify the local time.
// A DST gap has no occurrence; a repeated time uses its first occurrence once.
export function localSlotInstant(day, minute, zone) {
  const wall = Date.parse(day + 'T00:00:00Z') + minute * 60000;
  const matches = [];
  for (const offset of [-36, 0, 36]) {
    const probe = wall + offset * 3600000;
    const p = parts(probe, zone);
    const asUtc = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    const candidate = wall - (asUtc - probe);
    const actual = parts(candidate, zone);
    if (`${actual.year}-${actual.month}-${actual.day}` === day &&
        Number(actual.hour) * 60 + Number(actual.minute) === minute) matches.push(candidate);
  }
  return matches.length ? Math.min(...matches) : null;
}
export function calendarEntries(day, lessons, rules, classes, zone = calendarZone) {
  if (!shiftCalendarDay(day, 0)) return [];
  const start = localSlotInstant(day, 0, zone);
  const end = localSlotInstant(shiftCalendarDay(day, 1), 0, zone);
  const entries = [];
  const include = entry => {
    if (entry.start < end && entry.end > start) entries.push({...entry, visibleStart: Math.max(entry.start, start)});
  };
  for (const lesson of lessons) {
    const at = Date.parse(lesson.lessonAt);
    if (!Number.isFinite(at)) continue;
    const duration = Math.max(1, ...(lesson.participants || []).map(p => Number(p.durationMinutes) || 60));
    include({kind:'lesson', id:lesson.id, lesson, start:at, end:at + duration * 60000});
  }
  for (const rule of rules.filter(r => r.isActive)) {
    const item = classes.find(c => c.id === rule.classId && c.kind === rule.classKind && !c.isArchived && c.persistent !== false);
    if (!item) continue;
    // Include adjacent local dates, including a slot continuing from yesterday.
    const first = calendarDay(start - rule.durationMinutes * 60000, rule.timeZoneId);
    const last = calendarDay(end - 1, rule.timeZoneId);
    for (let localDay = first; localDay <= last; localDay = shiftCalendarDay(localDay, 1)) {
      const weekday = new Date(localDay + 'T12:00:00Z').getUTCDay();
      if (!(rule.daysMask & (1 << ((weekday + 6) % 7)))) continue;
      const at = localSlotInstant(localDay, rule.startMinute, rule.timeZoneId);
      if (at !== null) include({kind:'rule', id:rule.id, rule, item, start:at, end:at + rule.durationMinutes * 60000});
    }
  }
  return entries.sort((a,b) => a.visibleStart-b.visibleStart || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

export function calendarWeekDays(day) {
  if (!shiftCalendarDay(day, 0)) return [];
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay();
  const monday = shiftCalendarDay(day, -((weekday + 6) % 7));
  return Array.from({length:7}, (_,offset)=>shiftCalendarDay(monday, offset));
}
export function calendarWeek(day, lessons, rules, classes, zone = calendarZone) {
  return calendarWeekDays(day).map(date=>({date, entries:calendarEntries(date, lessons, rules, classes, zone)}));
}
