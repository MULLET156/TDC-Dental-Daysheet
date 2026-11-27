'use strict';
// HTML for the Daysheet pages, built only from the shared classes in
// /shared/tdc.css (DESIGN.md §8). No inline scripts (CONTRACT §6): the page
// script is /static/daysheet.js.

const { shortDate, clock, compact, addDays, daysBetween } = require('./dates');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: Number(n) % 1 ? 2 : 0 });
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** "Applewood, Dana (Dee)" */
function fullName(n) {
  if (!n) return 'Patient';
  const pref = n.Preferred && n.Preferred !== n.FName ? ` (${n.Preferred})` : '';
  return `${n.LName || ''}, ${n.FName || ''}${pref}`.replace(/^, /, '');
}
/** "Applewood, D." (tiles) */
const shortName = (n) => `${n.LName || ''}, ${String(n.FName || '').slice(0, 1)}.`;

// ---------- Page frame ----------

function actions(base, current) {
  const btn = (kind, icon, label, href, key) => `<a class="tdc-hbtn" data-kind="${kind}" data-icon="${icon}" href="${base}${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="tdc-actions" aria-label="Page actions">
${btn('list', 'calendar', 'Today', '/', 'today')}
${btn('list', 'clock', 'Pick a day', '/day', 'day')}
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

// ---------- The patient panel (opened from a row) ----------

function chip(text, status) { return `<span class="tdc-chip"${status ? ` data-status="${status}"` : ''}>${esc(text)}</span>`; }

function renderPanel(p, { today, base, showFinder = false }) {
  const a = p.appt;
  const t = a ? clock(a.Time || a.AptDateTime) : null;
  const head = `<button class="tdc-btn" type="button" data-close style="float:right;margin:0 0 8px 12px">Close</button>
<h2 id="ds-panel-title" tabindex="-1" style="outline:none">${esc(fullName(p.name))} <span class="tdc-id tdc-mono" style="font-weight:400;font-size:14px;color:var(--tdc-muted)">#${esc(p.patNum)}</span></h2>
${a ? `<p class="tdc-muted" style="margin:0 0 4px"><span class="tdc-mono">${esc(t ? t.text + ' ' + t.ap : '')}</span> · ${esc(a.OpName || '')} · ${esc(a.Provider || '')}${a.Hygienist ? ' / ' + esc(a.Hygienist) : ''} · ${a.Minutes ? esc(a.Minutes) + ' min' : ''}</p>
<div class="tdc-row-chips">${String(a.Procedures || '').split(/,\s*/).filter(Boolean).map((x) => chip(x)).join('')}${a.IsNewPatient ? chip('New patient', 'info') : ''}${a.Confirmed ? chip(a.Confirmed) : ''}</div>` : ''}`;

  const planned = p.planned.length
    ? `<section class="tdc-list" aria-label="Planned, not scheduled">
${p.planned.map((x) => `<div class="tdc-row" data-status="${x.priority ? 'warn' : 'new'}">
  <div class="tdc-row-main">
    <p class="tdc-row-title"><span class="tdc-mono">${esc(x.code)}</span> ${esc(x.descript)}</p>
    <div class="tdc-row-chips">${x.tooth ? chip('#' + x.tooth + (x.surf ? ' ' + x.surf : '')) : x.surf ? chip(x.surf) : ''}${x.priority ? chip(/^\d+$/.test(x.priority) ? 'Priority ' + x.priority : x.priority, 'warn') : ''}${x.dateTP ? chip('Planned ' + shortDate(x.dateTP, today)) : ''}</div>
  </div>
  <div class="tdc-row-side" style="color:var(--tdc-ink);font-weight:700;font-size:15px">${esc(money(x.fee))}</div>
</div>`).join('\n')}
</section>`
    : `<div class="tdc-empty"><p>Nothing waiting</p>No planned treatment that isn't already scheduled (hygiene isn't counted).</div>`;

  const xrays = p.xrays.length
    ? `<section class="tdc-list" aria-label="X-rays">
${p.xrays.map((x) => `<div class="tdc-row" data-status="${x.status}">
  <div class="tdc-row-main">
    <p class="tdc-row-title">${esc(x.name)}</p>
    <div class="tdc-row-chips">${chip(x.label, x.status)}${x.limit ? chip(x.limit) : ''}</div>
    <div class="tdc-row-sub">Last taken: <span class="tdc-mono">${x.last ? esc(shortDate(x.last, today)) : 'never'}</span></div>
  </div>
  <div class="tdc-row-side">${x.next ? `<div>Next covered</div><div${x.status === 'alert' || x.status === 'warn' ? ' class="tdc-urgent"' : ' style="color:var(--tdc-ink)"'}>${esc(shortDate(x.next, today))}</div>` : '<div>—</div>'}</div>
</div>`).join('\n')}
</section>
<p class="tdc-muted" style="font-size:13px;margin:6px 0 0">From the primary plan's frequency limits and the dates x-rays were taken. Not a live check with the insurer.</p>`
    : `<div class="tdc-empty"><p>No x-ray limits on file</p>No insurance frequency limits or x-ray history found for this patient.</div>`;

  const lab = (l) => `<div class="tdc-row" data-status="${l.status}">
  <div class="tdc-row-main">
    <p class="tdc-row-title">${esc(l.lab)} <span class="tdc-id">#${esc(l.id)}</span></p>
    <div class="tdc-row-chips">${chip(l.label, l.status)}${l.sent ? chip('Sent ' + shortDate(l.sent, today)) : ''}</div>
    ${l.instructions ? `<div class="tdc-row-sub">${esc(l.instructions)}</div>` : ''}
  </div>
  <div class="tdc-row-side">${l.due ? `<div${l.status === 'alert' ? ' class="tdc-urgent"' : ''}>Due ${esc(shortDate(l.due, today))}</div>` : '<div>No due date</div>'}${l.seat ? `<div>Seat ${esc(shortDate(l.seat, today))}</div>` : ''}</div>
</div>`;
  const labsHere = a
    ? (p.labsHere.length ? `<section class="tdc-list">${p.labsHere.map(lab).join('')}</section>` : `<div class="tdc-empty"><p>No lab case</p>No open lab case is tied to this appointment.</div>`)
    : '';
  const labsOther = p.labsOther.length ? `<h3 class="tdc-section-title" style="font-size:18px">${a ? 'Other open lab cases' : 'Open lab cases'}</h3><section class="tdc-list">${p.labsOther.map(lab).join('')}</section>` : (a ? '' : `<h3 class="tdc-section-title" style="font-size:18px">Open lab cases</h3><div class="tdc-empty"><p>None</p>No open lab cases for this patient.</div>`);

  return `${head}
<h3 class="tdc-section-title" style="font-size:18px;display:flex;gap:10px;align-items:baseline">Planned, not scheduled <span class="tdc-mono" style="margin-left:auto;font-size:16px">${esc(money(p.total))}</span></h3>
${planned}
<h3 class="tdc-section-title" style="font-size:18px">X-rays</h3>
${xrays}
${a ? '<h3 class="tdc-section-title" style="font-size:18px">Lab cases for this visit</h3>' : ''}
${labsHere}
${labsOther}
<div class="tdc-btn-row" style="margin-top:18px">
${showFinder ? `<a class="tdc-btn" href="/m/finder/">Open the Treatment Finder</a>` : ''}
<button class="tdc-btn tdc-btn-primary" type="button" data-close>Close</button>
</div>`;
}

const panelShell = `<div class="tdc-scrim" id="ds-panel" hidden>
  <div class="tdc-dialog tdc-sheet" role="dialog" aria-modal="true" aria-labelledby="ds-panel-title" style="width:min(720px,100%)">
    <div id="ds-panel-body"></div>
  </div>
</div>`;

// ---------- Today / any day ----------

function timeGroup(hour) { return hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'; }

function dayRow(r, { base, today, date }) {
  const a = r.appt;
  const t = clock(a.Time || a.AptDateTime) || { text: '', ap: '', hour: 0 };
  const p = r.panel;
  const procs = String(a.Procedures || '').split(/,\s*/).filter(Boolean);
  const labChip = p.labsHere.length ? chip(p.labsHere.some((l) => l.status === 'alert') ? 'Lab late' : p.labsHere.every((l) => l.status === 'ok') ? 'Lab back' : 'Lab not back', p.labsHere.every((l) => l.status === 'ok') ? 'ok' : p.labsHere.some((l) => l.status === 'alert') ? 'alert' : 'warn') : '';
  const covered = p.xrays.filter((x) => x.coveredToday).map((x) => x.name);
  const xrayChips = covered.length ? chip(`X-rays covered: ${covered.join(', ')}`, p.xrays.some((x) => x.status === 'alert') ? 'warn' : 'info') : '';
  const href = `${base}/patient?patient=${a.PatNum}&apt=${a.AptNum}&date=${date}`;
  const search = [a.LName, a.FName, a.Preferred, a.PatNum, a.Procedures, a.OpName, a.Provider, a.Hygienist].join(' ').toLowerCase();
  return `<div class="tdc-row" data-status="${r.status}" data-apt="${esc(a.AptNum)}" data-search="${esc(search)}" data-prov="${esc(a.Provider || '')}" data-hyg="${esc(a.Hygienist || '')}" data-op="${esc(a.OpName || '')}" data-time="${esc(timeGroup(t.hour))}" data-f-lab="${r.labNotBack ? 1 : 0}" data-f-planned="${p.planned.length ? 1 : 0}" data-f-xray="${p.xrayDue ? 1 : 0}" data-f-done="${r.complete ? 1 : 0}" data-broken="${r.broken ? 1 : 0}" style="cursor:pointer">
  <div class="tdc-row-main">
    <p class="tdc-row-title"><span class="tdc-mono" style="font-weight:700">${esc(t.text)}</span> <span class="tdc-mono tdc-muted" style="font-size:13px;font-weight:400">${esc(t.ap)}</span> · <a href="${esc(href)}" data-panel="${esc(a.AptNum)}" style="color:inherit;text-decoration:none">${esc(fullName(a))}</a> <span class="tdc-id">#${esc(a.PatNum)}</span></p>
    <div class="tdc-row-chips">${procs.slice(0, 5).map((x) => chip(x)).join('')}${procs.length > 5 ? chip(`+${procs.length - 5}`) : ''}${a.IsNewPatient ? chip('New patient', 'info') : ''}${r.broken ? chip('Broken', 'new') : ''}${r.complete ? chip('Done', 'ok') : ''}${labChip}${xrayChips}</div>
    <div class="tdc-row-sub">${a.Minutes ? esc(a.Minutes) + ' min · ' : ''}${esc(a.OpName || '')} · ${esc(a.Provider || '')}${a.Hygienist ? ' / ' + esc(a.Hygienist) : ''}${a.Confirmed ? ' · ' + esc(a.Confirmed) : ''}</div>
  </div>
  <div class="tdc-row-side">${p.planned.length ? `<div${r.complete ? '' : ' style="color:var(--tdc-ink);font-weight:700;font-size:15px"'}>${esc(money(p.total))}</div><div>${esc(plural(p.planned.length, 'planned item'))}</div>` : '<div>Nothing planned</div>'}</div>
</div>`;
}

function dayPage(d, { base, today, current, showBroken }) {
  const isToday = d.date === today;
  const title = isToday ? 'Today' : shortDate(d.date, today);
  const c = d.counts;
  const tile = (key, status, icon, label, short, count, selected) => `<button class="tdc-stat" type="button" data-filter="${key}" data-status="${status}" aria-selected="${selected ? 'true' : 'false'}"><span class="tdc-stat-count">${count}</span><span data-icon="${icon}"></span><span class="tdc-stat-label"${short ? ` data-short="${short}"` : ''}>${label}</span></button>`;
  const provs = [...new Set(d.rows.flatMap((r) => [r.appt.Provider, r.appt.Hygienist]).filter(Boolean))].sort();
  const ops = [...new Set(d.rows.map((r) => r.appt.OpName).filter(Boolean))].sort();
  const b = esc(base);
  const prev = addDays(d.date, -1); const next = addDays(d.date, 1);
  const groups = ['Morning', 'Afternoon', 'Evening'];
  const rows = d.rows.filter((r) => showBroken || !r.broken);
  const list = groups.map((g) => {
    const rs = rows.filter((r) => timeGroup((clock(r.appt.Time || r.appt.AptDateTime) || { hour: 0 }).hour) === g);
    if (!rs.length) return '';
    return `<h3 class="tdc-gh" data-gk="${g}"><span>${g}</span><span class="tdc-gcount">${rs.length}</span></h3>\n${rs.map((r) => dayRow(r, { base: b, today, date: d.date })).join('\n')}`;
  }).join('\n');
  const panels = rows.map((r) => `<template id="ds-p-${esc(r.appt.AptNum)}">${renderPanel(r.panel, { today, base: b })}</template>`).join('\n');
  const dayWord = isToday ? 'today' : daysBetween(today, d.date) === 1 ? 'tomorrow' : 'on this day';

  return page({
    base, title, current,
    body: `<nav class="tdc-stats" aria-label="Show">
${tile('all', 'accent', 'calendar', 'Patients', '', c.all, true)}
${tile('lab', 'alert', 'flask', 'Lab not back', 'Lab', c.lab, false)}
${tile('planned', 'warn', 'list', 'Planned work', 'Planned', c.planned, false)}
${tile('xray', 'info', 'tooth', 'X-rays covered', 'X-rays', c.xray, false)}
${tile('done', 'ok', 'check', 'Done', '', c.done, false)}
</nav>
<header class="tdc-pagehead">
  <h2><span data-icon="calendar"></span>${esc(isToday ? 'Today' : 'Schedule')} · ${esc(shortDate(d.date, today))}</h2>
  <span class="tdc-count" id="ds-count">${esc(plural(c.all, 'patient'))}</span>
  <p class="tdc-help">Everyone scheduled ${esc(dayWord)}. Tap a patient to see planned treatment that isn't scheduled (hygiene left out), x-rays and insurance limits, and lab cases for the visit.</p>
</header>
<div class="tdc-btn-row" style="margin:0 0 12px;gap:8px">
  <a class="tdc-btn" href="${b}/day?date=${prev}" aria-label="Previous day, ${esc(shortDate(prev, today))}">‹ Prev</a>
  <form method="get" action="${b}/day" id="ds-daypick" style="margin:0">
    <input type="date" name="date" value="${esc(d.date)}" aria-label="Pick a day" style="min-height:44px;padding:0 10px;font:inherit;font-family:var(--tdc-font-mono);color:var(--tdc-ink);background:var(--tdc-sunk);border:1px solid var(--tdc-line);border-radius:10px">
  </form>
  <a class="tdc-btn" href="${b}/day?date=${next}" aria-label="Next day, ${esc(shortDate(next, today))}">Next ›</a>
  ${isToday ? '' : `<a class="tdc-btn" href="${b}/">Today</a>`}
</div>
<div class="tdc-find">
  <input type="search" id="ds-search" placeholder="Search name, patient #, procedure, chair…" aria-label="Search">
  <select id="ds-prov" aria-label="Provider"><option value="">All providers</option>${provs.map((p) => `<option>${esc(p)}</option>`).join('')}</select>
  <select id="ds-op" aria-label="Chair"><option value="">All chairs</option>${ops.map((p) => `<option>${esc(p)}</option>`).join('')}</select>
  <select id="ds-broken" aria-label="Broken appointments" data-href-0="${b}/${isToday ? '' : `day?date=${d.date}`}" data-href-1="${b}/${isToday ? '?' : `day?date=${d.date}&`}broken=1"><option value="0"${showBroken ? '' : ' selected'}>Without broken</option><option value="1"${showBroken ? ' selected' : ''}>With broken</option></select>
</div>
<div class="tdc-groupby">
  <span class="tdc-seg-label">Group by</span>
  <div class="tdc-seg" role="group" aria-label="Group by" data-remember="daysheet-groupby" id="ds-groupby">
    <button type="button" data-group="time" aria-pressed="true">Time</button>
    <button type="button" data-group="prov" aria-pressed="false">Provider</button>
    <button type="button" data-group="op" aria-pressed="false">Chair</button>
  </div>
</div>
<section class="tdc-list" id="ds-list" aria-label="Appointments">
${list || ''}
</section>
<div class="tdc-empty" id="ds-empty"${rows.length ? ' hidden' : ''}><p>${rows.length ? 'No patients match' : 'Nobody scheduled'}</p>${rows.length ? 'Try another tile or <a href="#" id="ds-clear">Clear search</a>.' : `No appointments ${esc(dayWord)}.`}</div>
${panels}
${panelShell}`,
  });
}

// ---------- Unscheduled ----------

function ageGroup(oldest, today) {
  if (!oldest) return { key: 'new', label: 'No plan date' };
  const days = daysBetween(oldest, today);
  if (days > 365) return { key: 'year', status: 'alert', label: 'Over a year' };
  if (days > 182) return { key: 'half', status: 'warn', label: '6 to 12 months' };
  return { key: 'recent', status: 'new', label: 'Under 6 months' };
}

function unscheduledPage(u, { base, today }) {
  const b = esc(base);
  const pats = u.patients.map((p) => ({ ...p, age: ageGroup(p.oldest, today) })).sort((x, y) => y.total - x.total);
  const total = pats.reduce((s, p) => s + p.total, 0);
  const n = (k) => pats.filter((p) => p.age.key === k).length;
  const tile = (key, status, icon, label, short, count, sel) => `<button class="tdc-stat" type="button" data-filter="${key}" data-status="${status}" aria-selected="${sel ? 'true' : 'false'}"><span class="tdc-stat-count">${count}</span><span data-icon="${icon}"></span><span class="tdc-stat-label"${short ? ` data-short="${short}"` : ''}>${label}</span></button>`;
  const order = [['year', 'alert', 'Planned over a year ago'], ['half', 'warn', 'Planned 6 to 12 months ago'], ['recent', 'new', 'Planned in the last 6 months'], ['new', 'new', 'No plan date']];
  const row = (p) => `<div class="tdc-row" data-status="${p.age.status || 'new'}" data-age="${p.age.key}" data-total="${p.total}" data-search="${esc([p.LName, p.FName, p.PatNum].join(' ').toLowerCase())}" style="cursor:pointer">
  <div class="tdc-row-main">
    <p class="tdc-row-title"><a href="${b}/patient?patient=${esc(p.PatNum)}" data-fetch="${esc(p.PatNum)}" style="color:inherit;text-decoration:none">${esc(fullName(p))}</a> <span class="tdc-id">#${esc(p.PatNum)}</span></p>
    <div class="tdc-row-chips">${chip(plural(p.count, 'procedure'))}${p.oldest ? chip('Oldest plan ' + shortDate(p.oldest, today), p.age.status === 'alert' ? 'alert' : p.age.status === 'warn' ? 'warn' : undefined) : ''}</div>
  </div>
  <div class="tdc-row-side"><div style="color:var(--tdc-ink);font-weight:700;font-size:16px">${esc(money(p.total))}</div></div>
</div>`;
  const list = order.map(([k, s, label]) => {
    const rs = pats.filter((p) => p.age.key === k);
    if (!rs.length) return '';
    return `<h3 class="tdc-gh" data-status="${s}" data-gk="${k}"><span>${label}</span><span class="tdc-gcount">${rs.length}</span><span class="tdc-mono" style="margin-left:auto;text-transform:none">${esc(money(rs.reduce((x, p) => x + p.total, 0)))}</span></h3>\n${rs.map(row).join('\n')}`;
  }).join('\n');
  return page({
    base, title: 'Unscheduled treatment', current: 'unscheduled',
    body: `<nav class="tdc-stats" aria-label="Show">
${tile('all', 'accent', 'list', 'All patients', 'All', pats.length, true)}
${tile('year', 'alert', 'alert', 'Over a year', '1 yr+', n('year'), false)}
${tile('half', 'warn', 'clock', '6 to 12 months', '6–12 mo', n('half'), false)}
${tile('recent', 'new', 'pending', 'Under 6 months', '< 6 mo', n('recent'), false)}
</nav>
<header class="tdc-pagehead">
  <h2><span data-icon="dollar"></span>Unscheduled treatment</h2>
  <span class="tdc-count" id="ds-count">${esc(plural(pats.length, 'patient'))} · ${esc(money(total))}</span>
  <p class="tdc-help">Active patients with treatment planned but not on a scheduled appointment. Hygiene isn't counted. Tap a patient for details; build call lists in the Treatment Finder.</p>
</header>
${u.truncated ? '<div class="tdc-callout" data-status="warn" role="status"><span data-icon="alert"></span><div><strong>List cut short</strong>There are more planned procedures than this page can show. Use the Treatment Finder to narrow it down.</div></div>' : ''}
<div class="tdc-find">
  <input type="search" id="ds-search" placeholder="Search name or patient #…" aria-label="Search">
  <select id="ds-min" aria-label="Amount"><option value="0">Any amount</option><option value="500">$500 and up</option><option value="1000">$1,000 and up</option><option value="2500">$2,500 and up</option></select>
</div>
<div class="tdc-groupby">
  <span class="tdc-seg-label">Group by</span>
  <div class="tdc-seg" role="group" aria-label="Group by" data-remember="daysheet-unsched-groupby" id="ds-groupby">
    <button type="button" data-group="age" aria-pressed="true">Plan age</button>
    <button type="button" data-group="amount" aria-pressed="false">Amount</button>
  </div>
  <a class="tdc-btn" href="/m/finder/" style="margin-left:auto">Treatment Finder</a>
</div>
<section class="tdc-list" id="ds-list" aria-label="Patients">
${list}
</section>
<div class="tdc-empty" id="ds-empty"${pats.length ? ' hidden' : ''}><p>${pats.length ? 'No patients match' : 'All caught up'}</p>${pats.length ? 'Try another tile or <a href="#" id="ds-clear">Clear search</a>.' : 'No planned treatment is waiting to be scheduled.'}</div>
${panelShell}`,
  });
}

/** The panel as its own page (no-JavaScript fallback and direct links). */
function patientPage(panel, { base, today, back }) {
  return page({
    base, title: fullName(panel.name), current: '',
    body: `<p style="margin:0 0 12px"><a class="tdc-btn" href="${esc(back)}">‹ Back</a></p>
<div class="tdc-card">${renderPanel(panel, { today, base: esc(base), showFinder: true }).replace(/<button class="tdc-btn tdc-btn-primary" type="button" data-close>Close<\/button>/, '')}</div>`,
  });
}

module.exports = { esc, money, fullName, shortName, page, problemPage, renderPanel, dayPage, unscheduledPage, patientPage, compact };
