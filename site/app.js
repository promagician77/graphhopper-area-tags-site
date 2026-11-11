// Isle of Wight chart: roads, the four test areas and the 27 routes, drawn from the benchmark's own output.
(function () {
  const COS = Math.cos((50.65 * Math.PI) / 180);
  const css = getComputedStyle(document.documentElement);
  const C = (n) => css.getPropertyValue(n).trim();
  const COL = { sea: C('--sea'), land: C('--land'), road: C('--road'), tags: C('--tags'), poly: C('--poly'), mid: C('--mid'), none: C('--none'), ink: C('--ink') };

  const canvas = document.getElementById('map');
  const stage = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const list = document.getElementById('journeys');
  const readout = document.getElementById('readout');
  const layerAreas = document.getElementById('layer-areas');
  const layerTagged = document.getElementById('layer-tagged');
  const layerWrong = document.getElementById('layer-wrong');
  const layerNone = document.getElementById('layer-none');

  let D = null, P = null;
  let view = { cx: 0, cy: 0, k: 1 };
  let selected = null;
  let w = 0, h = 0, dpr = 1, queued = false;

  // ---------- data ----------
  function decode(arr, from) {
    const out = [];
    let x = 0, y = 0;
    for (let i = from; i < arr.length; i += 2) {
      x += arr[i]; y += arr[i + 1];
      out.push(x * COS, y);
    }
    return out;
  }
  function addLine(path, pts) {
    path.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
  }
  function addRings(path, rings) {
    for (const r of rings) { addLine(path, decode(r, 0)); path.closePath(); }
  }
  function bounds(ptsList) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const pts of ptsList) for (let i = 0; i < pts.length; i += 2) {
      if (pts[i] < a) a = pts[i]; if (pts[i] > c) c = pts[i];
      if (pts[i + 1] < b) b = pts[i + 1]; if (pts[i + 1] > d) d = pts[i + 1];
    }
    return [a, b, c, d];
  }
  function prepare(d) {
    const p = { land: new Path2D(), areas: [], roads: new Path2D(), tagged: [], wrong: new Path2D(), routes: {} };
    addRings(p.land, d.land);
    for (const a of d.areas) { const ap = new Path2D(); addRings(ap, a.rings); p.areas.push(ap); p.tagged.push(new Path2D()); }
    const all = [];
    for (const r of d.roads) {
      const pts = decode(r, 1);
      addLine(p.roads, pts);
      for (let i = 0; i < d.areas.length; i++) if (r[0] & (1 << i)) addLine(p.tagged[i], pts);
    }
    for (const r of d.wrong) addLine(p.wrong, decode(r.c, 0));
    const landPts = d.land.map((r) => decode(r, 0));
    p.box = bounds(landPts);
    for (const j of d.journeys) {
      const r = {};
      for (const key of ['tags', 'mid', 'none']) if (j[key]) {
        const pts = decode(j[key].c, 0); const path = new Path2D(); addLine(path, pts);
        r[key] = { path, pts };
      }
      r.box = bounds(Object.values(r).map((x) => x.pts));
      p.routes[j.id] = r;
    }
    return p;
  }

  // ---------- view ----------
  function safeRect() {
    // the part of the canvas not covered by the floating panels (desktop only)
    let l = 16, t = 16, r = w - 16, b = h - 16;
    const box = stage.getBoundingClientRect();
    for (const sel of ['.cartouche', '.console', '.readout']) {
      const el = document.querySelector(sel);
      if (!el || getComputedStyle(el).position !== 'absolute') continue;
      const e = el.getBoundingClientRect();
      if (sel === '.cartouche') l = Math.max(l, e.right - box.left + 16);
      if (sel === '.console') r = Math.min(r, e.left - box.left - 16);
      if (sel === '.readout') b = Math.min(b, e.top - box.top - 10);
    }
    if (r - l < 200) { l = 16; r = w - 16; }
    if (b - t < 200) { t = 16; b = h - 16; }
    return { l, t, r, b };
  }
  function fit(box, pad) {
    const s = safeRect();
    const bw = (box[2] - box[0]) || 1, bh = (box[3] - box[1]) || 1;
    const k = Math.min((s.r - s.l - 2 * pad) / bw, (s.b - s.t - 2 * pad) / bh);
    const scx = (s.l + s.r) / 2, scy = (s.t + s.b) / 2;
    view.k = k;
    view.cx = (box[0] + box[2]) / 2 - (scx - w / 2) / k;
    view.cy = (box[1] + box[3]) / 2 + (scy - h / 2) / k;
    schedule();
  }
  const toScreen = (x, y) => [(x - view.cx) * view.k + w / 2, h / 2 - (y - view.cy) * view.k];

  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    schedule();
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(draw); } }

  // ---------- drawing ----------
  function world() {
    const k = view.k;
    ctx.setTransform(dpr * k, 0, 0, -dpr * k, dpr * (w / 2 - view.cx * k), dpr * (h / 2 + view.cy * k));
  }
  function line(path, color, px, dash) {
    ctx.strokeStyle = color; ctx.lineWidth = px / view.k;
    ctx.setLineDash(dash ? dash.map((v) => v / view.k) : []);
    ctx.stroke(path);
  }
  function draw() {
    queued = false;
    if (!P) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COL.sea; ctx.fillRect(0, 0, canvas.width, canvas.height);
    world();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = COL.land; ctx.fill(P.land, 'evenodd');
    line(P.land, '#7f9aa5', 1);
    const zoom = view.k / P.k0;
    if (layerAreas.checked) P.areas.forEach((a) => { ctx.fillStyle = 'rgba(168,35,111,0.07)'; ctx.fill(a, 'evenodd'); });
    line(P.roads, COL.road, Math.min(2.2, 0.55 * Math.sqrt(zoom)));
    const t = layerTagged.value;
    if (t !== '') line(P.tagged[+t], COL.tags, Math.min(3, 1.3 * Math.sqrt(zoom)));
    if (layerAreas.checked) P.areas.forEach((a) => line(a, COL.poly, 1.6, [7, 4]));
    if (layerWrong.checked) { line(P.wrong, '#ffffff', 6); line(P.wrong, COL.mid, 3.2); }
    if (selected) {
      const r = P.routes[selected.id];
      if (r.none && layerNone.checked) line(r.none.path, COL.none, 2.6, [1, 5]);
      // shortcut route underneath as a wide amber band, so shared roads show blue edged in amber
      if (r.mid) { line(r.mid.path, '#ffffff', 13); line(r.mid.path, COL.mid, 10); }
      line(r.tags.path, '#ffffff', 7);
      line(r.tags.path, COL.tags, 5);
      line(r.tags.path, COL.poly, 2, [8, 7]);
    }
    // screen-space labels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.setLineDash([]);
    ctx.font = 'italic 400 15px Newsreader, Georgia, serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const town of D.towns) {
      const [x, y] = toScreen(town.x * COS, town.y);
      if (x < -50 || y < -20 || x > w + 50 || y > h + 20) continue;
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(238,227,193,0.95)'; ctx.strokeText(town.name, x + 5, y - 9);
      ctx.fillStyle = COL.ink; ctx.fillText(town.name, x + 5, y - 9);
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill();
    }
    if (selected) {
      const r = P.routes[selected.id].tags.pts;
      marker(r[0], r[1], selected.from, 'A');
      marker(r[r.length - 2], r[r.length - 1], selected.to, 'B');
    }
  }
  function marker(x, y, name, letter) {
    const [sx, sy] = toScreen(x, y);
    ctx.beginPath(); ctx.arc(sx, sy, 9, 0, 7);
    ctx.fillStyle = COL.ink; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '700 11px Archivo, Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(letter, sx, sy + 0.5);
    ctx.textAlign = 'left'; ctx.font = 'italic 500 17px Newsreader, Georgia, serif';
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(name, sx + 13, sy);
    ctx.fillStyle = COL.ink; ctx.fillText(name, sx + 13, sy);
  }

  // ---------- readout ----------
  const fmt = (n, d) => n.toFixed(d);
  function setJourney(j, refit) {
    selected = j;
    for (const b of list.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.id === j.id));
    const mid = j.mid ? (j.mid_path_differs ? 'different path' : 'same path, different time') : 'same route';
    const ruleNote = j.none ? `${fmt(j.none.km, 2)} km` : 'same route';
    readout.innerHTML =
      `<p class="place">${j.from} → ${j.to}</p>` +
      `<table><tbody>` +
      `<tr><th><span class="swatch tags"></span>Area tags</th><td class="num">${fmt(j.tags.km, 2)} km</td><td class="num">${fmt(j.tags.min, 1)} min</td><td class="num">${fmt(j.ms.precomputed_tags, 1)} ms</td></tr>` +
      `<tr><th><span class="swatch poly"></span>Polygons in request</th><td class="num" colspan="2">${j.identical ? 'identical route' : 'DIFFERENT'}</td><td class="num">${fmt(j.ms.polygons_in_request, 1)} ms</td></tr>` +
      `<tr><th><span class="swatch mid"></span>Middle-point shortcut</th><td class="num">${fmt(j.mid_km, 2)} km</td><td class="num">${fmt(j.mid_min, 1)} min</td><td class="num">${mid}</td></tr>` +
      `<tr><th><span class="swatch none"></span>No area rule</th><td class="num" colspan="2">${ruleNote}</td><td class="num">${fmt(j.ms.no_area_rule, 1)} ms</td></tr>` +
      `</tbody></table>`;
    if (refit) fit(P.routes[j.id].box, 40); else schedule();
  }

  // ---------- interaction ----------
  const pointers = new Map();
  let pinch = null;
  function zoomAt(f, sx, sy) {
    const k2 = Math.max(P.k0 * 0.6, Math.min(P.k0 * 60, view.k * f));
    const wx = view.cx + (sx - w / 2) / view.k, wy = view.cy - (sy - h / 2) / view.k;
    view.k = k2;
    view.cx = wx - (sx - w / 2) / k2; view.cy = wy + (sy - h / 2) / k2;
    schedule();
  }
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.offsetX, e.offsetY]); });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pointers.size === 1) {
      view.cx -= (e.offsetX - prev[0]) / view.k; view.cy += (e.offsetY - prev[1]) / view.k; schedule();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoomAt(dist / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      pinch = dist;
    }
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0016), e.offsetX, e.offsetY); }, { passive: false });
  canvas.addEventListener('dblclick', (e) => zoomAt(2, e.offsetX, e.offsetY));
  canvas.addEventListener('keydown', (e) => {
    const step = 80 / view.k;
    const keys = { ArrowLeft: () => (view.cx -= step), ArrowRight: () => (view.cx += step), ArrowUp: () => (view.cy += step), ArrowDown: () => (view.cy -= step),
      '+': () => zoomAt(1.5, w / 2, h / 2), '=': () => zoomAt(1.5, w / 2, h / 2), '-': () => zoomAt(1 / 1.5, w / 2, h / 2), '0': () => fit(P.box, 20) };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); schedule(); }
  });
  document.getElementById('zoom-in').onclick = () => zoomAt(1.6, w / 2, h / 2);
  document.getElementById('zoom-out').onclick = () => zoomAt(1 / 1.6, w / 2, h / 2);
  document.getElementById('zoom-fit').onclick = () => fit(P.box, 20);
  [layerAreas, layerTagged, layerWrong, layerNone].forEach((el) => el.addEventListener('change', schedule));
  layerWrong.addEventListener('change', () => { if (layerWrong.checked) fit(P.box, 20); });
  window.addEventListener('resize', () => { resize(); if (P) fit(selected ? P.routes[selected.id].box : P.box, 40); });
  document.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => {
    const j = D.journeys.find((x) => x.id === b.dataset.show);
    setJourney(j, true);
    document.querySelector('.chart').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));

  // ---------- chart tooltips ----------
  const tip = document.createElement('div');
  tip.className = 'tip'; tip.setAttribute('role', 'status'); document.body.appendChild(tip);
  function showTip(el, x, y) { tip.textContent = el.dataset.tip; tip.style.left = Math.min(x + 14, innerWidth - 270) + 'px'; tip.style.top = (y + 14) + 'px'; tip.classList.add('on'); }
  document.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('pointerenter', (e) => showTip(el, e.clientX, e.clientY));
    el.addEventListener('pointermove', (e) => showTip(el, e.clientX, e.clientY));
    el.addEventListener('pointerleave', () => tip.classList.remove('on'));
    el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); showTip(el, r.right, r.top); });
    el.addEventListener('blur', () => tip.classList.remove('on'));
  });

  // ---------- start ----------
  resize();
  fetch('data/map.json').then((r) => r.json()).then((d) => {
    D = d; P = prepare(d);
    document.querySelector('.loading').remove();
    for (const j of d.journeys) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.id = j.id; b.setAttribute('aria-pressed', 'false');
      const flag = j.mid ? (j.mid_path_differs ? 'shortcut: other path' : 'shortcut: other time') : '';
      b.innerHTML = `<span class="jid">${j.id}</span><span>${j.from} → ${j.to}</span><span class="flag">${flag}</span>`;
      b.addEventListener('click', () => setJourney(j, true));
      li.appendChild(b); list.appendChild(li);
    }
    const q = new URLSearchParams(location.search);
    if (q.has('bare')) document.body.classList.add('bare');
    if (q.has('wrong')) layerWrong.checked = true;
    resize();
    fit(P.box, 10);
    P.k0 = view.k;
    setJourney(d.journeys.find((j) => j.id === (q.get('j') || 'J22')), false);
    document.body.dataset.ready = '1';
  }).catch(() => { document.querySelector('.loading').textContent = 'Could not load the map data.'; });
})();
