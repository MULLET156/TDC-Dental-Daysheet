'use strict';
// The Daysheet module's web server (CONTRACT.md version 1).
//   GET /health            no signature (§8)
//   everything else        signed by the Dashboard (§3), else 401
//   /manifest.json         §4
//   /tiles/today, /tiles/lab-due   §5 (JSON only, under 3 seconds)
//   /, /day, /unscheduled, /patient   pages (§6 shared look)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { verifyTdcRequest, hasRole } = require('./tdc-verify');
const { officeToday, parseDate, compact, shortDate, clock, daysBetween } = require('./dates');
const { labState, shortName } = require('./data');
const { officeFromHeaders, isClinicDay } = require('./office');
const R = require('./render');

const VERSION = require('../package.json').version;
const ALL_ROLES = ['owner', 'admin', 'doctor', 'hygienist', 'assistant', 'front'];
const PAGE_ROLES = ALL_ROLES; // SITE-OUTLINE.md: every role sees the Daysheet
const TILE_MS = 2500; // answer tiles in under 3 s (§5), even if the gateway is slow

const MANIFEST = {
  contract: 1,
  id: 'daysheet',
  name: 'Dental Daysheet',
  version: VERSION,
  description: "Today's patients with unscheduled treatment, x-ray status and lab cases",
  icon: 'calendar',
  roles: PAGE_ROLES,
  nav: [
    { label: 'Today', path: '/' },
    { label: 'This week', path: '/week' },
    { label: 'Appointment book', path: '/book' },
    { label: 'Unscheduled treatment', path: '/unscheduled' },
  ],
  tiles: [
    { id: 'today', title: "Today's schedule", path: '/tiles/today', roles: ALL_ROLES, refreshSeconds: 120 },
    { id: 'lab-due', title: 'Lab cases due before seat', path: '/tiles/lab-due', roles: ALL_ROLES, refreshSeconds: 300 },
  ],
};

const STATIC = { '/static/daysheet.js': ['daysheet.js', 'text/javascript; charset=utf-8'] };

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');

function createApp({ secret, stage, data, log = (o) => console.log(JSON.stringify(o)), today: todayIn = (tz) => officeToday(new Date(), tz) }) {
  const today = todayIn;
  if (!secret || secret.length < 64) throw new Error('MODULE_SECRET must be at least 64 hex characters (32 random bytes).');
  const lastTile = new Map(); // tile id -> last good answer (counts and short labels only)

  // ---------- Tiles ----------

  async function tileToday(office) {
    const now = today(office.tz);
    const t = data.clinicDay(now, office);
    const d = await data.day(t);
    const live = d.rows.filter((r) => !r.broken);
    const upcoming = live.filter((r) => !r.complete);
    const items = (upcoming.length ? upcoming : live).slice(0, 8).map((r) => {
      const c = clock(r.appt.Time || r.appt.AptDateTime) || { text: '' };
      const procs = String(r.appt.Procedures || '').split(/,\s*/).filter(Boolean);
      const what = procs.slice(0, 3).join(', ') + (procs.length > 3 ? '…' : '');
      const flags = [r.labNotBack ? 'lab not back' : '', r.xrayAdd ? 'x-rays to add' : ''].filter(Boolean).join(', ');
      return { text: `${c.text} ${shortName(r.appt)}${what ? ' — ' + what : ''}${flags ? ' · ' + flags : ''}`, href: `/?apt=${r.appt.AptNum}` };
    });
    const isToday = t === now;
    return {
      title: isToday ? "Today's schedule" : `Next clinic day · ${shortDate(t, now)}`,
      value: `${d.counts.all} ${d.counts.all === 1 ? 'patient' : 'patients'}${d.production !== null ? ' · ' + R.money(d.production) : ''}`,
      status: d.counts.lab ? 'alert' : d.counts.xray ? 'warn' : 'ok',
      items,
      link: '/',
      updated: new Date().toISOString(),
    };
  }

  async function tileLabDue(office) {
    const t = today(office.tz);
    const cases = await data.labsBeforeSeat(t, 7);
    const shaped = cases.map((l) => ({ l, s: labState(l, t) }));
    const urgent = shaped.some(({ l, s }) => s.status === 'alert' || daysBetween(t, l.seat) <= 2);
    return {
      title: 'Lab cases due before seat',
      value: `${cases.length} ${cases.length === 1 ? 'case' : 'cases'}`,
      status: !cases.length ? 'ok' : urgent ? 'alert' : 'warn',
      items: shaped.slice(0, 8).map(({ l, s }) => ({
        text: `Seat ${shortDate(l.seat, t)} · ${shortName(l)} — ${s.label.toLowerCase()}${l.due ? ', due ' + shortDate(l.due, t) : ''}`,
        href: `/day?date=${compact(l.seat)}&apt=${l.aptNum}`,
      })),
      link: '/',
      updated: new Date().toISOString(),
    };
  }

  async function tile(res, id, build) {
    const g = await data.ready();
    if (!g.ok) return json(res, 200, { title: MANIFEST.tiles.find((x) => x.id === id).title, value: 'Paused', status: 'warn', items: [{ text: 'Open Dental gateway not available', href: '/' }], link: '/', updated: new Date().toISOString() });
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), TILE_MS); });
    try {
      const out = await Promise.race([build(), timeout]);
      if (out) { lastTile.set(id, out); return json(res, 200, out); }
      const prev = lastTile.get(id);
      return json(res, 200, prev || { title: MANIFEST.tiles.find((x) => x.id === id).title, value: 'Loading…', status: 'warn', items: [], link: '/', updated: new Date().toISOString() });
    } catch (e) {
      log({ time: new Date().toISOString(), event: 'tile_error', tile: id, code: e.code || 'error' });
      return json(res, 200, lastTile.get(id) || { title: MANIFEST.tiles.find((x) => x.id === id).title, value: 'Not available', status: 'warn', items: [], link: '/', updated: new Date().toISOString() });
    } finally { clearTimeout(timer); }
  }

  // ---------- Pages ----------

  async function guarded(res, who, current, fn) {
    const g = await data.ready();
    if (!g.ok) {
      return send(res, 503, R.problemPage({ base: who.base, title: 'Paused', current, heading: 'Open Dental is not available here right now', text: ' ' + g.reason }));
    }
    try { return await fn(); } catch (e) {
      log({ time: new Date().toISOString(), event: 'page_error', code: e.code || 'error', status: e.status || 0 });
      const msg = e.status === 403 ? ' This module\'s gateway key isn\'t allowed to read that. Ask the Connector agent to check the daysheet key.' : e.code === 'unreachable' ? ' The gateway did not answer.' : ' The gateway returned an error.';
      return send(res, 502, R.problemPage({ base: who.base, title: 'Error', current, heading: 'Could not load from Open Dental', text: msg }));
    }
  }

  async function handle(req, res, who) {
    const url = new URL(req.url, 'http://module');
    const p = url.pathname;
    const q = url.searchParams;
    const office = officeFromHeaders(req, data.fallbackOffice());
    const today = () => todayIn(office.tz);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'This module is read only.', 'text/plain; charset=utf-8');

    if (p === '/manifest.json') return json(res, 200, MANIFEST);

    if (STATIC[p]) {
      const [file, type] = STATIC[p];
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
      return res.end(fs.readFileSync(path.join(__dirname, '..', 'public', file)));
    }

    if (!hasRole(who, PAGE_ROLES)) {
      if (p.startsWith('/tiles/')) return json(res, 403, { error: 'Not allowed' });
      return send(res, 403, R.page({ base: who.base, title: 'Not allowed', current: '', body: '<div class="tdc-empty"><p>Not allowed</p>Your role can\'t open the Daysheet. Ask the office manager.</div>' }));
    }

    if (p === '/tiles/today') return tile(res, 'today', () => tileToday(office));
    if (p === '/tiles/lab-due') return tile(res, 'lab-due', () => tileLabDue(office));

    const settings = data.settings;
    const closedNote = (date) => (isClinicDay(office, date) ? '' : office.closed.has(date) ? 'closed' : 'noclinic');
    if (p === '/' || p === '/day') {
      const t = today();
      const isHome = p === '/';
      const date = isHome ? data.clinicDay(t, office) : parseDate(q.get('date')) || t;
      const current = isHome ? 'today' : 'day';
      return guarded(res, who, current, async () => {
        const showBroken = q.get('broken') === '1';
        const d = await data.day(date, { includeBroken: showBroken });
        return send(res, 200, R.dayPage(d, { base: who.base, today: t, current, showBroken, settings, isHome, closed: closedNote(date) }));
      });
    }

    if (p === '/book') {
      const t = today();
      const date = parseDate(q.get('date')) || data.clinicDay(t, office);
      return guarded(res, who, 'book', async () => {
        const [d, ops] = await Promise.all([data.day(date), data.operatories()]);
        return send(res, 200, R.bookPage(d, ops, { base: who.base, today: t }));
      });
    }

    if (p === '/week') {
      const t = today();
      const date = parseDate(q.get('date')) || data.clinicDay(t, office);
      return guarded(res, who, 'week', async () => send(res, 200, R.weekPage(await data.week(date, office), { base: who.base, today: t, settings })));
    }

    if (p === '/unscheduled') {
      return guarded(res, who, 'unscheduled', async () => send(res, 200, R.unscheduledPage(await data.unscheduled(), { base: who.base, today: today(), settings })));
    }

    if (p === '/patient') {
      const patNum = Number(q.get('patient'));
      if (!Number.isSafeInteger(patNum) || patNum <= 0) return send(res, 400, R.page({ base: who.base, title: 'Not found', current: '', body: '<div class="tdc-empty"><p>No patient chosen</p>Open a patient from Today or Unscheduled.</div>' }));
      const aptNum = Number(q.get('apt')) || null;
      const date = parseDate(q.get('date'));
      return guarded(res, who, '', async () => {
        const t = today();
        let panel = null;
        if (aptNum && date) {
          const d = await data.day(date);
          const row = d.rows.find((r) => r.appt.AptNum === aptNum && r.appt.PatNum === patNum);
          panel = row ? row.panel : null;
        }
        if (!panel) panel = await data.patient(patNum, { today: t, aptNum });
        if (q.get('fragment') === '1') return send(res, 200, R.renderPanel(panel, { today: t, settings, showFinder: true }));
        const from = q.get('from');
        const back = `${who.base}${from === 'unscheduled' ? '/unscheduled' : from === 'week' ? '/week' : date && date !== t ? `/day?date=${date}` : '/'}`;
        return send(res, 200, R.patientPage(panel, { base: who.base, today: t, back, settings }));
      });
    }

    return send(res, 404, R.page({ base: who.base, title: 'Not found', current: '', body: '<div class="tdc-empty"><p>Page not found</p>Use the buttons above.</div>' }));
  }

  return http.createServer((req, res) => {
    const start = Date.now();
    let user = '-';
    res.on('finish', () => {
      // CONTRACT §8: one JSON line per request. Path only: no query string (it can hold a PatNum), no bodies.
      log({ time: new Date().toISOString(), user, method: req.method, path: req.url.split('?')[0], status: res.statusCode, ms: Date.now() - start });
    });

    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { ok: true, version: VERSION, contract: 1 });
    }
    const who = verifyTdcRequest(secret, req);
    if (!who) { req.resume(); return send(res, 401, 'Unauthorized', 'text/plain; charset=utf-8'); }
    user = who.user;
    req.resume(); // read only: ignore any body
    handle(req, res, who).catch((err) => {
      if (!res.headersSent) send(res, 500, 'Error', 'text/plain; charset=utf-8'); else res.destroy();
      log({ time: new Date().toISOString(), event: 'error', code: (err && err.code) || 'error' });
    });
    return undefined;
  });
}

module.exports = { createApp, MANIFEST, VERSION };
