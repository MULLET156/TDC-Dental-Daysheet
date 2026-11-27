'use strict';
// CONTRACT §1: the gateway's stage must match TDC_STAGE, or patient pages stop.
const test = require('node:test');
const assert = require('node:assert');
const { startFakeGateway, startModule, call, close } = require('./helpers');

test('a design module refuses patient pages when the gateway says live', async () => {
  const gw = await startFakeGateway({ stage: 'live', fake: false });
  const mod = await startModule({ gateway: gw });
  try {
    const r = await call(mod.port, 'GET', '/');
    assert.strictEqual(r.status, 503);
    assert.match(r.text, /Refusing to serve patient pages/);
    assert.ok(!r.text.includes('Testerson'));
    assert.strictEqual(gw.calls.length, 0, 'no report was asked for');
    const t = await call(mod.port, 'GET', '/tiles/today');
    assert.strictEqual(t.json.value, 'Paused');
    assert.strictEqual((await call(mod.port, 'GET', '/health', { sign: false })).status, 200, '/health keeps working');
  } finally { await close(mod.app); await close(gw); }
});

test('pages pause when the gateway changes to live, and the cache is dropped', async () => {
  const gw = await startFakeGateway();
  const mod = await startModule({ gateway: gw });
  try {
    assert.strictEqual((await call(mod.port, 'GET', '/')).status, 200);
    assert.ok(mod.data._cache.size > 0);
    gw.stage = 'live';
    await mod.data.checkNow();
    assert.strictEqual(mod.data._cache.size, 0);
    assert.strictEqual((await call(mod.port, 'GET', '/')).status, 503);
  } finally { await close(mod.app); await close(gw); }
});

test('an unreachable gateway shows a plain message, not an error dump', async () => {
  const mod = await startModule({ gatewayUrl: 'http://127.0.0.1:9' });
  try {
    const r = await call(mod.port, 'GET', '/unscheduled');
    assert.strictEqual(r.status, 503);
    assert.match(r.text, /gateway is not responding/);
  } finally { await close(mod.app); }
});

test('a live module refuses a design (demo) gateway', async () => {
  const gw = await startFakeGateway();
  const mod = await startModule({ gateway: gw, stage: 'live' });
  try { assert.strictEqual((await call(mod.port, 'GET', '/')).status, 503); } finally { await close(mod.app); await close(gw); }
});
