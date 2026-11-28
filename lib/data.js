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
//   xray_history           BWX / FMX / PANO dates, plan limit, next covered
//   unscheduled_treatment  planned procedures not on a scheduled appointment (hygiene left out by the gateway)
//   insurance_remaining    primary plan: carrier, annual max, used, left (estimate)
//   lab_cases_open         open lab cases with their seat appointment
//   operatories            chairs in Open Dental's order (appointment book)
//   daysheet_goals         provider goals for the day (requested; optional until released)

const { createClient } = require('../vendor/opendental-core/odclient');
const { checkStage } = require('../vendor/opendental-core/gateway-client');
const { runReport } = require('../vendor/opendental-core/reports');
const { odDate, daysBetween, addDays, addMonths } = require('./dates');

const CACHE_MS = 60 * 1000;
const STAGE_EVERY_MS = 5 * 60 * 1000;
const CACHE_MAX = 400;

/** Settings that differ between practices (README "Settings"). */
function settingsFrom(env = process.env) {
  const days = String(env.CLINIC_DAYS || '1,2,3,4,5').split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return {
    clinicDays: days.length ? days : [1, 2, 3, 4, 5],
    fmxMonths: Math.max(1, Number(env.XRAY_FMX_MONTHS) || 60),
    bwxMonths: Math.max(1, Number(env.XRAY_BWX_MONTHS) || 12),
    lowInsurance: Number(env.INSURANCE_LOW) || 500,
  };
}

function createData({ gatewayUrl, gatewayKey, stage, client, now = () => Date.now(), log = () => {}, settings = settingsFrom() }) {
  const od = client || createClient({ gatewayUrl: gatewayUrl || 'http://127.0.0.1:8787', gatewayKey, timeoutMs: 20000 });
  const cache = new Map();
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

  async function ready() {
    if (!guard.checkedAt || now() - guard.checkedAt > STAGE_EVERY_MS || (!guard.ok && now() - guard.checkedAt > 30 * 1000)) await checkNow();
    return guard;
  }

  function prune() {
    for (const [k, v] of cache) if (now() - v.at >= CACHE_MS) cache.delete(k);
    while (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  }

  /** optional: a report the gateway doesn't have yet (or this key can't use) answers null instead of failing the page. */
  function cached(name, params, { optional = false } = {}) {
    const key = name + ' ' + JSON.stringify(params);
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) return hit.value;
    let value;
    try {
      value = runReport(od, name, params).then((r) => r.rows);
    } catch (e) {
      value = Promise.reject(e); // unknown report name in this core version
    }
    if (optional) value = value.catch((e) => { if (e && (e.status === 403 || e.status === 404 || e.status === 400 || e.code === 'not_found')) return null; throw e; });
    value.catch(() => cache.delete(key));
    prune();
    cache.set(key, { at: now(), value });
    return value;
  }

  const labCases = () => cached('lab_cases_open', { days_ahead: 14 });
  const operatories = () => cached('operatories', {}, { optional: true });

  /** Run a report that takes a patient list, 500 at a time. */
  async function byPatients(name, pats, extra = {}) {
    const out = [];
    for (let i = 0; i < pats.length; i += 500) out.push(cached(name, { ...extra, patients: pats.slice(i, i + 500) }));
    return (await Promise.all(out)).flat();
  }

  /** One day's schedule with everything the rows, tiles, goal cards and panels need. */
  async function day(date, { includeBroken = false } = {}) {
    const [appts, xrays, labs, goals] = await Promise.all([
      cached('daysheet', { date, ...(includeBroken ? { include_broken: 'true' } : {}) }),
      cached('xray_history', { date }),
      labCases(),
      cached('daysheet_goals', { date }, { optional: true }),
    ]);
    const pats = [...new Set(appts.map((a) => a.PatNum))];
    const [unsched, ins] = pats.length
      ? await Promise.all([byPatients('unscheduled_treatment', pats, { min_fee: 0.01 }), byPatients('insurance_remaining', pats)])
      : [[], []];
    return assembleDay(date, appts, xrays, labs, unsched, ins, goals, settings);
  }

  /** One patient (panel opened from Unscheduled or This week). */
  async function patient(patNum, { today, aptNum } = {}) {
    const [unsched, xrays, labs, ins] = await Promise.all([
      cached('unscheduled_treatment', { patients: [patNum], min_fee: 0.01 }),
      cached('xray_history', { patients: [patNum] }),
      labCases(),
      cached('insurance_remaining', { patients: [patNum] }),
    ]);
    const anyRow = unsched[0] || xrays[0] || ins[0] || labs.find((l) => l.PatNum === patNum) || null;
    return buildPanel({
      patNum,
      name: anyRow ? { LName: anyRow.LName, FName: anyRow.FName } : null,
      appt: null,
      aptNum: aptNum || null,
      unsched: unsched.filter((r) => r.PatNum === patNum),
      xrays: xrays.filter((r) => r.PatNum === patNum),
      labs: labs.filter((l) => l.PatNum === patNum),
      ins: ins.find((r) => r.PatNum === patNum) || null,
      today,
      settings,
    });
  }

  /** Every patient with planned, unscheduled treatment, one entry per patient, with insurance left. */
  async function unscheduled() {
    const rows = await cached('unscheduled_treatment', { limit: 5000, min_fee: 0.01 });
    const by = new Map();
    for (const r of rows) {
      let p = by.get(r.PatNum);
      if (!p) { p = { PatNum: r.PatNum, LName: r.LName, FName: r.FName, rows: [], oldest: null }; by.set(r.PatNum, p); }
      p.rows.push(r);
      const d = odDate(r.DateTP);
      if (d && (!p.oldest || d < p.oldest)) p.oldest = d;
    }
    const pats = [...by.keys()];
    const ins = pats.length ? await byPatients('insurance_remaining', pats) : [];
    const insBy = new Map(ins.map((r) => [r.PatNum, insurance(r)]));
    const patients = [...by.values()].map((p) => {
      const items = groupTreatment(p.rows);
      return { PatNum: p.PatNum, LName: p.LName, FName: p.FName, oldest: p.oldest, items, count: p.rows.length, total: sum(items.map((i) => i.fee)), ins: insBy.get(p.PatNum) || insurance(null) };
    });
    return { patients, truncated: rows.length >= 5000 };
  }

  /** This week: clinic days of the week holding `date`; patients with insurance left and unscheduled treatment. */
  async function week(date) {
    const monday = addDays(date, -((dow(date) + 6) % 7));
    const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i)).filter((d) => settings.clinicDays.includes(dow(d)));
    const days = await Promise.all(dates.map((d) => cached('daysheet', { date: d }).then((appts) => ({ date: d, appts }))));
    const pats = [...new Set(days.flatMap((d) => d.appts.map((a) => a.PatNum)))];
    const [unsched, ins] = pats.length
      ? await Promise.all([byPatients('unscheduled_treatment', pats, { min_fee: 0.01 }), byPatients('insurance_remaining', pats)])
      : [[], []];
    const insBy = new Map(ins.map((r) => [r.PatNum, insurance(r)]));
    const out = days.map(({ date: d, appts }) => {
      const rows = appts
        .filter((a) => a.Status !== 'Broken')
        .map((a) => {
          const items = groupTreatment(unsched.filter((r) => r.PatNum === a.PatNum));
          return { appt: a, items, total: sum(items.map((i) => i.fee)), ins: insBy.get(a.PatNum) || insurance(null) };
        })
        .filter((r) => r.items.length && r.ins.left !== null && r.ins.left > 0)
        .sort((x, y) => String(x.appt.AptDateTime).localeCompare(String(y.appt.AptDateTime)));
      return { date: d, rows, total: sum(rows.map((r) => r.total)) };
    });
    return { monday, days: out, count: out.reduce((n, d) => n + d.rows.length, 0), total: sum(out.map((d) => d.total)) };
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

  /** Today, or the next clinic day when today isn't one (CLINIC_DAYS). */
  function clinicDay(today) {
    let d = today;
    for (let i = 0; i < 7 && !settings.clinicDays.includes(dow(d)); i++) d = addDays(d, 1);
    return d;
  }

  return { od, guard, settings, checkNow, ready, day, patient, unscheduled, week, labsBeforeSeat, operatories, clinicDay, _cache: cache };
}

// ---------- Shaping the report rows (pure functions, tested with fake data) ----------

const sum = (xs) => Math.round(xs.reduce((s, x) => s + Number(x || 0), 0) * 100) / 100;
function dow(d) { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); }

/** "Battles, Kim" -> "K. Battles". Names on screens patients may glimpse stay short. */
function shortName(n) {
  if (!n) return 'Patient';
  const f = String(n.FName || '').trim();
  return `${f ? f[0].toUpperCase() + '. ' : ''}${String(n.LName || '').trim()}`.trim() || 'Patient';
}

function insurance(r) {
  if (!r) return { carrier: null, max: null, used: null, left: null, none: true };
  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  return { carrier: r.Carrier || null, max: num(r.AnnualMax), used: num(r.Used), left: num(r.Remaining), none: false, yearStart: odDate(r.BenefitYearStart) };
}

// Procedures that belong together are shown as one item (fees add up).
const CROWN = /^D27[1-9]\d$/;
const BUILDUP = { D2950: 'buildup', D2952: 'post & core', D2954: 'post & core' };
const ABUTMENT = /^D605[67]$/;
const IMPLANT_CROWN = /^D60(5[89]|6[0-7])$/;

function prioRank(p) { const n = Number(p); return p === '' || p === null || p === undefined ? 1e9 : Number.isFinite(n) ? n : 1e8; }
function lowerPrio(a, b) { return prioRank(a) <= prioRank(b) ? a : b; }

/**
 * Unscheduled procedure rows -> display items, grouped:
 *   crown (D27xx) + D2950 on the same tooth -> "Crown + buildup #n" (D2952/D2954 -> "Crown + post & core #n")
 *   implant crown (D6058-D6067) + abutment (D6056/D6057) on the same tooth -> "Custom abutment + crown #n"
 * Sorted by priority (lower number first, none last), then fee (highest first).
 */
function groupTreatment(rows) {
  const items = rows.map((r) => ({
    codes: [r.ProcCode], label: r.Descript || r.ProcCode, tooth: r.ToothNum || '', surf: r.Surf || '',
    fee: Number(r.Fee || 0), priority: r.Priority || '', dateTP: odDate(r.DateTP), procNums: [r.ProcNum],
  }));
  const used = new Set();
  const out = [];
  const pair = (isA, isB, label) => {
    items.forEach((a, i) => {
      if (used.has(i) || !isA(a.codes[0]) || !a.tooth) return;
      const j = items.findIndex((b, k) => k !== i && !used.has(k) && b.tooth === a.tooth && isB(b.codes[0]));
      if (j < 0) return;
      const b = items[j];
      used.add(i); used.add(j);
      out.push({
        codes: [a.codes[0], b.codes[0]], label: label(a, b), tooth: a.tooth, surf: '', fee: Math.round((a.fee + b.fee) * 100) / 100,
        priority: lowerPrio(a.priority, b.priority), dateTP: [a.dateTP, b.dateTP].filter(Boolean).sort()[0] || null, procNums: [...a.procNums, ...b.procNums], grouped: true,
      });
    });
  };
  pair((c) => CROWN.test(c), (c) => !!BUILDUP[c], (a, b) => `Crown + ${BUILDUP[b.codes[0]]} #${a.tooth}`);
  pair((c) => IMPLANT_CROWN.test(c), (c) => ABUTMENT.test(c), (a) => `Custom abutment + crown #${a.tooth}`);
  items.forEach((it, i) => { if (!used.has(i)) out.push(it); });
  return out.sort((a, b) => prioRank(a.priority) - prioRank(b.priority) || b.fee - a.fee);
}

/**
 * X-rays to take at the visit (clinical intervals; settings XRAY_FMX_MONTHS / XRAY_BWX_MONTHS):
 *   FMX due: no D0210 in the last 5 years (or never).
 *   BWX due: no bitewing in the last 12 months and no FMX in that time.
 * "add" when due and not on the appointment; "onappt" when the appointment already has it.
 */
function xrayDue(xrays, procedures, date, settings) {
  const last = (cat) => { const x = xrays.find((r) => r.Category === cat); return x ? odDate(x.LastDate) : null; };
  const fmx = last('FMX');
  const bwx = last('BWX');
  const fmxCut = addMonths(date, -settings.fmxMonths);
  const bwxCut = addMonths(date, -settings.bwxMonths);
  const has = (re) => re.test(String(procedures || ''));
  const fmxOn = has(/\bD0210\b/);
  const bwxOn = has(/\bD02(70|72|73|74|77)\b/);
  const fmxDue = !fmx || fmx <= fmxCut;
  const bwxDue = (!bwx || bwx <= bwxCut) && !(fmx && fmx > bwxCut);
  const flag = (name, due, on) => (on ? { name, state: 'onappt' } : due ? { name, state: 'add' } : null);
  return { fmxLast: fmx, bwxLast: bwx, flags: [flag('FMX', fmxDue, fmxOn), flag('BWX', bwxDue, bwxOn)].filter(Boolean) };
}

function normLab(l) {
  const seatAt = String(l.SeatAppt || '');
  return {
    id: l.LabCaseNum, patNum: l.PatNum, LName: l.LName, FName: l.FName, lab: l.Lab || 'Lab', aptNum: l.AptNum || 0, aptStatus: Number(l.AptStatus || 0),
    seat: odDate(seatAt), seatAt, sent: odDate(l.DateTimeSent), due: odDate(l.DateTimeDue), received: odDate(l.DateTimeRecd),
    status: l.Status, overdue: Number(l.Overdue) === 1 || l.Overdue === true, instructions: String(l.Instructions || '').slice(0, 120),
  };
}

function labState(l, today) {
  if (l.status === 'received_not_checked') return { status: 'ok', label: 'Back, not checked yet' };
  if (l.overdue) return { status: 'alert', label: 'Late at the lab' };
  if (l.seat && l.due && l.due > l.seat) return { status: 'alert', label: 'Due after the seat date' };
  if (l.status === 'not_sent') return { status: l.seat && daysBetween(today, l.seat) <= 2 ? 'alert' : 'warn', label: 'Not sent yet' };
  return { status: 'info', label: 'At the lab' };
}

const XRAY_ORDER = { BWX: 0, FMX: 1, PANO: 2 };
const XRAY_NAME = { BWX: 'BWX', FMX: 'FMX', PANO: 'Pano' };

/** The plan's side: insurance frequency limits, shown in the panel next to the clinical intervals. */
function xrayState(x, today) {
  const next = odDate(x.NextCovered);
  const covered = x.CoveredNow === true || x.CoveredNow === 1;
  if (x.CoveredNow === null || x.CoveredNow === undefined || !next) return { status: 'new', label: x.Limit === 'No insurance on file' ? 'No insurance' : 'No limit on file', coveredToday: null, next: null };
  if (covered) return { status: 'ok', label: next < today ? 'Covered' : 'Covered from today', coveredToday: true, next };
  return { status: 'warn', label: 'Not covered yet', coveredToday: false, next };
}

function buildPanel({ patNum, name, appt, aptNum, unsched, xrays, labs, ins, today, settings }) {
  const items = groupTreatment(unsched);
  const xr = xrays
    .map((x) => ({ category: x.Category, name: XRAY_NAME[x.Category] || x.Category, last: odDate(x.LastDate), limit: x.Limit || '', ...xrayState(x, today) }))
    .sort((a, b) => (XRAY_ORDER[a.category] ?? 9) - (XRAY_ORDER[b.category] ?? 9));
  const due = xrayDue(xrays, appt && appt.Procedures, appt ? odDate(appt.AptDateTime) || today : today, settings);
  const allLabs = labs.map(normLab).map((l) => ({ ...l, ...labState(l, today) }));
  const apt = aptNum || (appt && appt.AptNum) || null;
  return {
    patNum, name, appt, items, total: sum(items.map((i) => i.fee)), ins: insurance(ins),
    xrays: xr, due,
    labsHere: apt ? allLabs.filter((l) => l.aptNum === apt) : [],
    labsOther: apt ? allLabs.filter((l) => l.aptNum !== apt) : allLabs,
  };
}

/** Goal cards: office first, then each provider (doctors before hygienists). */
function goalCards(goals, rows) {
  const hasFees = rows.some((r) => r.appt.ScheduledFee !== undefined && r.appt.ScheduledFee !== null);
  const scheduledTotal = sum(rows.filter((r) => !r.broken).map((r) => r.appt.ScheduledFee));
  if (!goals) return { available: false, office: { name: 'Office', scheduled: hasFees ? scheduledTotal : null, goal: null }, providers: [] };
  const providers = goals
    .filter((g) => Number(g.Goal) > 0 || Number(g.ScheduledProduction) > 0)
    .map((g) => ({ name: g.Provider, hygienist: g.IsHygienist === true || g.IsHygienist === 1, scheduled: Number(g.ScheduledProduction || 0), goal: Number(g.Goal || 0) || null, hours: Number(g.Hours || 0) }))
    .sort((a, b) => Number(a.hygienist) - Number(b.hygienist) || b.scheduled - a.scheduled);
  const goal = sum(providers.map((p) => p.goal));
  return { available: true, office: { name: 'Office', scheduled: sum(providers.map((p) => p.scheduled)), goal: goal || null }, providers };
}

function assembleDay(date, appts, xrays, labs, unsched, ins, goals, settings = settingsFrom({})) {
  const rows = appts.map((a) => {
    const panel = buildPanel({
      patNum: a.PatNum,
      name: { LName: a.LName, FName: a.FName, Preferred: a.Preferred },
      appt: a,
      unsched: unsched.filter((r) => r.PatNum === a.PatNum),
      xrays: xrays.filter((r) => r.PatNum === a.PatNum),
      labs: labs.filter((l) => l.PatNum === a.PatNum),
      ins: ins.find((r) => r.PatNum === a.PatNum) || null,
      today: date,
      settings,
    });
    const labNotBack = panel.labsHere.some((l) => l.status !== 'ok');
    const complete = a.Status === 'Complete';
    const broken = a.Status === 'Broken';
    const xrayAdd = !complete && !broken && panel.due.flags.some((f) => f.state === 'add');
    // Row stripe (DESIGN.md §5): red lab not back, amber x-rays to add, blue planned work waiting, green done, grey otherwise.
    const status = broken ? 'new' : labNotBack ? 'alert' : complete ? 'ok' : xrayAdd ? 'warn' : panel.items.length ? 'info' : 'new';
    return { appt: a, panel, labNotBack, complete, broken, xrayAdd, status };
  });
  rows.sort((x, y) => String(x.appt.AptDateTime).localeCompare(String(y.appt.AptDateTime)) || String(x.appt.OpName).localeCompare(String(y.appt.OpName)));
  const live = rows.filter((r) => !r.broken);
  const hasFees = live.some((r) => r.appt.ScheduledFee !== undefined && r.appt.ScheduledFee !== null);
  return {
    date,
    rows,
    goals: goalCards(goals, rows),
    counts: {
      all: live.length,
      xray: live.filter((r) => r.xrayAdd).length,
      planned: live.filter((r) => r.panel.items.length).length,
      plannedIns: live.filter((r) => r.panel.items.length && r.panel.ins.left > 0).length,
      lab: live.filter((r) => r.labNotBack).length,
      done: live.filter((r) => r.complete).length,
    },
    production: hasFees ? sum(live.map((r) => r.appt.ScheduledFee)) : null,
  };
}

module.exports = { createData, settingsFrom, assembleDay, buildPanel, groupTreatment, xrayDue, xrayState, labState, normLab, shortName, insurance, dow };
