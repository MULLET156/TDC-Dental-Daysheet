'use strict';
// CONTRACT.md §3, §4, §5, §8 with a fake gateway.
const test = require('node:test');
const assert = require('node:assert');
const { startFakeGateway, startModule, call, close } = require('./helpers');

let gw; let mod;
test.before(async () => { gw = await startFakeGateway(); mod = await startModule({ gateway: gw }); });
test.after(async () => { await close(mod.app); await close(gw); });

test('/health answers without a signature', async () => {
  const r = await call(mod.port, 'GET', '/health', { sign: false });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(Object.keys(r.json).sort(), ['contract', 'ok', 'version']);
  assert.strictEqual(r.json.contract, 1);
});

test('unsigned, wrongly signed, old and future requests get 401', async () => {
  for (const p of ['/', '/manifest.json', '/tiles/today', '/unscheduled', '/static/daysheet.js']) {
    assert.strictEqual((await call(mod.port, 'GET', p, { sign: false })).status, 401, p);
  }
  assert.strictEqual((await call(mod.port, 'GET', '/', { time: Date.now() - 40000 })).status, 401);
  assert.strictEqual((await call(mod.port, 'GET', '/', { time: Date.now() + 40000 })).status, 401);
});

test('manifest follows §4', async () => {
  const r = await call(mod.port, 'GET', '/manifest.json', { user: 'dashboard', roles: 'system' });
  assert.strictEqual(r.status, 200);
  const m = r.json;
  assert.strictEqual(m.contract, 1);
  assert.strictEqual(m.id, 'daysheet');
  assert.strictEqual(m.icon, 'calendar');
  assert.deepStrictEqual(m.tiles.map((t) => t.id), ['today', 'lab-due']);
  for (const n of m.nav) assert.match(n.path, /^\/(?!\/)/);
});

test('tiles are JSON, at most 8 items, module-relative links, no HTML or dates that look like birthdates', async () => {
  for (const id of ['today', 'lab-due']) {
    const r = await call(mod.port, 'GET', `/tiles/${id}`, { roles: 'hygienist' });
    assert.strictEqual(r.status, 200, id);
    const t = r.json;
    assert.ok(['ok', 'warn', 'alert'].includes(t.status));
    assert.ok(Array.isArray(t.items) && t.items.length <= 8);
    for (const h of [t.link, ...t.items.map((i) => i.href)]) assert.match(h, /^\/(?!\/)/);
    assert.doesNotMatch(JSON.stringify(t), /<[a-z]/i);
    assert.doesNotMatch(JSON.stringify(t), /\b(19|20)\d{2}-\d{2}-\d{2}\b(?!T)/);
  }
});

test('today tile counts patients and flags the lab case that is not back', async () => {
  const t = (await call(mod.port, 'GET', '/tiles/today')).json;
  assert.strictEqual(t.value, '3 patients');
  assert.strictEqual(t.status, 'alert');
  assert.ok(t.items.some((i) => /Sampleton, B\. .*lab not back/.test(i.text)));
});

test('lab-due tile lists cases not back before their seat date, not the ones already back', async () => {
  const t = (await call(mod.port, 'GET', '/tiles/lab-due')).json;
  assert.strictEqual(t.value, '2 cases');
  assert.strictEqual(t.status, 'alert');
  assert.ok(!t.items.some((i) => /Dummer/.test(i.text)));
  assert.ok(t.items.every((i) => /^\/day\?date=\d{8}&apt=\d+$/.test(i.href)));
});

test('a role outside the manifest gets 403 on pages and tiles', async () => {
  assert.strictEqual((await call(mod.port, 'GET', '/', { roles: 'system' })).status, 403);
  assert.strictEqual((await call(mod.port, 'GET', '/tiles/today', { roles: 'system' })).status, 403);
});

test('read only: POST is refused', async () => {
  assert.strictEqual((await call(mod.port, 'POST', '/')).status, 405);
});

test('logs: one JSON line per request, no query strings, no patient names', async () => {
  await call(mod.port, 'GET', '/patient?patient=9002&apt=502&date=2026-11-16');
  const all = mod.logs.join('\n');
  assert.doesNotMatch(all, /Sampleton|Testerson|Mockford|patient=/);
  const line = JSON.parse(mod.logs.find((l) => l.includes('"/patient"')));
  assert.deepStrictEqual(Object.keys(line).sort(), ['method', 'ms', 'path', 'status', 'time', 'user']);
});
