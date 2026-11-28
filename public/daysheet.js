/* Dental Daysheet page script. A file, not inline (CONTRACT §6).
   Status tiles filter the list, search and dropdowns narrow it, "Group by"
   regroups it (remembered on this device), and tapping a patient opens the
   patient panel. No data is stored on the device except the Group by choice. */
(function () {
  'use strict';
  var list = document.getElementById('ds-list');

  // ---------- List: filter, search, group ----------
  if (list) {
    var rows = Array.prototype.slice.call(list.querySelectorAll('.tdc-row'));
    var isDay = !!list.querySelector('[data-apt].tdc-row');
    var isStatic = list.getAttribute('data-static') === '1';
    var withMoney = list.getAttribute('data-money') === '1';
    var search = document.getElementById('ds-search');
    var prov = document.getElementById('ds-prov');
    var op = document.getElementById('ds-op');
    var min = document.getElementById('ds-min');
    var empty = document.getElementById('ds-empty');
    var count = document.getElementById('ds-count');
    var seg = document.getElementById('ds-groupby');
    var tiles = Array.prototype.slice.call(document.querySelectorAll('.tdc-stats .tdc-stat[data-filter]'));
    var filter = 'all';
    var group = seg ? seg.querySelector('[aria-pressed="true"]').getAttribute('data-group') : 'static';
    var countWord = count ? count.textContent : '';

    // Server-rendered headings: remember their label, colour and order, and which rows they held.
    var heads = {};
    var order = 0;
    var current = null;
    Array.prototype.slice.call(list.children).forEach(function (el) {
      if (el.classList.contains('tdc-gh')) {
        current = el.getAttribute('data-gk');
        heads[current] = { name: el.querySelector('span').textContent, status: el.getAttribute('data-status'), sort: order++ };
      } else if (el.classList.contains('tdc-row')) {
        el.setAttribute('data-gk0', current || '');
      }
    });

    var AGE = { year: ['Planned over a year ago', 'alert', 0], half: ['Planned 6 to 12 months ago', 'warn', 1], recent: ['Planned in the last 6 months', 'new', 2], none: ['No plan date', 'new', 3] };
    var INS_ORDER = { left: 0, nomax: 1, used: 2, noins: 3 };
    var TIME = { Morning: 0, Afternoon: 1, Evening: 2 };
    function amountBand(t) {
      t = Number(t);
      if (t >= 5000) return ['$5,000 and up', 0];
      if (t >= 2500) return ['$2,500 to $4,999', 1];
      if (t >= 1000) return ['$1,000 to $2,499', 2];
      if (t >= 500) return ['$500 to $999', 3];
      return ['Under $500', 4];
    }
    function keyOf(r) {
      if (group === 'static') { var k = r.getAttribute('data-gk0'); var h = heads[k] || { name: '', sort: 0 }; return [h.name, h.sort, h.status]; }
      if (group === 'time') { var t = r.getAttribute('data-time'); return [t, TIME[t] || 0, null]; }
      if (group === 'prov') { var p = r.getAttribute('data-hyg') || r.getAttribute('data-prov') || 'No provider'; return [p, p, null]; }
      if (group === 'op') { var o = r.getAttribute('data-op') || 'No chair'; return [o, o, null]; }
      if (group === 'amount') { var a = amountBand(r.getAttribute('data-total')); return [a[0], a[1], null]; }
      if (group === 'ins') { var i = r.getAttribute('data-ins'); var hi = heads['ins:' + i] || { name: i, status: null }; return [hi.name, INS_ORDER[i] || 0, hi.status]; }
      var g = AGE[r.getAttribute('data-age')] || AGE.none;
      return [g[0], g[2], g[1]];
    }
    function matches(r) {
      if (filter !== 'all') {
        if (isDay && r.getAttribute('data-f-' + filter) !== '1') return false;
        if (!isDay && r.getAttribute('data-ins') !== filter) return false;
      }
      var q = search ? search.value.trim().toLowerCase() : '';
      if (q && q.split(/\s+/).some(function (w) { return (r.getAttribute('data-search') || '').indexOf(w) < 0; })) return false;
      if (prov && prov.value && r.getAttribute('data-prov') !== prov.value && r.getAttribute('data-hyg') !== prov.value) return false;
      if (op && op.value && r.getAttribute('data-op') !== op.value) return false;
      if (min && Number(r.getAttribute('data-total')) < Number(min.value)) return false;
      return true;
    }
    function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
    function render() {
      var shown = rows.filter(matches);
      var groups = {}; var list2 = [];
      shown.forEach(function (r) {
        var k = keyOf(r);
        if (!groups[k[0]]) { groups[k[0]] = { name: k[0], sort: k[1], status: k[2], rows: [] }; list2.push(groups[k[0]]); }
        groups[k[0]].rows.push(r);
      });
      list2.sort(function (a, b) { return a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0; });
      while (list.firstChild) list.removeChild(list.firstChild);
      list2.forEach(function (g) {
        var h = document.createElement('h3');
        h.className = 'tdc-gh';
        h.setAttribute('data-gk', group + ':' + g.name);
        if (g.status) h.setAttribute('data-status', g.status);
        var n = document.createElement('span'); n.textContent = g.name; h.appendChild(n);
        var c = document.createElement('span'); c.className = 'tdc-gcount'; c.textContent = String(g.rows.length); h.appendChild(c);
        if (withMoney || isStatic) {
          var tot = document.createElement('span'); tot.className = 'tdc-mono'; tot.style.marginLeft = 'auto'; tot.style.textTransform = 'none';
          tot.textContent = money(g.rows.reduce(function (s, r) { return s + Number(r.getAttribute('data-total') || 0); }, 0));
          h.appendChild(tot);
        }
        list.appendChild(h);
        g.rows.forEach(function (r) { list.appendChild(r); });
      });
      list.hidden = !shown.length;
      if (empty) empty.hidden = !!shown.length || !rows.length;
      if (count) count.textContent = shown.length === rows.length ? countWord : shown.length + ' of ' + rows.length + ' shown';
    }
    tiles.forEach(function (t) {
      t.addEventListener('click', function () {
        filter = t.getAttribute('data-filter');
        tiles.forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        render();
      });
    });
    [search, prov, op, min].forEach(function (el) { if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', render); });
    var clear = document.getElementById('ds-clear');
    if (clear) clear.addEventListener('click', function (e) {
      e.preventDefault();
      if (search) search.value = ''; if (prov) prov.value = ''; if (op) op.value = ''; if (min) min.value = '0';
      if (tiles[0]) tiles[0].click(); else render();
    });
    if (seg) {
      var key = seg.getAttribute('data-remember');
      var buttons = Array.prototype.slice.call(seg.querySelectorAll('button'));
      var pick = function (g) {
        if (!buttons.some(function (b) { return b.getAttribute('data-group') === g; })) return;
        group = g;
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-group') === g ? 'true' : 'false'); });
      };
      try { var saved = localStorage.getItem(key); if (saved) pick(saved); } catch (e) { /* not available */ }
      buttons.forEach(function (b) {
        b.addEventListener('click', function () {
          pick(b.getAttribute('data-group'));
          try { localStorage.setItem(key, group); } catch (e) { /* not available */ }
          render();
        });
      });
    }
    render();
  }

  // ---------- Day picker and the broken-appointments switch ----------
  var dp = document.getElementById('ds-daypick');
  if (dp) dp.querySelector('input[type=date]').addEventListener('change', function () { if (this.value) dp.submit(); });
  var br = document.getElementById('ds-broken');
  if (br) br.addEventListener('change', function () { location.href = br.getAttribute('data-href-' + br.value); });

  // ---------- Patient panel ----------
  var scrim = document.getElementById('ds-panel');
  if (!scrim) return;
  var body = document.getElementById('ds-panel-body');
  var opener = null;
  function show(html) {
    body.innerHTML = html;
    scrim.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    var dlg = scrim.querySelector('.tdc-dialog');
    if (dlg) dlg.scrollTop = 0;
    var h = body.querySelector('h2') || body.querySelector('[data-close]');
    if (h) h.focus({ preventScroll: true });
  }
  function close() {
    scrim.hidden = true;
    body.innerHTML = '';
    document.documentElement.style.overflow = '';
    if (opener && opener.focus) opener.focus();
  }
  function openApt(apt, from) {
    var tpl = document.getElementById('ds-p-' + apt);
    if (!tpl) return false;
    opener = from || null;
    show(tpl.innerHTML);
    return true;
  }
  function openFetched(link) {
    opener = link;
    show('<p class="tdc-muted">Loading…</p>');
    fetch(link.href + (link.href.indexOf('?') < 0 ? '?' : '&') + 'fragment=1', { credentials: 'same-origin', headers: { Accept: 'text/html' } })
      .then(function (r) {
        if (r.status === 401) { location.reload(); throw new Error('logged out'); }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (html) { if (!scrim.hidden) show(html); })
      .catch(function () { if (!scrim.hidden) show('<div class="tdc-callout" data-status="alert" role="alert"><div><strong>Could not load this patient</strong>Open Dental didn\'t answer. Try again in a minute.</div></div><div class="tdc-btn-row"><button class="tdc-btn tdc-btn-primary" type="button" data-close>Close</button></div>'); });
  }
  document.addEventListener('click', function (e) {
    var row = e.target.closest && e.target.closest('#ds-list .tdc-row');
    if (!row) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; // open the full page in a new tab instead
    var link = row.querySelector('[data-panel],[data-fetch]');
    if (!link) return;
    e.preventDefault();
    if (link.hasAttribute('data-panel')) { if (!openApt(link.getAttribute('data-panel'), link)) location.href = link.href; }
    else openFetched(link);
  });
  scrim.addEventListener('click', function (e) {
    if (e.target === scrim || (e.target.closest && e.target.closest('[data-close]'))) close();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !scrim.hidden) close(); });

  // A tile or appointment-book link like ?apt=5372 opens that patient straight away.
  var m = location.search.match(/[?&]apt=(\d+)/);
  if (m) openApt(m[1], null);
})();
