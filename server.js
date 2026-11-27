'use strict';
// Dental Daysheet — starts the module.
//   npm start   (or double-click start.cmd on Windows)
// Settings come from .env next to this file; settings already set in the real
// environment (Hostinger's panel) win. See .env.example and README.md.

const path = require('node:path');
const { loadEnv } = require('./lib/env');
const { createApp, VERSION } = require('./lib/app');
const { createData } = require('./lib/data');

loadEnv(path.join(__dirname, '.env'));
const env = process.env;

const stage = String(env.TDC_STAGE || '').trim().toLowerCase();
if (stage !== 'design' && stage !== 'live') {
  console.error('Cannot start: TDC_STAGE must be "design" or "live". Copy .env.example to .env and fill it in.');
  process.exit(1);
}
const port = Number(env.PORT || 3101);
// CONTRACT §1: in the live stage the module listens on 127.0.0.1 only. In the
// design stage Hostinger may need HOST=0.0.0.0 to reach it.
const host = stage === 'live' ? '127.0.0.1' : env.HOST || '127.0.0.1';
const log = (o) => console.log(JSON.stringify(o));

let app; let data;
try {
  data = createData({ gatewayUrl: env.GATEWAY_URL || 'http://127.0.0.1:8787', gatewayKey: env.GATEWAY_KEY, stage, log });
  app = createApp({ secret: env.MODULE_SECRET, stage, data, log });
} catch (err) {
  console.error(`Cannot start: ${err.message}\nCheck .env: MODULE_SECRET comes from Dashboard → Settings → Modules; GATEWAY_URL and GATEWAY_KEY from the gateway.`);
  process.exit(1);
}

// CONTRACT §1: check the gateway's stage at startup and every 5 minutes. If it
// doesn't match TDC_STAGE (or can't be reached), patient pages stop and show
// "Paused"; /health keeps answering so the host doesn't restart-loop.
data.checkNow().then((g) => {
  if (g.ok) log({ time: new Date().toISOString(), event: 'stage_ok', stage, gateway_version: g.gateway.version, fake: g.gateway.fake });
  else console.error(`Gateway check failed: ${g.reason} Patient pages are paused until it passes (checked again every 5 minutes).`);
});
setInterval(() => data.checkNow(), 5 * 60 * 1000).unref();

app.listen(port, host, () => {
  console.log(`Dental Daysheet ${VERSION} (${stage} stage) listening on http://${host}:${port}/`);
});
