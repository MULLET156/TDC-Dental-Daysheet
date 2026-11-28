'use strict';
// Office settings (CONTRACT §3, X-TDC-Office): clinic days, closed dates and
// time zone, set once in Dashboard → Settings → Office and sent with every
// request. This module's own .env settings are only the fallback.
//
//   X-TDC-Office: tz=America/Los_Angeles;days=1,2,3,4;closed=2026-12-24,2026-12-25

const { addDays } = require('./dates');

function validTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** -> { tz, days, closed:Set, fromDashboard } ; any missing part uses the fallback. */
function officeFromHeaders(req, fallback) {
  const raw = String((req && req.headers && req.headers['x-tdc-office']) || '');
  const parts = {};
  for (const p of raw.split(';')) {
    const i = p.indexOf('=');
    if (i > 0) parts[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim();
  }
  const tz = parts.tz && validTz(parts.tz) ? parts.tz : fallback.tz;
  const days = parts.days
    ? [...new Set(parts.days.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))]
    : null;
  const closed = parts.closed
    ? parts.closed.split(',').map((x) => x.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 60)
    : [];
  return {
    tz,
    days: days && days.length ? days : fallback.days,
    closed: new Set(closed),
    fromDashboard: Boolean(raw),
  };
}

function dow(d) { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); }

/** Is the office open on this date? */
const isClinicDay = (office, d) => office.days.includes(dow(d)) && !office.closed.has(d);

/** This date, or the next day the office is open (looks ahead up to 60 days). */
function nextClinicDay(office, d) {
  let x = d;
  for (let i = 0; i < 60 && !isClinicDay(office, x); i++) x = addDays(x, 1);
  return x;
}

module.exports = { officeFromHeaders, isClinicDay, nextClinicDay };
