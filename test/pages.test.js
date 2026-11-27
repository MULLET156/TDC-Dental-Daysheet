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
}

test('Today shows every appointment with tiles, rows and a panel for each', async () => {
  const r = await call(mod.port, 'GET', '/');
  assert.strictEqual(r.status, 200);
  sharedLook(r.text);
  for (const n of ['Testerson, Alex', 'Sampleton, Bea (B)', 'Mockford, Cy']) assert.ok(r.text.includes(n), n);
  assert.match(r.text, /class="tdc-stats"/);
  assert.match(r.text, /class="tdc-pagehead"/);
  assert.match(r.text, /<template id="ds-p-502">/);
  assert.match(r.text, /data-f-lab="1"/);
  assert.match(r.text, /Late at the lab/);
  assert.match(r.text, /\$1,520/);
  assert.ok(!r.text.includes('Fakely'), 'broken appointments hidden by default');
});

test('the panel shows planned work, x-ray limits with next-covered dates, and the lab case for the visit', async () => {
  const r = await call(mod.port, 'GET', '/patient?patient=9002&apt=502&date=2026-11-16&fragment=1');
  assert.strictEqual(r.status, 200);
  assert.match(r.text, /D2950/);
  assert.match(r.text, /D2740/);
  assert.match(r.text, /No limit on file/);
  assert.match(r.text, /Lab cases for this visit/);
  assert.match(r.text, /Pretend Lab/);
  const a = await call(mod.port, 'GET', '/patient?patient=9001&apt=501&date=2026-11-16&fragment=1');
  assert.match(a.text, /Overdue/);
  assert.match(a.text, /Not covered yet/);
  assert.match(a.text, /Nothing waiting/);
});

test('hygiene is left to the gateway: the module never asks to include it', async () => {
  for (const c of gw.calls.filter((x) => x.report === 'unscheduled_treatment')) assert.ok(!('include_hygiene' in c.params));
  const asked = new Set(gw.calls.map((c) => c.report));
  for (const r of asked) assert.ok(['daysheet', 'xray_history', 'unscheduled_treatment', 'lab_cases_open'].includes(r), r);
});

test('any day: date picker, compact dates from tile links, and broken appointments on request', async () => {
  const r = await call(mod.port, 'GET', '/day?date=20261117&broken=1');
  assert.strictEqual(r.status, 200);
  sharedLook(r.text);
  assert.match(r.text, /value="2026-11-17"/);
  assert.match(r.text, /Fakely, Dee/);
  assert.match(r.text, /Schedule · Tue, Nov 17/);
  const bad = await call(mod.port, 'GET', '/day?date=not-a-date');
  assert.strictEqual(bad.status, 200);
  assert.match(bad.text, /value="2026-11-16"/);
});

test('Unscheduled lists each patient once with a total and the oldest plan date', async () => {
  const r = await call(mod.port, 'GET', '/unscheduled');
  assert.strictEqual(r.status, 200);
  sharedLook(r.text);
  assert.strictEqual((r.text.match(/Sampleton, Bea/g) || []).length, 1);
  assert.match(r.text, /2 procedures/);
  assert.match(r.text, /Planned over a year ago/);
  assert.match(r.text, /href="\/m\/finder\/"/);
});

test('patient page works without JavaScript', async () => {
  const r = await call(mod.port, 'GET', '/patient?patient=9005&from=unscheduled');
  assert.strictEqual(r.status, 200);
  sharedLook(r.text);
  assert.match(r.text, /Exampleby, Eli/);
  assert.match(r.text, /href="\/m\/daysheet\/unscheduled"/);
  assert.strictEqual((await call(mod.port, 'GET', '/patient?patient=abc')).status, 400);
});

test('names are escaped', async () => {
  const { esc } = require('../lib/render');
  assert.strictEqual(esc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});

test('nothing from Open Dental is written to disk', async () => {
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'data')));
});
