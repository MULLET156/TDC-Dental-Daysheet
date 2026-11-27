'use strict';
// Everything the Daysheet reads from Open Dental, through the gateway only
// (CONTRACT §7), with the shared core/ code. Read only.
//
// Open Dental data stays in memory, briefly (CONTRACT §1): a small cache of
// report answers for CACHE_MS, never written to disk, cleared when the stage
// check fails.
//
// Reports used (opendental-claude docs/tdc-office.md):
//   daysheet               one day's appointments
//   xray_history           BWX / FMX / PANO, last date, plan limit, next covered
//   unscheduled_treatment  planned procedures not on a future appointment (hygiene left out by the gateway)
//   lab_cases_open         open lab cases with their seat appointment

const { createClient } = require('../vendor/opendental-core/odclient');
const { checkStage } = require('../vendor/opendental-core/gateway-client');
const { runReport } = require('../vendor/opendental-core/reports');
const { odDate, daysBetween, addDays } = require('./dates');

const CACHE_MS = 60 * 1000;
const STAGE_EVERY_MS = 5 * 60 * 1000;
const CACHE_MAX = 300;

function createData({ gatewayUrl, gatewayKey, stage, client, now = () => Date.now(), log = () => {} }) {
  const od = client || createClient({ gatewayUrl: gatewayUrl || 'http://127.0.0.1:8787', gatewayKey, timeoutMs: 20000 });
  const cache = new Map();
  // ok: patient pages may be served. reason: why not (shown to staff, no secrets).
  const guard = { ok: false, reason: 'Not checked yet', checkedAt: 0, gateway: null };
  let checking = null;

  async function checkNow() {
    if (checking) return checking;
    checking = (async () => {
      try {
        const h = await checkStage(od, stage);
        guard.ok = true; guard.reason = ''; guard.gateway = { version: h.version, stage: h.stage, fake: h.fake === true };
      } catch (e) {
        guard.ok = false;
        guard.reason = e && e.code === 'unreachable' ? 'The Open Dental gateway is not responding.' : String((e && e.message) || 'Stage check failed');
        guard.gateway = null;
        cache.clear(); // never keep data from a gateway we no longer trust
        log({ event: 'stage_check_failed', code: (e && e.code) || 'error' });
      } finally {
        guard.checkedAt = now();
        checking = null;
      }
      return guard;
    })();
    return checking;
  }

  /** Make sure the stage check is no older than 5 minutes; returns the guard. */
  async function ready() {
    if (!guard.checkedAt || now() - guard.checkedAt > STAGE_EVERY_MS || (!guard.ok && now() - guard.checkedAt > 30 * 1000)) await checkNow();
    return guard;
  }

  function cached(name, params) {
    const key = name + ' ' + JSON.stringify(params);
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) return hit.value;
    const value = runReport(od, name, params).then((r) => r.rows);
    value.catch(() => cache.delete(key));
    if (cache.size >= CACHE_MAX) for (const [k, v] of cache) if (now() - v.at >= CACHE_MS || cache.size >= CACHE_MAX) cache.delete(k);
    cache.set(key, { at: now(), value });
    return value;
  }

  const labCases = () => cached('lab_cases_open', { days_ahead: 14 });

  /** One day's schedule with everything the rows, tiles and patient panels need. */
  async function day(date, { includeBroken = false } = {}) {
    const [appts, xrays, labs] = await Promise.all([
      cached('daysheet', { date, ...(includeBroken ? { include_broken: 'true' } : {}) }),
      cached('xray_history', { date }),
      labCases(),
    ]);
    const pats = [...new Set(appts.map((a) => a.PatNum))];
    const unsched = pats.length ? await cached('unscheduled_treatment', { patients: pats.slice(0, 500) }) : [];
    return assembleDay(date, appts, xrays, labs, unsched);
  }

  /** One patient (Unscheduled page panel). aptNum optional. */
  async function patient(patNum, { today, aptNum } = {}) {
    const [unsched, xrays, labs] = await Promise.all([
      cached('unscheduled_treatment', { patients: [patNum] }),
      cached('xray_history', { patients: [patNum] }),
      labCases(),
    ]);
    const anyRow = unsched[0] || xrays[0] || labs.find((l) => l.PatNum === patNum) || null;
    return buildPanel({
      patNum,
      name: anyRow ? { LName: anyRow.LName, FName: anyRow.FName } : null,
      appt: null,
      aptNum: aptNum || null,
      unsched: unsched.filter((r) => r.PatNum === patNum),
      xrays: xrays.filter((r) => r.PatNum === patNum),
      labs: labs.filter((l) => l.PatNum === patNum),
      today,
    });
  }

  /** Every patient with planned, unscheduled treatment, one entry per patient. */
  async function unscheduled() {
    const rows = await cached('unscheduled_treatment', { limit: 5000 });
    const by = new Map();
    for (const r of rows) {
      let p = by.get(r.PatNum);
      if (!p) { p = { PatNum: r.PatNum, LName: r.LName, FName: r.FName, total: 0, count: 0, oldest: null }; by.set(r.PatNum, p); }
      p.count += 1;
      p.total = Math.round((p.total + Number(r.Fee || 0)) * 100) / 100;
      const d = odDate(r.DateTP);
      if (d && (!p.oldest || d < p.oldest)) p.oldest = d;
    }
    return { patients: [...by.values()], truncated: rows.length >= 5000 };
  }

  /** Lab cases not back yet whose seat appointment is within `days` days. */
  async function labsBeforeSeat(today, days = 7) {
    const labs = await labCases();
    const until = addDays(today, days);
    return labs
      .map(normLab)
      .filter((l) => l.seat && l.seat >= today && l.seat <= until && l.status !== 'received_not_checked' && l.aptStatus === 1)
      .sort((a, b) => (a.seatAt < b.seatAt ? -1 : 1));
  }

  return { od, guard, checkNow, ready, day, patient, unscheduled, labsBeforeSeat, _cache: cache };
}

// ---------- Shaping the report rows (pure functions, tested with fake data) ----------

function normLab(l) {
  const seatAt = String(l.SeatAppt || '');
  return {
    id: l.LabCaseNum,
    patNum: l.PatNum,
    LName: l.LName,
    FName: l.FName,
    lab: l.Lab || 'Lab',
    aptNum: l.AptNum || 0,
    aptStatus: Number(l.AptStatus || 0),
    seat: odDate(seatAt),
    seatAt,
    sent: odDate(l.DateTimeSent),
    due: odDate(l.DateTimeDue),
    received: odDate(l.DateTimeRecd),
    status: l.Status,
    overdue: Number(l.Overdue) === 1 || l.Overdue === true,
    instructions: String(l.Instructions || '').slice(0, 120),
  };
}

/** "back" = at the office already (received, waiting to be checked). */
function labState(l, today) {
  if (l.status === 'received_not_checked') return { status: 'ok', label: 'Back, not checked yet' };
  if (l.overdue) return { status: 'alert', label: 'Late at the lab' };
  if (l.seat && l.due && l.due > l.seat) return { status: 'alert', label: 'Due after the seat date' };
  if (l.status === 'not_sent') return { status: l.seat && daysBetween(today, l.seat) <= 2 ? 'alert' : 'warn', label: 'Not sent yet' };
  return { status: 'info', label: 'At the lab' };
}

const XRAY_ORDER = { BWX: 0, FMX: 1, PANO: 2 };
const XRAY_NAME = { BWX: 'BWX', FMX: 'FMX', PANO: 'Pano' };

/**
 * One x-ray category, coloured as SITE-OUTLINE asks:
 *   alert "Overdue"      covered since before today and not taken
 *   warn  "Due today"    becomes covered today
 *   new   "Not covered"  next covered later
 *   info  "No limit"     no frequency limit on file
 */
function xrayState(x, today) {
  const next = odDate(x.NextCovered);
  const covered = x.CoveredNow === true || x.CoveredNow === 1;
  if (x.CoveredNow === null || x.CoveredNow === undefined || !next) return { status: 'info', label: 'No limit on file', coveredToday: null, next: null };
  if (covered && next < today) return { status: 'alert', label: 'Overdue', coveredToday: true, next };
  if (covered) return { status: 'warn', label: 'Due today', coveredToday: true, next };
  return { status: 'new', label: 'Not covered yet', coveredToday: false, next };
}

function buildPanel({ patNum, name, appt, aptNum, unsched, xrays, labs, today }) {
  const planned = unsched
    .map((r) => ({ procNum: r.ProcNum, code: r.ProcCode, descript: r.Descript, tooth: r.ToothNum || '', surf: r.Surf || '', fee: Number(r.Fee || 0), dateTP: odDate(r.DateTP), priority: r.Priority || '' }))
    .sort((a, b) => (a.priority === b.priority ? String(a.dateTP).localeCompare(String(b.dateTP)) : a.priority ? -1 : 1));
  const total = Math.round(planned.reduce((s, p) => s + p.fee, 0) * 100) / 100;
  const xr = xrays
    .map((x) => ({ category: x.Category, name: XRAY_NAME[x.Category] || x.Category, last: odDate(x.LastDate), limit: x.Limit || '', ...xrayState(x, today) }))
    .sort((a, b) => (XRAY_ORDER[a.category] ?? 9) - (XRAY_ORDER[b.category] ?? 9));
  const allLabs = labs.map(normLab).map((l) => ({ ...l, ...labState(l, today) }));
  const apt = aptNum || (appt && appt.AptNum) || null;
  return {
    patNum,
    name,
    appt,
    planned,
    total,
    xrays: xr,
    xrayDue: xr.some((x) => x.coveredToday === true),
    labsHere: apt ? allLabs.filter((l) => l.aptNum === apt) : [],
    labsOther: apt ? allLabs.filter((l) => l.aptNum !== apt) : allLabs,
  };
}

function assembleDay(date, appts, xrays, labs, unsched) {
  const rows = appts.map((a) => {
    const panel = buildPanel({
      patNum: a.PatNum,
      name: { LName: a.LName, FName: a.FName, Preferred: a.Preferred },
      appt: a,
      unsched: unsched.filter((r) => r.PatNum === a.PatNum),
      xrays: xrays.filter((r) => r.PatNum === a.PatNum),
      labs: labs.filter((l) => l.PatNum === a.PatNum),
      today: date,
    });
    const labNotBack = panel.labsHere.some((l) => l.status !== 'ok');
    const complete = a.Status === 'Complete';
    const broken = a.Status === 'Broken';
    // Row stripe (DESIGN.md §5): red lab not back, amber planned work waiting, green done, grey otherwise.
    const status = broken ? 'new' : labNotBack ? 'alert' : complete ? 'ok' : panel.planned.length ? 'warn' : 'new';
    return { appt: a, panel, labNotBack, complete, broken, status };
  });
  rows.sort((x, y) => String(x.appt.AptDateTime).localeCompare(String(y.appt.AptDateTime)) || String(x.appt.OpName).localeCompare(String(y.appt.OpName)));
  const live = rows.filter((r) => !r.broken);
  return {
    date,
    rows,
    counts: {
      all: live.length,
      lab: live.filter((r) => r.labNotBack).length,
      planned: live.filter((r) => r.panel.planned.length).length,
      xray: live.filter((r) => r.panel.xrayDue).length,
      done: live.filter((r) => r.complete).length,
    },
    plannedTotal: Math.round(live.reduce((s, r) => s + r.panel.total, 0) * 100) / 100,
  };
}

module.exports = { createData, assembleDay, buildPanel, xrayState, labState, normLab };
