'use strict';
// CONTRACT §3 X-TDC-Office: clinic days, closed dates and time zone come from the Dashboard.
const test = require('node:test');
const assert = require('node:assert');
const { officeFromHeaders, isClinicDay, nextClinicDay } = require('../lib/office');
const { startFakeGateway, startModule, call, close } = require('./helpers');

const FB = { tz: 'America/Los_Angeles', days: [1, 2, 3, 4, 5] };
const h = (v) => ({ headers: v === undefined ? {} : { 'x-tdc-office': v } });

test('parses the header and falls back part by part', () => {
  const o = officeFromHeaders(h('tz=America/Denver;days=1,2,3,4;closed=2026-12-24,2026-12-25,nonsense'), FB);
  assert.strictEqual(o.tz, 'America/Denver');
  assert.deepStrictEqual(o.days, [1, 2, 3, 4]);
  assert.deepStrictEqual([...o.closed], ['2026-12-24', '2026-12-25']);
  assert.strictEqual(o.fromDashboard, true);
  const f = officeFromHeaders(h(), FB);
  assert.deepStrictEqual([f.tz, f.days, f.closed.size, f.fromDashboard], ['America/Los_Angeles', [1, 2, 3, 4, 5], 0, false]);
  const bad = officeFromHeaders(h('tz=Not/AZone;days=9'), FB);
  assert.deepStrictEqual([bad.tz, bad.days], ['America/Los_Angeles', [1, 2, 3, 4, 5]]);
});

test('clinic days and closed dates', () => {
  const o = officeFromHeaders(h('days=1,2,3,4;closed=2026-11-30'), FB);
  assert.strictEqual(isClinicDay(o, '2026-11-26'), true);
  assert.strictEqual(isClinicDay(o, '2026-11-27'), false, 'Friday');
  assert.strictEqual(nextClinicDay(o, '2026-11-27'), '2026-12-01', 'skips the weekend and the closed Monday');
});

test('Today follows the Dashboard: next clinic day, closed dates, notes on closed days', async () => {
  const gw = await startFakeGateway();
  const mod = await startModule({ gateway: gw }); // today is Mon 2026-11-16
  try {
    const r = await call(mod.port, 'GET', '/', h('days=2,3;closed=2026-11-17'));
    assert.match(r.text, /Next clinic day · Wed, Nov 18/);
    const t = await call(mod.port, 'GET', '/tiles/today', h('days=2,3;closed=2026-11-17'));
    assert.match(t.json.title, /Next clinic day · Wed, Nov 18/);
    const c = await call(mod.port, 'GET', '/day?date=2026-11-17', h('days=2,3;closed=2026-11-17'));
    assert.match(c.text, /Office closed/);
    const n = await call(mod.port, 'GET', '/day?date=2026-11-16', h('days=2,3'));
    assert.match(n.text, /Not a clinic day/);
    const w = await call(mod.port, 'GET', '/week?date=2026-11-16', h('days=2,3;closed=2026-11-17'));
    assert.ok(!/MON, NOV 16|Mon, Nov 16<\/span><span class="tdc-gcount/.test(w.text));
    assert.match(w.text, /Wed, Nov 18/);
    const plain = await call(mod.port, 'GET', '/');
    assert.match(plain.text, /Today · Mon, Nov 16/, 'no header: CLINIC_DAYS default Mon-Fri');
  } finally { await close(mod.app); await close(gw); }
});
