'use strict';
// HTML for the Daysheet pages, built from the shared classes in /shared/tdc.css
// (DESIGN.md §8) and the design tokens; layout-only inline styles where the
// shared file has no class (goal cards, insurance bars, appointment book).
// No inline scripts (CONTRACT §6): the page script is /static/daysheet.js.

const { shortDate, clock, addDays, daysBetween } = require('./dates');
const { shortName } = require('./data');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) {
  if (n === null || n === undefined || n === '') return '';
  const v = Math.abs(Number(n));
  const cents = Math.round(v * 100) % 100 !== 0;
  return (Number(n) < 0 ? '−' : '') + '$' + v.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
}
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const chip = (text, status) => `<span class="tdc-chip"${status ? ` data-status="${status}"` : ''}>${esc(text)}</span>`;
const mono = (t) => `<span class="tdc-mono">${esc(t)}</span>`;
const h3 = (t, extra = '') => `<h3 class="tdc-section-title" style="font-size:18px;margin-top:18px${extra}">${t}</h3>`;
const prioText = (p) => (/^\d+$/.test(String(p)) ? 'Priority ' + p : p);

// ---------- Page frame ----------

function actions(base, current) {
  const btn = (kind, icon, label, href, key) => `<a class="tdc-hbtn" data-kind="${kind}" data-icon="${icon}" href="${base}${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="tdc-actions" aria-label="Page actions">
${btn('list', 'calendar', 'Today', '/', 'today')}
${btn('list', 'list', 'This week', '/week', 'week')}
${btn('list', 'grid', 'Appointment book', '/book', 'book')}
${btn('money', 'dollar', 'Unscheduled', '/unscheduled', 'unscheduled')}
</nav>`;
}

function page({ base, title, current, body }) {
  const b = esc(base);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="same-origin">
<title>${esc(title)} · Dental Daysheet</title>
<link rel="stylesheet" href="/shared/tdc.css">
<script src="/shared/shell.js" defer></script>
<script src="${b}/static/daysheet.js" defer></script>
</head>
<body data-module="daysheet" data-base="${b}">
<main class="tdc-main">
${actions(b, current)}
${body}
</main>
</body></html>`;
}

function problemPage({ base, title, current, heading, text, status = 'alert' }) {
  return page({
    base, title, current,
    body: `<div class="tdc-callout" data-status="${status}" role="alert"><span data-icon="alert"></span><div><strong>${esc(heading)}</strong>${esc(text)}</div></div>
<div class="tdc-empty"><p>Nothing to show right now</p>The page will work again as soon as the Open Dental gateway answers. Try again in a minute.</div>`,
  });
}

function banner(icon, title, count, help) {
  return `<header class="tdc-pagehead">
  <h2><span data-icon="${icon}"></span>${esc(title)}</h2>
  <span class="tdc-count" id="ds-count">${esc(count)}</span>
  <p class="tdc-help">${esc(help)}</p>
</header>`;
}

/** ‹ Prev · date · Next › (· back to today) for pages that show one day or week. */
function dayBar(b, path, date, today, { step = 1, backLabel = 'Today', backHref = null } = {}) {
  const prev = addDays(date, -step); const next = addDays(date, step);
  const label = step === 7 ? 'week' : 'day';
  return `<div class="tdc-btn-row" style="margin:0 0 12px;gap:8px">
  <a class="tdc-btn" href="${b}${path}?date=${prev}" aria-label="Previous ${label}">‹ Prev</a>
  <form method="get" action="${b}${path}" id="ds-daypick" style="margin:0">
    <input type="date" name="date" value="${esc(date)}" aria-label="Pick a day" style="min-height:44px;padding:0 10px;font:inherit;font-family:var(--tdc-font-mono);color:var(--tdc-ink);background:var(--tdc-sunk);border:1px solid var(--tdc-line);border-radius:10px">
  </form>
  <a class="tdc-btn" href="${b}${path}?date=${next}" aria-label="Next ${label}">Next ›</a>
  ${backHref ? `<a class="tdc-btn" href="${b}${backHref}">${esc(backLabel)}</a>` : ''}
</div>`;
}

/** A 6–10px bar (DESIGN.md §5 progress bar), optional dark tick at a threshold. */
function bar(pct, status, { height = 6, tick = null, width = '100%' } = {}) {
  const p = Math.max(0, Math.min(100, pct));
  return `<div style="position:relative;height:${height}px;width:${width};max-width:100%;border-radius:99px;background:var(--tdc-sunk);margin-top:6px" aria-hidden="true">
  <div style="position:absolute;inset:0 auto 0 0;width:${p.toFixed(1)}%;border-radius:99px;background:var(--tdc-${status})"></div>
  ${tick !== null ? `<div style="position:absolute;top:-4px;bottom:-4px;left:${Math.max(0, Math.min(100, tick)).toFixed(1)}%;width:2px;background:var(--tdc-ink);opacity:.65"></div>` : ''}
</div>`;
}

/** "$932 of $2,000 left" with a bar (amber when low); or why there's no number. */
function insuranceBlock(ins, { low = 500, compact = false } = {}) {
  if (ins.none) return compact ? '<div class="tdc-muted" style="font-size:13px">No insurance</div>' : '<p class="tdc-muted" style="margin:4px 0">No insurance on file.</p>';
  if (ins.left === null) return compact ? chip('No ins max on file', 'alert') : `<div>${chip('No ins max on file', 'alert')} <span class="tdc-muted">${esc(ins.carrier || '')} · verify coverage</span></div>`;
  const status = ins.left < low ? 'warn' : 'ok';
  const of = ins.max ? ` of ${money(ins.max)}` : '';
  const pct = ins.max ? (ins.left / ins.max) * 100 : 100;
  return `<div><div style="font-size:13px"><span class="tdc-mono" style="font-weight:700;color:var(--tdc-${status})">${esc(money(ins.left))}</span>${esc(of)} left${compact ? '' : ` · <span class="tdc-muted">${esc(ins.carrier || '')}</span>`}</div>${bar(pct, status, { width: compact ? '150px' : '100%' })}</div>`;
}

// ---------- The patient panel (opened from a row) ----------

function renderPanel(p, { today, settings, showFinder = false }) {
  const a = p.appt;
  const t = a ? clock(a.Time || a.AptDateTime) : null;
  const head = `<button class="tdc-btn" type="button" data-close style="float:right;margin:0 0 8px 12px">Close</button>
<h2 id="ds-panel-title" tabindex="-1" style="outline:none">${esc(shortName(p.name))} <span class="tdc-id tdc-mono" style="font-weight:400;font-size:14px;color:var(--tdc-muted)">#${esc(p.patNum)}</span>${a && a.Age !== undefined && a.Age !== null ? ` <span class="tdc-muted" style="font-size:15px;font-weight:400">· ${esc(a.Age)} y</span>` : ''}</h2>
${a ? `<p class="tdc-muted" style="margin:0 0 4px"><span class="tdc-mono">${esc(t ? t.text + ' ' + t.ap : '')}</span> · ${esc(a.OpName || '')} · ${esc(a.Provider || '')}${a.Hygienist ? ' / ' + esc(a.Hygienist) : ''}${a.Minutes ? ' · ' + esc(a.Minutes) + ' min' : ''}${a.ScheduledFee ? ' · ' + mono(money(a.ScheduledFee)) : ''}</p>
${a.ProcDescript ? `<p style="margin:0 0 4px">${esc(a.ProcDescript)}</p>` : ''}
<div class="tdc-row-chips">${String(a.Procedures || '').split(/,\s*/).filter(Boolean).map((x) => chip(x)).join('')}${a.IsNewPatient ? chip('New patient', 'info') : ''}${a.Confirmed ? chip(a.Confirmed) : ''}</div>` : ''}`;

  const planned = p.items.length
    ? `<section class="tdc-list" aria-label="Planned, not scheduled">
${p.items.map((x) => `<div class="tdc-row" data-status="${x.priority ? 'info' : 'new'}">
  <div class="tdc-row-main">
    <p class="tdc-row-title">${esc(x.label)}</p>
    <div class="tdc-row-chips">${x.codes.map((c) => `<span class="tdc-chip tdc-mono">${esc(c)}</span>`).join('')}${!x.grouped && x.tooth ? chip('#' + x.tooth + (x.surf ? ' ' + x.surf : '')) : !x.grouped && x.surf ? chip(x.surf) : ''}${x.priority ? chip(prioText(x.priority), 'info') : ''}${x.dateTP ? chip('Planned ' + shortDate(x.dateTP, today)) : ''}</div>
  </div>
  <div class="tdc-row-side" style="color:var(--tdc-ink);font-weight:700;font-size:15px">${esc(money(x.fee))}</div>
</div>`).join('\n')}
</section>`
    : `<div class="tdc-empty"><p>Nothing waiting</p>No planned treatment that isn't already scheduled (hygiene isn't counted).</div>`;

  const ins = `${h3('Insurance this year')}${insuranceBlock(p.ins, { low: settings.lowInsurance })}
<p class="tdc-muted" style="font-size:13px;margin:6px 0 0">Estimate from Open Dental's claims and the plan's annual maximum, not a live check with the insurer.</p>`;

  const flags = p.due.flags.map((f) => chip(f.state === 'add' ? `Add ${f.name}` : `${f.name} on appt`, f.state === 'add' ? 'warn' : 'ok')).join('');
  const fmxEvery = settings.fmxMonths % 12 === 0 ? `${settings.fmxMonths / 12} years` : `${settings.fmxMonths} months`;
  const xrays = `<div class="tdc-row-chips" style="margin-bottom:8px">${flags || chip('No x-rays due', 'ok')}${chip('Last FMX ' + (p.due.fmxLast ? shortDate(p.due.fmxLast, today) : 'Never'))}${chip('Last BWX ' + (p.due.bwxLast ? shortDate(p.due.bwxLast, today) : 'Never'))}</div>
${p.xrays.length ? `<section class="tdc-list" aria-label="X-ray insurance limits">
${p.xrays.map((x) => `<div class="tdc-row" data-status="${x.status}">
  <div class="tdc-row-main">
    <p class="tdc-row-title">${esc(x.name)}</p>
    <div class="tdc-row-chips">${chip(x.label, x.status)}${x.limit && x.limit !== 'No insurance on file' ? chip(x.limit) : ''}</div>
    <div class="tdc-row-sub">Last taken: <span class="tdc-mono">${x.last ? esc(shortDate(x.last, today)) : 'never'}</span></div>
  </div>
  <div class="tdc-row-side">${x.next ? `<div>Next covered</div><div style="color:var(--tdc-ink)">${esc(shortDate(x.next, today))}</div>` : '<div>—</div>'}</div>
</div>`).join('\n')}
</section>` : ''}
<p class="tdc-muted" style="font-size:13px;margin:6px 0 0">Due: FMX every ${esc(fmxEvery)}; BWX every ${esc(settings.bwxMonths)} months unless an FMX was taken in that time. Coverage comes from the primary plan's frequency limits.</p>`;

  const lab = (l) => `<div class="tdc-row" data-status="${l.status}">
  <div class="tdc-row-main">
    <p class="tdc-row-title">${esc(l.lab)} <span class="tdc-id">#${esc(l.id)}</span></p>
    <div class="tdc-row-chips">${chip(l.label, l.status)}${l.sent ? chip('Sent ' + shortDate(l.sent, today)) : ''}</div>
    ${l.instructions ? `<div class="tdc-row-sub">${esc(l.instructions)}</div>` : ''}
  </div>
  <div class="tdc-row-side">${l.due ? `<div${l.status === 'alert' ? ' class="tdc-urgent"' : ''}>Due ${esc(shortDate(l.due, today))}</div>` : '<div>No due date</div>'}${l.seat ? `<div>Seat ${esc(shortDate(l.seat, today))}</div>` : ''}</div>
</div>`;
  const labs = a
    ? `${h3('Lab cases for this visit')}${p.labsHere.length ? `<section class="tdc-list">${p.labsHere.map(lab).join('')}</section>` : '<div class="tdc-empty"><p>No lab case</p>No open lab case is tied to this appointment.</div>'}${p.labsOther.length ? `${h3('Other open lab cases')}<section class="tdc-list">${p.labsOther.map(lab).join('')}</section>` : ''}`
    : p.labsOther.length ? `${h3('Open lab cases')}<section class="tdc-list">${p.labsOther.map(lab).join('')}</section>` : '';

  return `${head}
${h3(`Planned, not scheduled <span class="tdc-mono" style="margin-left:auto;font-size:16px">${esc(money(p.total))}</span>`, ';display:flex;gap:10px;align-items:baseline')}
${planned}
${ins}
${h3('X-rays')}
${xrays}
${labs}
<div class="tdc-btn-row" style="margin-top:18px">
${showFinder ? '<a class="tdc-btn" href="/m/finder/">Open the Treatment Finder</a>' : ''}
<button class="tdc-btn tdc-btn-primary" type="button" data-close>Close</button>
</div>`;
}

const panelShell = `<div class="tdc-scrim" id="ds-panel" hidden>
  <div class="tdc-dialog tdc-sheet" role="dialog" aria-modal="true" aria-labelledby="ds-panel-title" style="width:min(720px,100%)">
    <div id="ds-panel-body"></div>
  </div>
</div>`;

// ---------- Goal cards ----------

function goalCard(g, { office = false } = {}) {
  if (g.scheduled === null) return '';
  const pct = g.goal ? Math.round((g.scheduled / g.goal) * 100) : null;
  const scale = g.goal ? Math.max(g.goal * 1.25, g.scheduled) : Math.max(g.scheduled, 1);
  const status = pct === null ? 'accent' : pct >= 100 ? 'ok' : 'warn';
  const diff = g.goal ? g.scheduled - g.goal : null;
  const sub = g.goal
    ? `of ${esc(money(g.goal))} goal · <span class="tdc-mono" style="font-weight:700">${pct}%</span>${office ? ` · <span class="tdc-mono" style="font-weight:700;color:var(--tdc-${diff >= 0 ? 'ok' : 'alert'})">${diff >= 0 ? '+' : '−'}${esc(money(Math.abs(diff)))}</span>` : ''}`
    : 'scheduled';
  return `<div class="tdc-card" style="padding:14px 16px;margin:0">
  <div style="font-family:var(--tdc-font-head);font-weight:800;font-size:16px;text-transform:uppercase;color:var(--tdc-muted)">${esc(g.name)}${g.hygienist ? ' <span style="text-transform:none;font-weight:600">(hyg)</span>' : ''}</div>
  <div class="tdc-mono" style="font-size:clamp(20px,5vw,28px);font-weight:700;line-height:1.15;margin:6px 0 2px">${esc(money(g.scheduled))}</div>
  <div class="tdc-muted" style="font-size:13px">${sub}</div>
  ${bar((g.scheduled / scale) * 100, status, { height: 10, tick: g.goal ? (g.goal / scale) * 100 : null })}
</div>`;
}

function goalCards(goals) {
  if (goals.office.scheduled === null) return '';
  const cards = [goalCard(goals.office, { office: true }), ...goals.providers.map((p) => goalCard(p))].filter(Boolean);
  return `<section aria-label="Production and goals" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 14px">${cards.join('')}</section>
${goals.available ? '' : '<p class="tdc-muted" style="font-size:13px;margin:-6px 0 14px">Provider goals appear when the gateway shares each provider\'s hourly goal and scheduled hours.</p>'}`;
}

// ---------- Today / any day ----------

function timeGroup(hour) { return hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'; }
const feeOf = (a) => (a.ScheduledFee !== undefined && a.ScheduledFee !== null ? Number(a.ScheduledFee) : null);

function dayRow(r, { base, date }) {
  const a = r.appt;
  const t = clock(a.Time || a.AptDateTime) || { text: '', ap: '', hour: 0 };
  const p = r.panel;
  const procs = String(a.Procedures || '').split(/,\s*/).filter(Boolean);
  const labChip = p.labsHere.length ? (p.labsHere.every((l) => l.status === 'ok') ? chip('Lab back', 'ok') : p.labsHere.some((l) => l.status === 'alert') ? chip('Lab late', 'alert') : chip('Lab not back', 'warn')) : '';
  const xrayChips = r.complete || r.broken ? '' : p.due.flags.map((f) => chip(f.state === 'add' ? `Add ${f.name}` : `${f.name} on appt`, f.state === 'add' ? 'warn' : 'ok')).join('');
  const href = `${base}/patient?patient=${a.PatNum}&apt=${a.AptNum}&date=${date}`;
  const search = [a.LName, a.FName, shortName(a), a.PatNum, a.Procedures, a.ProcDescript, a.OpName, a.Provider, a.Hygienist, p.ins.carrier].join(' ').toLowerCase();
  const fee = feeOf(a);
  return `<div class="tdc-row" data-status="${r.status}" data-apt="${esc(a.AptNum)}" data-search="${esc(search)}" data-prov="${esc(a.Provider || '')}" data-hyg="${esc(a.Hygienist || '')}" data-op="${esc(a.OpName || '')}" data-time="${esc(timeGroup(t.hour))}" data-total="${fee || 0}" data-f-lab="${r.labNotBack ? 1 : 0}" data-f-planned="${p.items.length ? 1 : 0}" data-f-xray="${r.xrayAdd ? 1 : 0}" data-f-done="${r.complete ? 1 : 0}" style="cursor:pointer">
  <div class="tdc-row-main">
    <p class="tdc-row-title"><span class="tdc-mono" style="font-weight:700">${esc(t.text)}</span> <span class="tdc-mono tdc-muted" style="font-size:13px;font-weight:400">${esc(t.ap)}${a.Minutes ? ' · ' + esc(a.Minutes) + 'm' : ''}</span> · <a href="${esc(href)}" data-panel="${esc(a.AptNum)}" style="color:inherit;text-decoration:none">${esc(shortName(a))}</a> <span class="tdc-id">#${esc(a.PatNum)}</span>${a.Age !== undefined && a.Age !== null ? ` <span class="tdc-muted" style="font-weight:400">· ${esc(a.Age)}</span>` : ''}</p>
    ${a.ProcDescript ? `<div class="tdc-row-sub" style="color:var(--tdc-ink)">${esc(a.ProcDescript)}</div>` : ''}
    <div class="tdc-row-chips">${a.ProcDescript ? '' : procs.slice(0, 4).map((x) => chip(x)).join('') + (procs.length > 4 ? chip(`+${procs.length - 4}`) : '')}${a.Provider ? chip(a.Provider) : ''}${a.Hygienist ? chip(a.Hygienist) : ''}${a.OpName ? chip(a.OpName) : ''}${xrayChips}${p.items.length ? chip(`Unsched Tx ${money(p.total)}`, 'info') : ''}${!p.ins.none && p.ins.left === null ? chip('No ins max on file', 'alert') : ''}${a.IsNewPatient ? chip('New patient', 'info') : ''}${r.broken ? chip('Broken', 'new') : ''}${r.complete ? chip('Done', 'ok') : a.Confirmed ? chip(a.Confirmed) : ''}${labChip}</div>
  </div>
  <div class="tdc-row-side">${fee !== null ? `<div style="color:var(--tdc-ink);font-weight:700;font-size:15px">${esc(money(fee))}</div>` : ''}<div>${esc(p.ins.carrier || (p.ins.none ? 'No insurance' : ''))}</div></div>
</div>`;
}

function statTile(key, status, icon, label, short, count, selected, badge) {
  return `<button class="tdc-stat" type="button" data-filter="${key}" data-status="${status}" aria-selected="${selected ? 'true' : 'false'}"><span class="tdc-stat-count">${count}</span><span data-icon="${icon}"></span><span class="tdc-stat-label"${short ? ` data-short="${short}"` : ''}>${label}</span>${badge ? `<span class="tdc-stat-badge">${esc(badge)}</span>` : ''}</button>`;
}

function dayPage(d, { base, today, current, showBroken, settings, isHome }) {
  const isToday = d.date === today;
  const c = d.counts;
  const b = esc(base);
  const provs = [...new Set(d.rows.flatMap((r) => [r.appt.Provider, r.appt.Hygienist]).filter(Boolean))].sort();
  const ops = [...new Set(d.rows.map((r) => r.appt.OpName).filter(Boolean))].sort();
  const rows = d.rows.filter((r) => showBroken || !r.broken);
  const list = ['Morning', 'Afternoon', 'Evening'].map((g) => {
    const rs = rows.filter((r) => timeGroup((clock(r.appt.Time || r.appt.AptDateTime) || { hour: 0 }).hour) === g);
    if (!rs.length) return '';
    const tot = rs.reduce((s, r) => s + Number(feeOf(r.appt) || 0), 0);
    return `<h3 class="tdc-gh" data-gk="time:${g}"><span>${g}</span><span class="tdc-gcount">${rs.length}</span>${d.production !== null ? `<span class="tdc-mono" style="margin-left:auto;text-transform:none">${esc(money(tot))}</span>` : ''}</h3>\n${rs.map((r) => dayRow(r, { base: b, date: d.date })).join('\n')}`;
  }).join('\n');
  const panels = rows.map((r) => `<template id="ds-p-${esc(r.appt.AptNum)}">${renderPanel(r.panel, { today, settings })}</template>`).join('\n');
  const title = isHome && !isToday ? `Next clinic day · ${shortDate(d.date, today)}` : `${isToday ? 'Today' : 'Schedule'} · ${shortDate(d.date, today)}`;
  const count = `${plural(c.all, 'patient')}${d.production !== null ? ' · ' + money(d.production) : ''}`;
  const dayWord = isToday ? 'today' : daysBetween(today, d.date) === 1 ? 'tomorrow' : 'on this day';

  return page({
    base, title: isToday ? 'Today' : shortDate(d.date, today), current,
    body: `<nav class="tdc-stats" aria-label="Show">
${statTile('all', 'accent', 'calendar', 'Patients', '', c.all, true)}
${statTile('xray', 'warn', 'tooth', 'X-rays to add', 'X-rays', c.xray, false)}
${statTile('planned', 'info', 'dollar', 'Unsched Tx', 'Tx', c.planned, false, c.plannedIns ? `${c.plannedIns} ins` : '')}
${statTile('lab', 'alert', 'flask', 'Lab not back', 'Lab', c.lab, false)}
${statTile('done', 'ok', 'check', 'Done', '', c.done, false)}
</nav>
${banner('calendar', title, count, `Everyone scheduled ${dayWord}. Tap a patient for planned treatment that isn't scheduled (hygiene left out), insurance left this year, x-rays due and lab cases for the visit.`)}
${goalCards(d.goals)}
${dayBar(b, '/day', d.date, today, { backHref: isHome ? null : '/' })}
<div class="tdc-find">
  <input type="search" id="ds-search" placeholder="Search name, patient #, procedure, carrier…" aria-label="Search">
  <select id="ds-prov" aria-label="Provider"><option value="">All providers</option>${provs.map((p) => `<option>${esc(p)}</option>`).join('')}</select>
  <select id="ds-op" aria-label="Chair"><option value="">All chairs</option>${ops.map((p) => `<option>${esc(p)}</option>`).join('')}</select>
  <select id="ds-broken" aria-label="Broken appointments" data-href-0="${b}/day?date=${d.date}" data-href-1="${b}/day?date=${d.date}&amp;broken=1"><option value="0"${showBroken ? '' : ' selected'}>Without broken</option><option value="1"${showBroken ? ' selected' : ''}>With broken</option></select>
</div>
<div class="tdc-groupby">
  <span class="tdc-seg-label">Group by</span>
  <div class="tdc-seg" role="group" aria-label="Group by" data-remember="daysheet-groupby" id="ds-groupby">
    <button type="button" data-group="time" aria-pressed="true">Time</button>
    <button type="button" data-group="prov" aria-pressed="false">Provider</button>
    <button type="button" data-group="op" aria-pressed="false">Chair</button>
  </div>
</div>
<section class="tdc-list" id="ds-list" aria-label="Appointments" data-money="${d.production !== null ? 1 : 0}">
${list}
</section>
<div class="tdc-empty" id="ds-empty"${rows.length ? ' hidden' : ''}><p>${rows.length ? 'No patients match' : 'Nobody scheduled'}</p>${rows.length ? 'Try another tile or <a href="#" id="ds-clear">Clear search</a>.' : `No appointments ${esc(dayWord)}. Use Next › to look ahead.`}</div>
${panels}
${panelShell}`,
  });
}

// ---------- Appointment book ----------

function bookPage(d, ops, { base, today }) {
  const b = esc(base);
  const rows = d.rows.filter((r) => !r.broken);
  const startMin = (r) => { const m = String(r.appt.Time || r.appt.AptDateTime).match(/(\d{1,2}):(\d{2})(?::\d{2})?$/); return m ? +m[1] * 60 + +m[2] : 8 * 60; };
  const starts = rows.map(startMin);
  const ends = rows.map((r, i) => starts[i] + Math.max(10, Number(r.appt.Minutes || 30)));
  const first = rows.length ? Math.floor(Math.min(...starts) / 60) * 60 : 8 * 60;
  const last = rows.length ? Math.ceil(Math.max(...ends) / 60) * 60 : 17 * 60;
  const PX = 1.6; // pixels per minute: 96px an hour
  const height = Math.round((last - first) * PX);

  // Columns in Open Dental's operatory order (operatories report); only chairs used that day.
  const used = [...new Set(rows.map((r) => r.appt.OpName).filter(Boolean))];
  const order = (ops || []).filter((o) => !Number(o.IsHidden)).map((o) => o.OpName);
  const cols = [...order.filter((n) => used.includes(n)), ...used.filter((n) => !order.includes(n)).sort()];
  const provOf = (op) => { const n = {}; rows.filter((r) => r.appt.OpName === op).forEach((r) => { const k = r.appt.Hygienist || r.appt.Provider; if (k) n[k] = (n[k] || 0) + 1; }); return Object.keys(n).sort((x, y) => n[y] - n[x]).join(', '); };

  const lines = `repeating-linear-gradient(to bottom, var(--tdc-line) 0, var(--tdc-line) 1px, transparent 1px, transparent ${30 * PX}px)`;
  const times = [];
  for (let m = first; m <= last; m += 30) {
    const h = Math.floor(m / 60); const isHour = m % 60 === 0;
    times.push(`<span class="tdc-mono" style="position:absolute;right:6px;top:${Math.round((m - first) * PX)}px;transform:translateY(-50%);font-size:11px;${isHour ? 'font-weight:700;color:var(--tdc-ink)' : 'color:var(--tdc-muted)'}">${isHour ? `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}` : ':30'}</span>`);
  }
  const block = (r, i) => {
    const a = r.appt;
    const top = Math.round((starts[i] - first) * PX);
    const h = Math.max(22, Math.round((ends[i] - starts[i]) * PX) - 3);
    const add = r.complete ? [] : r.panel.due.flags.filter((f) => f.state === 'add').map((f) => '+' + f.name);
    return `<a href="${b}/day?date=${d.date}&amp;apt=${esc(a.AptNum)}" title="${esc(shortName(a))} · ${esc(a.Procedures || '')}" style="position:absolute;left:4px;right:4px;top:${top}px;height:${h}px;overflow:hidden;border-radius:8px;border:1px solid var(--tdc-line);border-left:6px solid var(--tdc-${r.status === 'new' ? 'accent' : r.status});background:var(--tdc-surface);color:var(--tdc-ink);text-decoration:none;padding:3px 6px;font-size:12px;line-height:1.25">
  ${add.length ? `<span class="tdc-chip" data-status="warn" style="float:right;font-size:10px;padding:0 4px;margin-left:4px">${esc(add.join(' '))}</span>` : ''}<strong style="display:block;font-size:13px">${esc(shortName(a))}</strong>${h >= 56 ? `<span style="display:block;color:var(--tdc-muted)">${esc(a.ProcDescript || a.Procedures || '')}</span>` : ''}${feeOf(a) && h >= 40 ? `<span class="tdc-mono" style="font-weight:700;font-size:11.5px">${esc(money(feeOf(a)))}</span>` : ''}
</a>`;
  };
  const colHtml = cols.map((op) => `<div style="position:relative;height:${height}px;border-left:1px solid var(--tdc-line);background:${lines}">${rows.map((r, i) => (r.appt.OpName === op ? block(r, i) : '')).join('')}</div>`).join('');
  const heads = cols.map((op) => `<div style="padding:8px 4px;text-align:center;border-left:1px solid var(--tdc-line);border-bottom:1px solid var(--tdc-line);background:var(--tdc-sunk)"><div style="font-family:var(--tdc-font-head);font-weight:800;font-size:15px;text-transform:uppercase">${esc(op)}</div><div class="tdc-muted" style="font-size:11px">${esc(provOf(op))}</div></div>`).join('');
  const legend = [['accent', 'Scheduled'], ['info', 'Unscheduled treatment'], ['warn', 'X-rays to add'], ['alert', 'Lab not back'], ['ok', 'Done']]
    .map(([s, t]) => `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:16px;white-space:nowrap"><span style="width:12px;height:12px;border-radius:3px;background:var(--tdc-${s})"></span>${t}</span>`).join('');

  return page({
    base, title: 'Appointment book', current: 'book',
    body: `${banner('grid', `Appointment book · ${shortDate(d.date, today)}`, `${plural(rows.length, 'appointment')}${d.production !== null ? ' · ' + money(d.production) : ''}`, 'The day by chair, like Open Dental\'s appointment book. Tap an appointment to open that patient. +FMX / +BWX marks x-rays to add.')}
${dayBar(b, '/book', d.date, today, { backHref: d.date === today ? null : '/book', backLabel: 'Today' })}
${cols.length ? `<div style="overflow-x:auto;border:1px solid var(--tdc-line);border-radius:var(--tdc-radius);background:var(--tdc-surface)">
<div style="display:grid;grid-template-columns:56px repeat(${cols.length},minmax(140px,1fr));min-width:${56 + cols.length * 140}px">
  <div style="background:var(--tdc-sunk);border-bottom:1px solid var(--tdc-line)"></div>${heads}
  <div style="position:relative;height:${height}px">${times.join('')}</div>${colHtml}
</div></div>
<p class="tdc-muted" style="font-size:13px;margin:10px 2px 0">${legend}</p>` : '<div class="tdc-empty"><p>Nobody scheduled</p>No appointments on this day.</div>'}`,
  });
}

// ---------- This week ----------

function weekPage(w, { base, today }) {
  const b = esc(base);
  const row = (r, date) => {
    const a = r.appt; const t = clock(a.Time || a.AptDateTime) || { text: '', ap: '' };
    const search = [a.LName, a.FName, shortName(a), a.PatNum, r.ins.carrier, ...r.items.map((i) => i.label + ' ' + i.codes.join(' '))].join(' ').toLowerCase();
    return `<div class="tdc-row" data-status="info" data-search="${esc(search)}" data-total="${r.total}" style="cursor:pointer">
  <div class="tdc-row-main">
    <p class="tdc-row-title"><span class="tdc-mono" style="font-weight:700">${esc(t.text)}</span> <span class="tdc-mono tdc-muted" style="font-size:13px;font-weight:400">${esc(t.ap)}</span> · <a href="${b}/patient?patient=${esc(a.PatNum)}&amp;apt=${esc(a.AptNum)}&amp;date=${date}" data-fetch="${esc(a.PatNum)}" data-apt="${esc(a.AptNum)}" data-date="${date}" style="color:inherit;text-decoration:none">${esc(shortName(a))}</a> <span class="tdc-id">#${esc(a.PatNum)}</span></p>
    <div class="tdc-row-chips">${r.ins.carrier ? chip(r.ins.carrier) : ''}${r.items.map((i) => chip(`${i.label} ${money(i.fee)}`, 'info')).join('')}</div>
  </div>
  <div class="tdc-row-side"><div style="color:var(--tdc-ink);font-weight:700;font-size:15px">${esc(money(r.total))}</div><div${r.ins.left < 100 ? ' class="tdc-urgent"' : ''}>${esc(money(r.ins.left))} ins left</div></div>
</div>`;
  };
  const list = w.days.map((d) => (d.rows.length
    ? `<h3 class="tdc-gh" data-gk="week:${d.date}"><span>${esc(shortDate(d.date, today))}</span><span class="tdc-gcount">${d.rows.length}</span><span class="tdc-mono" style="margin-left:auto;text-transform:none">${esc(money(d.total))}</span></h3>\n${d.rows.map((r) => row(r, d.date)).join('\n')}`
    : '')).join('\n');
  const thisMonday = addDays(today, -((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7));
  return page({
    base, title: 'This week', current: 'week',
    body: `${banner('list', `Week of ${shortDate(w.monday, today)}`, `${plural(w.count, 'patient')} · ${money(w.total)}`, 'Patients coming in this week who have insurance left this year and treatment that isn\'t scheduled yet, a chance to schedule it while they\'re here.')}
${dayBar(b, '/week', w.monday, today, { step: 7, backHref: w.monday === thisMonday ? null : '/week', backLabel: 'This week' })}
<div class="tdc-find"><input type="search" id="ds-search" placeholder="Search name, patient #, carrier, procedure…" aria-label="Search"></div>
<section class="tdc-list" id="ds-list" aria-label="Patients this week" data-static="1">
${list}
</section>
<div class="tdc-empty" id="ds-empty"${w.count ? ' hidden' : ''}><p>${w.count ? 'No patients match' : 'Nothing this week'}</p>${w.count ? '<a href="#" id="ds-clear">Clear search</a>.' : 'No one scheduled this week has both insurance left and unscheduled treatment.'}</div>
${panelShell}`,
  });
}

// ---------- Unscheduled ----------

function ageGroup(oldest, today) {
  if (!oldest) return { key: 'none', status: 'new', label: 'No plan date' };
  const days = daysBetween(oldest, today);
  if (days > 365) return { key: 'year', status: 'alert', label: 'Over a year' };
  if (days > 182) return { key: 'half', status: 'warn', label: '6 to 12 months' };
  return { key: 'recent', status: 'new', label: 'Under 6 months' };
}
function insGroup(ins) { return ins.none ? 'noins' : ins.left === null ? 'nomax' : ins.left > 0 ? 'left' : 'used'; }

function unscheduledPage(u, { base, today, settings }) {
  const b = esc(base);
  const year = today.slice(0, 4);
  const pats = u.patients.map((p) => ({ ...p, age: ageGroup(p.oldest, today), ig: insGroup(p.ins) })).sort((x, y) => y.total - x.total);
  const total = pats.reduce((s, p) => s + p.total, 0);
  const n = (k) => pats.filter((p) => p.ig === k).length;
  const row = (p) => `<div class="tdc-row" data-status="${p.ig === 'nomax' ? 'alert' : p.ig === 'left' ? 'ok' : p.age.status}" data-age="${p.age.key}" data-ins="${p.ig}" data-total="${p.total}" data-search="${esc([p.LName, p.FName, shortName(p), p.PatNum, p.ins.carrier, ...p.items.map((i) => i.label + ' ' + i.codes.join(' '))].join(' ').toLowerCase())}" style="cursor:pointer">
  <div class="tdc-row-main">
    <p class="tdc-row-title"><a href="${b}/patient?patient=${esc(p.PatNum)}&amp;from=unscheduled" data-fetch="${esc(p.PatNum)}" style="color:inherit;text-decoration:none">${esc(shortName(p))}</a> <span class="tdc-id">#${esc(p.PatNum)}</span></p>
    <div class="tdc-row-chips">${p.items.slice(0, 4).map((i) => chip(`${i.label} ${money(i.fee)}`, 'info')).join('')}${p.items.length > 4 ? chip(`+${p.items.length - 4} more`) : ''}${p.oldest ? chip('Planned ' + shortDate(p.oldest, today), p.age.status === 'new' ? undefined : p.age.status) : ''}</div>
  </div>
  <div class="tdc-row-side"><div style="color:var(--tdc-ink);font-weight:700;font-size:16px">${esc(money(p.total))}</div>${insuranceBlock(p.ins, { low: settings.lowInsurance, compact: true })}</div>
</div>`;
  const groups = [['left', 'ok', `Insurance left in ${year}`], ['nomax', 'alert', 'No insurance max on file - verify coverage'], ['used', 'warn', `Insurance used up for ${year}`], ['noins', 'new', 'No insurance']];
  const list = groups.map(([k, s, label]) => {
    const rs = pats.filter((p) => p.ig === k);
    if (!rs.length) return '';
    return `<h3 class="tdc-gh" data-status="${s}" data-gk="ins:${k}"><span>${esc(label)}</span><span class="tdc-gcount">${rs.length}</span><span class="tdc-mono" style="margin-left:auto;text-transform:none">${esc(money(rs.reduce((x, p) => x + p.total, 0)))}</span></h3>\n${rs.map(row).join('\n')}`;
  }).join('\n');
  return page({
    base, title: 'Unscheduled treatment', current: 'unscheduled',
    body: `<nav class="tdc-stats" aria-label="Show">
${statTile('all', 'accent', 'list', 'All patients', 'All', pats.length, true)}
${statTile('left', 'ok', 'dollar', 'Insurance left', 'Ins left', n('left'), false)}
${statTile('nomax', 'alert', 'alert', 'No max on file', 'No max', n('nomax'), false)}
${statTile('used', 'warn', 'pending', 'Max used up', 'Used up', n('used'), false)}
${statTile('noins', 'new', 'user', 'No insurance', 'No ins', n('noins'), false)}
</nav>
${banner('dollar', 'Unscheduled treatment', `${plural(pats.length, 'patient')} · ${money(total)}`, 'Active patients with treatment planned but not on a scheduled appointment. Hygiene isn\'t counted; a crown and its buildup show as one item. Insurance left is an estimate from Open Dental.')}
${u.truncated ? '<div class="tdc-callout" data-status="warn" role="status"><span data-icon="alert"></span><div><strong>List cut short</strong>There are more planned procedures than this page can show. Use the Treatment Finder to narrow it down.</div></div>' : ''}
<div class="tdc-find">
  <input type="search" id="ds-search" placeholder="Search name, patient #, carrier, procedure…" aria-label="Search">
  <select id="ds-min" aria-label="Amount"><option value="0">Any amount</option><option value="500">$500 and up</option><option value="1000">$1,000 and up</option><option value="2500">$2,500 and up</option></select>
</div>
<div class="tdc-groupby">
  <span class="tdc-seg-label">Group by</span>
  <div class="tdc-seg" role="group" aria-label="Group by" data-remember="daysheet-unsched-groupby" id="ds-groupby">
    <button type="button" data-group="ins" aria-pressed="true">Insurance</button>
    <button type="button" data-group="age" aria-pressed="false">Plan age</button>
    <button type="button" data-group="amount" aria-pressed="false">Amount</button>
  </div>
  <a class="tdc-btn" href="/m/finder/" style="margin-left:auto">Treatment Finder</a>
</div>
<section class="tdc-list" id="ds-list" aria-label="Patients" data-money="1" data-year="${year}">
${list}
</section>
<div class="tdc-empty" id="ds-empty"${pats.length ? ' hidden' : ''}><p>${pats.length ? 'No patients match' : 'All caught up'}</p>${pats.length ? 'Try another tile or <a href="#" id="ds-clear">Clear search</a>.' : 'No planned treatment is waiting to be scheduled.'}</div>
${panelShell}`,
  });
}

/** The panel as its own page (no-JavaScript fallback and direct links). */
function patientPage(panel, { base, today, back, settings }) {
  return page({
    base, title: shortName(panel.name), current: '',
    body: `<p style="margin:0 0 12px"><a class="tdc-btn" href="${esc(back)}">‹ Back</a></p>
<div class="tdc-card">${renderPanel(panel, { today, settings, showFinder: true }).replace(/<button class="tdc-btn[^"]*" type="button" data-close[^>]*>Close<\/button>/g, '')}</div>`,
  });
}

module.exports = { esc, money, page, problemPage, renderPanel, dayPage, bookPage, weekPage, unscheduledPage, patientPage };
