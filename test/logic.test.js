'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { xrayState, xrayDue, labState, normLab, groupTreatment, shortName, settingsFrom, assembleDay, dow } = require('../lib/data');
const { parseDate, shortDate, clock, officeToday, addMonths } = require('../lib/dates');
const { esc, money } = require('../lib/render');

const T = '2026-11-16';
const S = settingsFrom({});

test('names are first initial and last name', () => {
  assert.strictEqual(shortName({ FName: 'kim', LName: 'Battles' }), 'K. Battles');
  assert.strictEqual(shortName({ FName: '', LName: 'Solo' }), 'Solo');
});

test('crown + buildup and abutment + implant crown group by tooth; priority then fee', () => {
  const rows = [
    { ProcNum: 1, ProcCode: 'D2740', Descript: 'crown', ToothNum: '3', Fee: 1200, Priority: '3' },
    { ProcNum: 2, ProcCode: 'D2954', Descript: 'post and core', ToothNum: '3', Fee: 350, Priority: '1' },
    { ProcNum: 3, ProcCode: 'D6058', Descript: 'implant crown', ToothNum: '19', Fee: 1500, Priority: '' },
    { ProcNum: 4, ProcCode: 'D6057', Descript: 'custom abutment', ToothNum: '19', Fee: 600, Priority: '' },
    { ProcNum: 5, ProcCode: 'D2950', Descript: 'buildup', ToothNum: '30', Fee: 300, Priority: '2' },
    { ProcNum: 6, ProcCode: 'D2391', Descript: 'resin', ToothNum: '12', Fee: 200, Priority: '2' },
  ];
  const g = groupTreatment(rows);
  assert.deepStrictEqual(g.map((x) => x.label), ['Crown + post & core #3', 'buildup', 'resin', 'Custom abutment + crown #19']);
  assert.strictEqual(g[0].fee, 1550);
  assert.strictEqual(g[0].priority, '1', 'the lower number of the two');
  assert.strictEqual(g[3].fee, 2100);
});

test('x-rays due: FMX every 5 years, BWX every 12 months unless an FMX was taken', () => {
  const x = (fmx, bwx) => [{ Category: 'FMX', LastDate: fmx }, { Category: 'BWX', LastDate: bwx }];
  assert.deepStrictEqual(xrayDue(x(null, null), '', T, S).flags, [{ name: 'FMX', state: 'add' }, { name: 'BWX', state: 'add' }]);
  assert.deepStrictEqual(xrayDue(x('2024-01-01', '2026-01-01'), '', T, S).flags, []);
  assert.deepStrictEqual(xrayDue(x('2024-01-01', '2025-06-01'), '', T, S).flags, [{ name: 'BWX', state: 'add' }]);
  assert.deepStrictEqual(xrayDue(x('2026-03-01', '2024-06-01'), '', T, S).flags, [], 'FMX in the last 12 months covers bitewings');
  assert.deepStrictEqual(xrayDue(x('2019-01-01', '2026-01-01'), 'D0150, D0210', T, S).flags, [{ name: 'FMX', state: 'onappt' }]);
  assert.deepStrictEqual(xrayDue(x('2019-01-01', '2026-01-01'), '', T, settingsFrom({ XRAY_FMX_MONTHS: '120' })).flags, [], 'setting changes the interval');
});

test('insurance frequency limit states', () => {
  assert.strictEqual(xrayState({ CoveredNow: true, NextCovered: '2026-01-01' }, T).label, 'Covered');
  assert.strictEqual(xrayState({ CoveredNow: true, NextCovered: T }, T).label, 'Covered from today');
  assert.strictEqual(xrayState({ CoveredNow: false, NextCovered: '2027-01-01' }, T).label, 'Not covered yet');
  assert.strictEqual(xrayState({ CoveredNow: null, NextCovered: null, Limit: 'No insurance on file' }, T).label, 'No insurance');
});

test('lab case states', () => {
  const base = { LabCaseNum: 1, PatNum: 1, DateTimeSent: '2026-11-01 00:00:00', DateTimeRecd: '0001-01-01', SeatAppt: '2026-11-20 09:00:00', AptStatus: 1 };
  assert.strictEqual(labState(normLab({ ...base, Status: 'received_not_checked' }), T).status, 'ok');
  assert.strictEqual(labState(normLab({ ...base, Status: 'at_lab', Overdue: 1 }), T).label, 'Late at the lab');
  assert.strictEqual(labState(normLab({ ...base, Status: 'at_lab', DateTimeDue: '2026-11-21 00:00:00' }), T).label, 'Due after the seat date');
  assert.strictEqual(labState(normLab({ ...base, Status: 'not_sent', SeatAppt: '2026-11-17 09:00:00' }), T).status, 'alert');
});

test('goal cards: office totals of provider goals; without the goals report, production only', () => {
  const appt = { AptNum: 1, PatNum: 1, AptDateTime: `${T} 08:00:00`, Status: 'Scheduled', ScheduledFee: 500, Procedures: '' };
  const goals = [{ Provider: 'DOC', Goal: 3000, ScheduledProduction: 3300 }, { Provider: 'HYG', IsHygienist: true, Goal: 1000, ScheduledProduction: 800 }];
  const d = assembleDay(T, [appt], [], [], [], [], goals, S);
  assert.deepStrictEqual(d.goals.office, { name: 'Office', scheduled: 4100, goal: 4000 });
  assert.deepStrictEqual(d.goals.providers.map((p) => p.name), ['DOC', 'HYG']);
  const n = assembleDay(T, [appt], [], [], [], [], null, S);
  assert.strictEqual(n.goals.available, false);
  assert.strictEqual(n.goals.office.scheduled, 500);
});

test('clinic days setting', () => {
  assert.deepStrictEqual(settingsFrom({ CLINIC_DAYS: '1,2,3,4' }).clinicDays, [1, 2, 3, 4]);
  assert.strictEqual(dow('2026-11-27'), 5);
});

test('dates and money', () => {
  assert.strictEqual(parseDate('20261116'), '2026-11-16');
  assert.strictEqual(parseDate('2026-02-30'), null);
  assert.strictEqual(shortDate('2026-11-16', T), 'Mon, Nov 16');
  assert.strictEqual(shortDate('2025-11-16', T), 'Sun, Nov 16, 2025');
  assert.deepStrictEqual(clock('13:05'), { text: '1:05', ap: 'pm', hour: 13 });
  assert.strictEqual(officeToday(new Date('2026-11-17T06:30:00Z')), '2026-11-16', 'office day, not UTC');
  assert.strictEqual(addMonths('2026-03-31', -1), '2026-02-28');
  assert.strictEqual(money(1820), '$1,820');
  assert.strictEqual(money(12.5), '$12.50');
  assert.strictEqual(esc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});
