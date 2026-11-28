'use strict';
// Dates for the office's own time zone (Toledo, Oregon), whatever time zone
// the server runs in. Dates are plain "yyyy-MM-dd" strings everywhere.

const OFFICE_TZ = process.env.OFFICE_TZ || 'America/Los_Angeles';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's date in the office, "yyyy-MM-dd". */
function officeToday(now = new Date(), tz = OFFICE_TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Accepts "2026-11-16" or "20261116"; returns "2026-11-16" or null. */
function parseDate(s) {
  const m = String(s || '').trim().match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  if (+m[1] < 1900 || +m[1] > 2200) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** "2026-11-16" -> "20261116" (used in tile links). */
const compact = (d) => String(d).replace(/-/g, '');

function toUtc(d) { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)); }

function addDays(d, n) { return new Date(toUtc(d).getTime() + n * DAY_MS).toISOString().slice(0, 10); }

/** Whole days from a to b (b - a). */
function daysBetween(a, b) { return Math.round((toUtc(b) - toUtc(a)) / DAY_MS); }

/** Open Dental's "no date" values (0001-01-01, 1880-...) -> null; else "yyyy-MM-dd". */
function odDate(v) {
  const s = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s < '1900-01-01') return null;
  return s;
}

/** "2026-11-16" -> "Mon, Nov 16" (DESIGN.md §7). Adds the year when it isn't this year. */
function shortDate(d, today) {
  if (!d) return '';
  const opts = { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' };
  if (today && d.slice(0, 4) !== today.slice(0, 4)) opts.year = 'numeric';
  return new Intl.DateTimeFormat('en-US', opts).format(toUtc(d));
}

/** "2026-11-16" -> "Monday, November 16, 2026". */
function longDate(d) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(toUtc(d));
}

/** "13:30" or "2026-11-16 13:30:00" -> "1:30". Mornings and afternoons are clear from the list. */
function clock(t) {
  const m = String(t || '').match(/(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return '';
  let h = +m[1];
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return { text: `${h}:${m[2]}`, ap, hour: +m[1] };
}

/** "2026-11-16 13:30:00" -> "yyyy-MM-dd" part. */
const datePart = (dt) => odDate(dt);

module.exports = { OFFICE_TZ, officeToday, parseDate, compact, addDays, daysBetween, odDate, shortDate, longDate, clock, datePart };

/** "2026-11-30" + n months (clamped to the month's last day). */
function addMonths(d, n) {
  const [y, m, dd] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(dd, last));
  return t.toISOString().slice(0, 10);
}
module.exports.addMonths = addMonths;
