import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDay, calendarTime, shiftCalendarDay, localSlotInstant, calendarEntries, calendarWeekDays, calendarWeek, shiftCalendarMonth, calendarMonthDays, calendarMonth, previewClassPeriod } from './teacher-calendar.mjs';
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

test('weeks begin Monday and preserve all seven dates across year and leap boundaries', () => {
  assert.deepEqual(calendarWeekDays('2027-01-03'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  assert.equal(calendarWeekDays('2027-01-04')[0],'2027-01-04');
  assert.ok(calendarWeekDays('2028-03-01').includes('2028-02-29'));
  assert.deepEqual(calendarWeekDays('invalid'),[]);
});
test('week projection reuses day boundaries, shows overnight continuation and never writes', () => {
  const lessons = [{id:'overnight',lessonAt:'2026-11-16T20:30Z',participants:[{durationMinutes:120}]}];
  const rules = [{...rule,daysMask:5}];
  const before = JSON.stringify({lessons,rules});
  const week = calendarWeek('2026-11-18',lessons,rules,[item]);
  assert.equal(week.length,7);
  assert.equal(week[0].date,'2026-11-16');
  for (const day of week) assert.deepEqual(day.entries,calendarEntries(day.date,lessons,rules,[item]));
  assert.equal(week[0].entries.filter(e=>e.kind==='lesson').length,1);
  assert.equal(calendarTime(week[1].entries[0].visibleStart),'00:00');
  assert.equal(week[2].entries[0].kind,'rule');
  assert.deepEqual(week[6].entries,[]);
  assert.equal(JSON.stringify({lessons,rules}),before);
});

test('month navigation clamps dates and crosses year/leap boundaries',()=>{
  assert.equal(shiftCalendarMonth('2026-01-31',1),'2026-02-28');
  assert.equal(shiftCalendarMonth('2028-01-31',1),'2028-02-29');
  assert.equal(shiftCalendarMonth('2026-12-31',1),'2027-01-31');
  assert.equal(shiftCalendarMonth('2026-01-31',-1),'2025-12-31');
  assert.equal(shiftCalendarMonth('invalid',1),null);
});
test('month grids contain whole Monday-Sunday weeks including neighbouring dates',()=>{
  const dates=calendarMonthDays('2026-11-18');
  assert.equal(dates.length,42); assert.equal(dates[0],'2026-10-26'); assert.equal(dates.at(-1),'2026-12-06');
  assert.equal(calendarMonthDays('2021-02-01').length,28);
  assert.ok(calendarMonthDays('2028-02-15').includes('2028-02-29'));
  assert.deepEqual(calendarMonthDays('invalid'),[]);
});
test('month events use the same read-only day projection and preserve overnight records',()=>{
  const lessons=[{id:'night',lessonAt:'2026-11-30T20:30Z',participants:[{durationMinutes:120}]}];
  const before=JSON.stringify(lessons);
  const month=calendarMonth('2026-11-18',lessons,[rule],[item]);
  for(const day of month) assert.deepEqual(day.entries,calendarEntries(day.date,lessons,[rule],[item]));
  assert.ok(month.find(d=>d.date==='2026-12-01').entries.some(e=>e.id==='night'));
  assert.equal(JSON.stringify(lessons),before);
});

test('period preview is inclusive, class-scoped and marks existing lessons without mutation',()=>{
  const lessons=[{id:'saved',individualClassId:'class',lessonAt:'2026-11-16T12:00Z'}];
  const rules=[rule,{...rule,id:'foreign',classId:'other'},{...rule,id:'off',isActive:false}];
  const before=JSON.stringify({lessons,rules});
  const rows=previewClassPeriod('2026-11-16','2026-11-30',item,lessons,rules);
  assert.equal(rows.length,3); assert.equal(rows.filter(x=>x.isScheduled).length,1);
  assert.equal(JSON.stringify({lessons,rules}),before);
  assert.equal(previewClassPeriod('2026-11-17','2026-11-17',item,lessons,rules).length,0);
  assert.equal(previewClassPeriod('2026-11-16','2026-11-16',item,[{...lessons[0],individualClassId:'other'}],rules)[0].isScheduled,false);
});
test('period preview validates the range and excludes archived classes and prior-day continuations',()=>{
  assert.throws(()=>previewClassPeriod('bad','2026-11-30',item,[],[]),/корректные/);
  assert.throws(()=>previewClassPeriod('2026-11-30','2026-11-16',item,[],[]),/окончания/);
  assert.throws(()=>previewClassPeriod('2026-11-01','2026-12-02',item,[],[]),/31/);
  assert.throws(()=>previewClassPeriod('2026-11-16','2026-11-16',{...item,isArchived:true},[],[rule]),/недоступен/);
  const late={...rule,startMinute:23*60+30,durationMinutes:120};
  assert.equal(previewClassPeriod('2026-11-17','2026-11-17',item,[],[late]).length,0);
});
