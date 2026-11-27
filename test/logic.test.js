'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { xrayState, labState, normLab } = require('../lib/data');
const { parseDate, shortDate, clock, officeToday } = require('../lib/dates');

const T = '2026-11-16';
test('x-ray colours: overdue, due today, not covered yet, no limit', () => {
  assert.strictEqual(xrayState({ CoveredNow: true, NextCovered: '2026-01-01' }, T).label, 'Overdue');
  assert.strictEqual(xrayState({ CoveredNow: true, NextCovered: T }, T).label, 'Due today');
  assert.strictEqual(xrayState({ CoveredNow: false, NextCovered: '2027-01-01' }, T).label, 'Not covered yet');
  assert.strictEqual(xrayState({ CoveredNow: null, NextCovered: null }, T).label, 'No limit on file');
});

test('lab case states', () => {
  const base = { LabCaseNum: 1, PatNum: 1, DateTimeSent: '2026-11-01 00:00:00', DateTimeRecd: '0001-01-01', SeatAppt: '2026-11-20 09:00:00', AptStatus: 1 };
  assert.strictEqual(labState(normLab({ ...base, Status: 'received_not_checked', DateTimeRecd: '2026-11-10' }), T).status, 'ok');
  assert.strictEqual(labState(normLab({ ...base, Status: 'at_lab', Overdue: 1 }), T).label, 'Late at the lab');
  assert.strictEqual(labState(normLab({ ...base, Status: 'at_lab', DateTimeDue: '2026-11-21 00:00:00' }), T).label, 'Due after the seat date');
  assert.strictEqual(labState(normLab({ ...base, Status: 'at_lab', DateTimeDue: '2026-11-18 00:00:00' }), T).label, 'At the lab');
  assert.strictEqual(labState(normLab({ ...base, Status: 'not_sent', SeatAppt: '2026-11-17 09:00:00' }), T).status, 'alert');
});

test('dates', () => {
  assert.strictEqual(parseDate('20261116'), '2026-11-16');
  assert.strictEqual(parseDate('2026-02-30'), null);
  assert.strictEqual(shortDate('2026-11-16', T), 'Mon, Nov 16');
  assert.strictEqual(shortDate('2025-11-16', T), 'Sun, Nov 16, 2025');
  assert.deepStrictEqual(clock('13:05'), { text: '1:05', ap: 'pm', hour: 13 });
  assert.strictEqual(officeToday(new Date('2026-11-17T06:30:00Z')), '2026-11-16', 'office day, not UTC');
});
