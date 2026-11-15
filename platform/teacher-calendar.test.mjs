import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDay, calendarTime, shiftCalendarDay, localSlotInstant, calendarEntries } from './teacher-calendar.mjs';
const item = {id:'class',kind:'individual',persistent:true};
const rule = {id:'rule',classId:'class',classKind:'individual',isActive:true,daysMask:1,startMinute:15*60,durationMinutes:60,timeZoneId:'Europe/Moscow'};
test('Moscow navigation and date boundaries are independent of device zone', () => {
  assert.equal(calendarDay('2026-11-15T21:30Z'),'2026-11-16');
  assert.equal(shiftCalendarDay('2026-12-31',1),'2027-01-01');
  assert.equal(shiftCalendarDay('2028-03-01',-1),'2028-02-29');
  assert.equal(shiftCalendarDay('2026-02-30',0),null);
  assert.equal(calendarTime('2026-11-15T21:30Z'),'00:30');
});
test('saved lessons remain distinct from rule projections without mutating input', () => {
  const lessons = [{id:'lesson',lessonAt:'2026-11-16T12:00Z',participants:[{durationMinutes:90,attendanceStatus:'Unknown'}]}];
  const before = JSON.stringify({lessons,rule,item});
  const rows = calendarEntries('2026-11-16',lessons,[rule],[item]);
  assert.deepEqual(rows.map(r=>r.kind),['lesson','rule']);
  assert.equal(rows[0].end-rows[0].start,90*60000);
  assert.equal(JSON.stringify({lessons,rule,item}),before);
  assert.equal(calendarEntries('2026-11-17',lessons,[rule],[item]).length,0);
});
test('inactive, archived and unavailable class rules cannot appear', () => {
  assert.equal(calendarEntries('2026-11-16',[],[{...rule,isActive:false}],[item]).length,0);
  assert.equal(calendarEntries('2026-11-16',[],[rule],[{...item,isArchived:true}]).length,0);
  assert.equal(calendarEntries('2026-11-16',[],[rule],[]).length,0);
});
test('rule timezone conversion includes the preceding local date and midnight overlaps', () => {
  const western = {...rule,startMinute:23*60+30,timeZoneId:'America/New_York'};
  const rows = calendarEntries('2026-11-17',[],[western],[item]);
  assert.equal(rows.length,1);
  assert.equal(new Date(rows[0].start).toISOString(),'2026-11-17T04:30:00.000Z');
  const overnight = [{id:'late',lessonAt:'2026-11-15T20:30Z',participants:[{durationMinutes:120}]}];
  assert.equal(calendarTime(calendarEntries('2026-11-16',overnight,[],[])[0].visibleStart),'00:00');
});
test('DST gaps are skipped and repeated wall time produces one stable occurrence', () => {
  assert.equal(localSlotInstant('2026-03-29',150,'Europe/Berlin'),null);
  assert.equal(new Date(localSlotInstant('2026-10-25',150,'Europe/Berlin')).toISOString(),'2026-10-25T00:30:00.000Z');
  assert.equal(calendarEntries('2026-03-29',[],[{...rule,daysMask:64,startMinute:150,timeZoneId:'Europe/Berlin'}],[item]).length,0);
});
