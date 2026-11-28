#!/usr/bin/env node
'use strict';
// A pretend Open Dental gateway with made-up patients, shaped like the reports
// the Daysheet uses, including the columns and the daysheet_goals report asked
// for in docs/REPORT-REQUESTS.md. For trying the pages before those are released.
// Every name and number here is invented.
//
//   node scripts/fake-gateway.js            (listens on http://127.0.0.1:8788)
//   then in .env:  GATEWAY_URL=http://127.0.0.1:8788   GATEWAY_KEY=odg_fake_daysheet_key_0001
//
// It says "stage": "design" and "fake": true.

const http = require('node:http');

const PORT = Number(process.env.FAKE_PORT || 8788);
const LAST = ['Applewood', 'Brightwater', 'Cedarfield', 'Dunmore', 'Elmsworth', 'Fernhill', 'Glenrock', 'Hollowell', 'Ivywood', 'Juniper', 'Kestrel', 'Larkspur', 'Meadowbrook', 'Northbrook', 'Oakridge', 'Pinecrest', 'Quarryton', 'Ravensdale', 'Stillwater', 'Thistledown', 'Underhill', 'Valewood', 'Willowby', 'Yarrow', 'Ashcombe', 'Birchfield', 'Copperton', 'Driftwood', 'Emberly', 'Foxglove'];
const FIRST = ['Dana', 'Kendall', 'Riley', 'Morgan', 'Harper', 'Oakley', 'Vesper', 'Ellis', 'Lane', 'Sage', 'Blair', 'Quinn', 'Rowan', 'Wren', 'Avery', 'Jules', 'Parker', 'Reese', 'Shay', 'Toby', 'Yael', 'Noel', 'Umber', 'Arden', 'Bryn', 'Cove', 'Darby', 'Emery', 'Finch', 'Gray'];
const CARRIERS = ['Pretend Mutual', 'Imaginary Dental', 'Make-Believe Benefits', 'Fictional Health'];
const OPS = [['Op 1', 'DOC1'], ['Op 2', 'DOC1'], ['Hyg 1', 'HYG1'], ['Hyg 2', 'HYG2']];

function rnd(seed) { let x = seed * 9301 + 49297; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }
const pats = LAST.map((l, i) => ({ PatNum: 1001 + i, LName: l, FName: FIRST[i], Age: 18 + ((i * 7) % 60) }));
const today = () => new Date(Date.now() - 8 * 3600e3).toISOString().slice(0, 10);
const shift = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dayNum = (d) => Math.round(Date.parse(d + 'T00:00:00Z') / 864e5);

const TX = [['D2740', 'crown - porcelain/ceramic', 1350], ['D2950', 'core buildup', 320], ['D2392', 'resin-based composite - two surfaces, posterior', 240], ['D2393', 'resin-based composite - three surfaces, posterior', 290], ['D6010', 'surgical placement of implant body', 2400], ['D6057', 'custom fabricated abutment', 650], ['D6058', 'abutment supported porcelain/ceramic crown', 1450], ['D4341', 'perio scaling and root planing', 260], ['D7140', 'extraction, erupted tooth', 210]];
function unsched(p) {
  const r = rnd(p.PatNum); const out = [];
  if (r() < 0.35) return out;
  const tooth = String(2 + Math.floor(r() * 29));
  const pick = (code, n) => { const t = TX.find((x) => x[0] === code); out.push({ PatNum: p.PatNum, LName: p.LName, FName: p.FName, ProcNum: p.PatNum * 10 + n, ProcCode: t[0], Descript: t[1], ToothNum: tooth, Surf: '', Fee: t[2], DateTP: shift(today(), -Math.floor(r() * 600)), Priority: String(1 + Math.floor(r() * 3)) }); };
  const k = r();
  if (k < 0.35) { pick('D2740', 1); pick('D2950', 2); } else if (k < 0.5) { pick('D6058', 1); pick('D6057', 2); } else if (k < 0.75) pick('D2392', 1); else pick('D2393', 1);
  if (r() < 0.3) { const t = TX[2 + Math.floor(r() * 2)]; out.push({ PatNum: p.PatNum, LName: p.LName, FName: p.FName, ProcNum: p.PatNum * 10 + 5, ProcCode: t[0], Descript: t[1], ToothNum: String(2 + Math.floor(r() * 29)), Surf: 'MO', Fee: t[2], DateTP: shift(today(), -Math.floor(r() * 200)), Priority: '' }); }
  return out;
}
function ins(p) {
  const r = rnd(p.PatNum + 7);
  if (r() < 0.12) return null;
  const max = r() < 0.15 ? null : [1000, 1500, 2000][Math.floor(r() * 3)];
  const used = max ? Math.round(r() * max) : 0;
  return { PatNum: p.PatNum, LName: p.LName, FName: p.FName, Carrier: CARRIERS[Math.floor(r() * CARRIERS.length)], AnnualMax: max, Used: used, Remaining: max === null ? null : max - used, BenefitYearStart: today().slice(0, 4) + '-01-01', IsEstimate: true, AsOf: today() };
}
function xrays(p) {
  const r = rnd(p.PatNum + 3);
  const fmx = r() < 0.25 ? null : shift(today(), -Math.floor(r() * 2400));
  const bwx = r() < 0.1 ? null : shift(today(), -Math.floor(r() * 600));
  const pano = r() < 0.5 ? null : shift(today(), -Math.floor(r() * 2400));
  return [['BWX', bwx, '1 per 12 months', 365], ['FMX', fmx, '1 per 60 months', 1826], ['PANO', pano, '1 per 60 months', 1826]].map(([c, d, lim, days]) => {
    const next = d ? shift(d, days) : today();
    return { PatNum: p.PatNum, LName: p.LName, FName: p.FName, Category: c, LastDate: d, Limit: lim, NextCovered: next, CoveredNow: next <= today(), AsOf: today() };
  });
}
function day(date) {
  const wd = new Date(date + 'T00:00:00Z').getUTCDay();
  if (wd === 0 || wd === 6) return [];
  const r = rnd(dayNum(date)); const out = []; let n = 0;
  for (const [op, prov] of OPS) {
    let t = 8 * 60;
    while (t < 16 * 60 + 30) {
      if (t === 12 * 60) { t += 60; continue; }
      const len = op.startsWith('Hyg') ? 60 : [30, 60, 90][Math.floor(r() * 3)];
      if (r() < 0.2) { t += 30; continue; }
      const p = pats[Math.floor(r() * pats.length)];
      const hyg = op.startsWith('Hyg');
      const xs = xrays(p);
      const needFmx = !xs[1].LastDate || xs[1].LastDate < shift(date, -1826);
      const procs = hyg ? ['D0120', 'D1110', ...(needFmx && r() < 0.4 ? ['D0210'] : [])] : [['D2740 #' + (2 + n % 29)], ['D2392 #14 MO'], ['D0150', 'D0210'], ['D6010 #19']][Math.floor(r() * 4)];
      const fee = procs.reduce((s, c) => s + ({ D0120: 65, D1110: 125, D0210: 165, D0150: 120, D2392: 240, D6010: 2400 }[c.slice(0, 5)] || (c.startsWith('D2740') ? 1350 : 0)), 0);
      const hh = Math.floor(t / 60); const mm = t % 60;
      const past = date < today() || (date === today() && hh < 10);
      out.push({ AptNum: dayNum(date) * 100 + n, AptDateTime: `${date} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`, Time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, Minutes: len, Status: past ? 'Complete' : 'Scheduled', PatNum: p.PatNum, LName: p.LName, FName: p.FName, Preferred: '', Provider: hyg ? 'DOC1' : prov, Hygienist: hyg ? prov : null, OpName: op, IsHygiene: hyg, IsNewPatient: procs.includes('D0150'), Confirmed: ['Confirmed', 'Texted', 'Unconfirmed'][Math.floor(r() * 3)], Procedures: procs.join(', '), ScheduledFee: fee, Age: p.Age, ProcDescript: hyg ? 'PerEx, Pro' + (procs.includes('D0210') ? ', FMX' : '') : procs[0].startsWith('D2740') ? 'Crown prep ' + procs[0].slice(6) : procs[0].startsWith('D6010') ? 'Implant ' + procs[0].slice(6) : procs.includes('D0150') ? 'New patient exam, FMX' : 'Filling' });
      n++; t += len;
    }
  }
  return out.sort((a, b) => a.AptDateTime.localeCompare(b.AptDateTime));
}
function labs() {
  const t = today(); const out = [];
  for (let i = 1; i <= 6; i++) {
    const d = shift(t, i);
    const a = day(d).find((x) => x.Procedures.includes('D2740') || x.Procedures.includes('D6010'));
    if (!a) continue;
    out.push({ LabCaseNum: 500 + i, PatNum: a.PatNum, LName: a.LName, FName: a.FName, Lab: ['Pretend Lab', 'In-house mill'][i % 2], AptNum: a.AptNum, SeatAppt: a.AptDateTime, AptStatus: 1, DateTimeSent: shift(t, -7), DateTimeDue: shift(t, i % 3 === 0 ? i + 1 : i - 1), DateTimeRecd: null, Status: i === 2 ? 'received_not_checked' : 'at_lab', Overdue: 0, Instructions: 'Shade A2 (made up)' });
  }
  return out;
}
function goals(date) {
  const appts = day(date);
  if (!appts.length) return [];
  const by = (prov) => appts.filter((a) => (a.Hygienist || a.Provider) === prov).reduce((s, a) => s + a.ScheduledFee, 0);
  return [
    { ProvNum: 1, Provider: 'DOC1', IsHygienist: false, HourlyGoal: 750, Hours: 7, Goal: 5250, ScheduledProduction: by('DOC1') },
    { ProvNum: 3, Provider: 'HYG1', IsHygienist: true, HourlyGoal: 160, Hours: 7.5, Goal: 1200, ScheduledProduction: by('HYG1') },
    { ProvNum: 4, Provider: 'HYG2', IsHygienist: true, HourlyGoal: 160, Hours: 7.5, Goal: 1200, ScheduledProduction: by('HYG2') },
  ];
}

const pick = (list, p) => (p.patients ? list.filter((r) => p.patients.map(Number).includes(r.PatNum)) : list);
function report(name, p) {
  switch (name) {
    case 'daysheet': return day(p.date || today());
    case 'daysheet_goals': return goals(p.date || today());
    case 'xray_history': return p.date ? day(p.date).map((a) => pats.find((x) => x.PatNum === a.PatNum)).filter((v, i, s) => s.indexOf(v) === i).flatMap(xrays) : pick(pats, p).flatMap(xrays);
    case 'unscheduled_treatment': return pick(pats, p).flatMap(unsched);
    case 'insurance_remaining': return pick(pats, p).map(ins).filter(Boolean);
    case 'lab_cases_open': return labs();
    case 'operatories': return OPS.map(([op], i) => ({ OperatoryNum: i + 1, OpName: op, Abbrev: op, IsHidden: 0 }));
    default: return null;
  }
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://fake');
    const send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (url.pathname === '/health') return send(200, { ok: true, version: 'fake', stage: 'design', fake: true });
    const m = url.pathname.match(/^\/v1\/reports\/([a-z0-9_]+)$/);
    if (!m) return send(404, { error: { message: 'not found' } });
    let params = {};
    try { params = (body && JSON.parse(body).params) || Object.fromEntries(url.searchParams); } catch { return send(400, { error: { message: 'bad JSON' } }); }
    const rows = report(m[1], params);
    if (!rows) return send(403, { error: { message: 'not in the fake gateway' } });
    return send(200, { report: m[1], count: rows.length, truncated: false, rows });
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Fake gateway (made-up patients) on http://127.0.0.1:${PORT}/  - stage design`));
