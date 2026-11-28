'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { startFakeGateway, startModule, call, close } = require('./helpers');

let gw; let mod;
test.before(async () => { gw = await startFakeGateway(); mod = await startModule({ gateway: gw }); });
test.after(async () => { await close(mod.app); await close(gw); });

function sharedLook(html) {
  assert.match(html, /<link rel="stylesheet" href="\/shared\/tdc.css">/);
  assert.match(html, /<script src="\/shared\/shell.js" defer><\/script>/);
  assert.match(html, /<body data-module="daysheet"/);
  assert.match(html, /<main class="tdc-main">/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>\s*\S/i, 'no inline scripts');
  assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i, 'no inline event handlers');
  assert.doesNotMatch(html, /(href|src|action)=["']\/(?!shared\/|m\/)/i, 'links use the base path');
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)|https?:\/\/[^"']*\.woff/);
  assert.doesNotMatch(html, /#[0-9a-f]{6}\b/i, 'colours come from the shared tokens');
}

test('Today: tiles, banner with production, goal cards, short names, row chips and a panel for each', async () => {
  const r = await call(mod.port, 'GET', '/');
  assert.strictEqual(r.status, 200);
  sharedLook(r.text);
  for (const n of ['A. Testerson', 'B. Sampleton', 'C. Mockford']) assert.ok(r.text.includes(n), n);
  assert.ok(!r.text.includes('Sampleton, Bea'), 'full names stay off the list');
  assert.match(r.text, /3 patients · \$1,820/);
  assert.match(r.text, /X-rays to add/);
  assert.match(r.text, /tdc-stat-badge">1 ins</, 'corner badge: patients with planned work and insurance left');
  assert.match(r.text, /Production and goals/);
  assert.match(r.text, /DOC1/);
  assert.match(r.text, /of \$3,600 goal/);
  assert.match(r.text, /Unsched Tx \$1,820/);
  assert.match(r.text, /No ins max on file/);
  assert.match(r.text, /Add FMX/, 'never had an FMX');
  assert.match(r.text, /Seat crown #30/);
  assert.match(r.text, /<template id="ds-p-502">/);
  assert.ok(!r.text.includes('Fakely'), 'broken appointments hidden by default');
});

test('panel: grouped treatment, insurance left bar, x-ray flags and plan limits, lab case for the visit', async () => {
  const r = await call(mod.port, 'GET', '/patient?patient=9002&apt=502&date=2026-11-16&fragment=1');
  assert.strictEqual(r.status, 200);
  assert.match(r.text, /Crown \+ buildup #19/);
  assert.match(r.text, /D2950/);
  assert.match(r.text, /\$932<\/span> of \$2,000 left/);
  assert.match(r.text, /Lab cases for this visit/);
  assert.match(r.text, /Pretend Lab/);
  const c = await call(mod.port, 'GET', '/patient?patient=9003&apt=503&date=2026-11-16&fragment=1');
  assert.match(c.text, /FMX on appt/, 'D0210 is already on the appointment');
  assert.match(c.text, /No ins max on file/);
});

test('only the reports this module needs are asked for, and hygiene is left to the gateway', async () => {
  for (const c of gw.calls.filter((x) => x.report === 'unscheduled_treatment')) assert.ok(!('include_hygiene' in c.params));
  for (const r of new Set(gw.calls.map((c) => c.report))) {
    assert.ok(['daysheet', 'xray_history', 'unscheduled_treatment', 'insurance_remaining', 'lab_cases_open', 'operatories', 'daysheet_goals'].includes(r), r);
  }
});

test('any day: date picker, compact dates from tile links, broken appointments on request', async () => {
  const r = await call(mod.port, 'GET', '/day?date=20261117&broken=1');
  assert.strictEqual(r.status, 200);
  sharedLook(r.text);
  assert.match(r.text, /value="2026-11-17"/);
  assert.match(r.text, /D. Fakely/);
  assert.match(r.text, /Schedule · Tue, Nov 17/);
  const bad = await call(mod.port, 'GET', '/day?date=not-a-date');
  assert.match(bad.text, /value="2026-11-16"/);
});

test('appointment book: chairs in Open Dental order, blocks link to the patient, x-ray tags', async () => {
  const r = await call(mod.port, 'GET', '/book?date=2026-11-16');
  assert.strictEqual(r.status, 200);
  sharedLook(r.text);
  const i1 = r.text.indexOf('>Op 1<'); const i2 = r.text.indexOf('>Op 2<'); const ih = r.text.indexOf('>Hyg 1<');
  assert.ok(i1 > 0 && i1 < i2 && i2 < ih, 'operatory order');
  assert.match(r.text, /href="\/m\/daysheet\/day\?date=2026-11-16&amp;apt=502"/);
  assert.match(r.text, /\+FMX/);
});

test('this week: only patients with insurance left and unscheduled treatment', async () => {
  const r = await call(mod.port, 'GET', '/week?date=2026-11-18');
  assert.strictEqual(r.status, 200);
  sharedLook(r.text);
  assert.match(r.text, /Week of Mon, Nov 16/);
  assert.match(r.text, /B. Sampleton/);
  assert.ok(!r.text.includes('C. Mockford'), 'no insurance max: not on the week list');
  assert.ok(!r.text.includes('A. Testerson'), 'no unscheduled treatment: not on the week list');
  assert.match(r.text, /\$932 ins left/);
});

test('Unscheduled: one row per patient, grouped by insurance, crown and buildup together', async () => {
  const r = await call(mod.port, 'GET', '/unscheduled');
  assert.strictEqual(r.status, 200);
  sharedLook(r.text);
  assert.strictEqual((r.text.match(/B\. Sampleton/g) || []).length, 1);
  assert.match(r.text, /Insurance left in 2026/);
  assert.match(r.text, /No insurance<\/span>/);
  assert.match(r.text, /Crown \+ buildup #19 \$1,500/);
  assert.match(r.text, /href="\/m\/finder\/"/);
});

test('patient page works without JavaScript', async () => {
  const r = await call(mod.port, 'GET', '/patient?patient=9005&from=unscheduled');
  assert.strictEqual(r.status, 200);
  sharedLook(r.text);
  assert.match(r.text, /E. Exampleby/);
  assert.match(r.text, /href="\/m\/daysheet\/unscheduled"/);
  assert.strictEqual((await call(mod.port, 'GET', '/patient?patient=abc')).status, 400);
});

test('nothing from Open Dental is written to disk', async () => {
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'data')));
});
