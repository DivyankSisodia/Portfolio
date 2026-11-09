/**
 * Parfame shop dialog: an interactive 2D canvas with three views
 * (price history, retailer comparison, "smells similar" map).
 * Opened from the 3D bottle / holo chart, or from the "Try the shop" button.
 * Data is illustrative sample data for the portfolio demo.
 */

const FONT_MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const FONT_DISPLAY = "'Space Grotesk', system-ui, sans-serif";
const FONT_NEON = "'Orbitron', 'Space Grotesk', sans-serif";
const MONTHS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

const SCENTS = [
  {
    id: 'amber-oud',
    name: 'Amber Oud',
    family: 'Woody amber',
    color: '#ff4fa8',
    history: [4890, 4720, 4980, 4510, 4300, 4420, 3990, 4100, 3720, 3580, 3410, 3249],
    retailers: [
      ['Nykaa', 3890],
      ['Tata Cliq', 3620],
      ['Amazon', 3480],
      ['WhatsApp seller · Delhi', 3249],
      ['Myntra', 3710],
      ['Perfume Lounge', 3990],
    ],
    similar: [
      ['vanilla-noir', 0.88],
      ['rose-smoke', 0.85],
      ['Saffron Leather', 0.81],
      ['Cedar Night', 0.74],
      ['Musk Haze', 0.69],
    ],
  },
  {
    id: 'vanilla-noir',
    name: 'Vanilla Noir',
    family: 'Gourmand oriental',
    color: '#b583ff',
    history: [3520, 3600, 3480, 3550, 3390, 3240, 3300, 3120, 3050, 3180, 2990, 2875],
    retailers: [
      ['Nykaa', 3190],
      ['Tata Cliq', 3050],
      ['Amazon', 2875],
      ['WhatsApp seller · Mumbai', 2940],
      ['Myntra', 3120],
      ['Perfume Lounge', 3290],
    ],
    similar: [
      ['amber-oud', 0.88],
      ['Tonka Silk', 0.83],
      ['rose-smoke', 0.78],
      ['Cocoa Ember', 0.75],
      ['Musk Haze', 0.66],
    ],
  },
  {
    id: 'rose-smoke',
    name: 'Rose Smoke',
    family: 'Smoky floral',
    color: '#4fe6ff',
    history: [5120, 5080, 4950, 5010, 4890, 4760, 4810, 4640, 4580, 4450, 4510, 4390],
    retailers: [
      ['Nykaa', 4790],
      ['Tata Cliq', 4650],
      ['Amazon', 4510],
      ['WhatsApp seller · Jaipur', 4390],
      ['Myntra', 4720],
      ['Perfume Lounge', 4990],
    ],
    similar: [
      ['amber-oud', 0.85],
      ['Oud Petals', 0.82],
      ['vanilla-noir', 0.78],
      ['Incense Bloom', 0.73],
      ['Cedar Night', 0.65],
    ],
  },
];

const HELP = {
  price: 'Hover the line or use the arrow keys to read each month.',
  compare: 'Hover a bar or use the arrow keys. Prices are per bottle, lowest highlighted.',
  similar: 'Hover a scent or use the arrow keys, then click or press Enter to switch to it.',
};

const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const sizeFactor = (size) => (size === 50 ? 0.62 : 1);
const scentById = (id) => SCENTS.find((s) => s.id === id);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function initShop({ reducedMotion = false, onOpen, onClose } = {}) {
  const dialog = document.getElementById('shop');
  if (!dialog) return { open() {}, close() {}, isOpen: () => false };
  const panel = dialog.querySelector('.shop__panel');
  const title = dialog.querySelector('#shop-title');
  const meta = dialog.querySelector('#shop-meta');
  const readout = dialog.querySelector('#shop-readout');
  const help = dialog.querySelector('#shop-help');
  const canvas = dialog.querySelector('.shop__canvas');
  const scentsEl = dialog.querySelector('.shop__scents');
  const tabs = [...dialog.querySelectorAll('[role="tab"]')];
  const sizes = [...dialog.querySelectorAll('[data-size]')];
  const ctx = canvas.getContext('2d');

  const state = { scent: SCENTS[0], tab: 'price', size: 100, index: -1, anim: 1, regions: [] };
  let returnFocus = null;
  let closeTimer = null;
  let raf = 0;
  let animStart = 0;

  // Scent chips
  SCENTS.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.scent = s.id;
    b.style.setProperty('--c', s.color);
    b.innerHTML = `<span class="shop__swatch" aria-hidden="true"></span>${s.name}`;
    scentsEl.appendChild(b);
  });
  const scentButtons = [...scentsEl.querySelectorAll('button')];

  /* ------------------------------ data helpers ----------------------------- */

  const history = () => state.scent.history.map((p) => p * sizeFactor(state.size));
  const retailers = () =>
    state.scent.retailers.map(([name, p]) => ({ name, price: p * sizeFactor(state.size) })).sort((a, b) => a.price - b.price);
  const similar = () =>
    state.scent.similar.map(([ref, score]) => {
      const s = scentById(ref);
      return { name: s ? s.name : ref, id: s?.id ?? null, color: s?.color ?? '#ffd0e6', score };
    });

  /* -------------------------------- drawing -------------------------------- */

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function draw() {
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    if (!w || !h) return;
    const a = easeOut(state.anim);
    if (state.tab === 'price') drawPrice(w, h, a);
    else if (state.tab === 'compare') drawCompare(w, h, a);
    else drawSimilar(w, h, a);
  }

  function glowStroke(color, width, blur, path) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    path();
    ctx.stroke();
    ctx.restore();
  }

  function drawPrice(w, h, a) {
    const data = history();
    const color = state.scent.color;
    const pad = { l: 64, r: 22, t: 22, b: 40 };
    const cw = w - pad.l - pad.r;
    const ch = h - pad.t - pad.b;
    const lo = Math.min(...data) * 0.92;
    const hi = Math.max(...data) * 1.04;
    const X = (i) => pad.l + (cw / (data.length - 1)) * i;
    const Y = (v) => pad.t + ch - ((v - lo) / (hi - lo)) * ch;

    // Grid and axes
    ctx.font = `500 11px ${FONT_MONO}`;
    ctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const v = lo + ((hi - lo) / 4) * g;
      const y = Y(v);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.textAlign = 'right';
      ctx.fillText(inr(v), pad.l - 10, y);
    }
    ctx.textAlign = 'center';
    data.forEach((_, i) => {
      if (cw < 420 && i % 2) return;
      ctx.fillStyle = i === state.index ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.fillText(MONTHS[i], X(i), h - pad.b + 22);
    });

    // Line grows in from the left
    const n = Math.max(1, (data.length - 1) * a);
    const pts = [];
    for (let i = 0; i <= Math.floor(n); i++) pts.push([X(i), Y(data[i])]);
    const f = n - Math.floor(n);
    if (f > 0 && Math.ceil(n) < data.length) {
      const i = Math.floor(n);
      pts.push([X(i) + (X(i + 1) - X(i)) * f, Y(data[i] + (data[i + 1] - data[i]) * f)]);
    }
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
    grad.addColorStop(0, `${color}66`);
    grad.addColorStop(1, `${color}00`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pad.t + ch);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(pts[pts.length - 1][0], pad.t + ch);
    ctx.closePath();
    ctx.fill();
    glowStroke(color, 3, 14, () => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    });

    // Lowest-price marker
    const minI = data.indexOf(Math.min(...data));
    if (a >= 1) {
      ctx.fillStyle = '#fff';
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(X(minI), Y(data[minI]), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Crosshair + tooltip
    state.regions = data.map((v, i) => ({ x: X(i) - cw / (data.length - 1) / 2, y: 0, w: cw / (data.length - 1), h, i }));
    if (state.index >= 0 && a >= 1) {
      const i = state.index;
      const x = X(i);
      const y = Y(data[i]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + ch);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      const delta = i ? data[i] - data[i - 1] : 0;
      const label = `${MONTHS[i]} · ${inr(data[i])}`;
      const sub = i ? `${delta <= 0 ? '▼' : '▲'} ${inr(Math.abs(delta))} vs ${MONTHS[i - 1]}` : 'first tracked month';
      tooltip(x, y, label, sub, w, color);
    }
  }

  function tooltip(x, y, label, sub, w, color) {
    ctx.font = `600 13px ${FONT_DISPLAY}`;
    const tw = Math.max(ctx.measureText(label).width, 150) + 24;
    const bx = Math.min(Math.max(x - tw / 2, 6), w - tw - 6);
    const by = Math.max(y - 66, 4);
    ctx.fillStyle = 'rgba(10, 6, 20, 0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, tw, 50, 8);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText(label, bx + 12, by + 18);
    ctx.font = `500 11px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(sub, bx + 12, by + 36);
  }

  function drawCompare(w, h, a) {
    const rows = retailers();
    const color = state.scent.color;
    // Scale starts below the lowest price so the differences between retailers are visible
    const floor = rows[0].price * 0.8;
    const max = rows[rows.length - 1].price * 1.02 - floor;
    const labelW = Math.min(190, w * 0.38);
    const rowH = Math.min(44, (h - 16) / rows.length);
    const barH = rowH * 0.56;
    state.regions = [];
    rows.forEach((r, i) => {
      const y = 8 + i * rowH;
      const bw = (w - labelW - 90) * ((r.price - floor) / max) * a;
      const on = i === state.index;
      const best = i === 0;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = `${on ? 600 : 500} 13px ${FONT_DISPLAY}`;
      ctx.fillStyle = on || best ? '#fff' : 'rgba(255,255,255,0.7)';
      let name = r.name;
      while (ctx.measureText(name).width > labelW - 12 && name.length > 4) name = `${name.slice(0, -2)}…`;
      ctx.fillText(name, 0, y + rowH / 2);
      ctx.fillStyle = best ? color : on ? `${color}aa` : 'rgba(255,255,255,0.14)';
      if (best || on) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
      }
      ctx.beginPath();
      ctx.roundRect(labelW, y + (rowH - barH) / 2, Math.max(bw, 4), barH, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = `600 12px ${FONT_MONO}`;
      ctx.fillStyle = best ? '#fff' : 'rgba(255,255,255,0.75)';
      ctx.fillText(inr(r.price), labelW + Math.max(bw, 4) + 10, y + rowH / 2);
      if (best && a >= 1) {
        ctx.font = `700 9px ${FONT_MONO}`;
        ctx.fillStyle = color;
        ctx.fillText('LOWEST', labelW + 8, y + rowH / 2 + 0.5);
      }
      state.regions.push({ x: 0, y, w, h: rowH, i });
    });
  }

  function drawSimilar(w, h, a) {
    const list = similar();
    const cx = w / 2;
    const cy = h / 2;
    // Elliptical map: closer = more similar. Uses the full width so labels do not collide.
    const ry = h / 2 - 30;
    const rx = Math.max(ry, Math.min(w / 2 - 130, ry * 2.2));
    const dist = (score) => 0.28 + 0.72 * Math.min(1, Math.max(0, (0.92 - score) / 0.28));
    const color = state.scent.color;
    // Rings mark similarity levels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [0.9, 0.8, 0.7].forEach((lvl) => {
      const d = dist(lvl);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * d, ry * d, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `500 10px ${FONT_MONO}`;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText(`${Math.round(lvl * 100)}%`, cx, cy - ry * d - 8);
    });
    // Center: current scent
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `700 11px ${FONT_NEON}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(state.scent.name.toUpperCase(), cx, cy + 28);

    state.regions = [];
    list.forEach((m, i) => {
      const ang = -Math.PI / 2 + (i / list.length) * Math.PI * 2 + 0.35;
      const d = dist(m.score) * a;
      const x = cx + Math.cos(ang) * rx * d;
      const y = cy + Math.sin(ang) * ry * d;
      const on = i === state.index;
      glowStroke(on ? m.color : 'rgba(255,255,255,0.18)', on ? 2 : 1, on ? 10 : 0, () => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
      });
      ctx.fillStyle = m.color;
      ctx.globalAlpha = m.id ? 1 : 0.6;
      ctx.beginPath();
      ctx.arc(x, y, on ? 9 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = `${on ? 600 : 500} 12px ${FONT_DISPLAY}`;
      ctx.fillStyle = on ? '#fff' : 'rgba(255,255,255,0.75)';
      const right = Math.cos(ang) >= 0;
      ctx.textAlign = right ? 'left' : 'right';
      ctx.fillText(m.name, x + (right ? 14 : -14), y - 6);
      ctx.font = `500 10px ${FONT_MONO}`;
      ctx.fillStyle = m.color;
      ctx.fillText(`${Math.round(m.score * 100)}% match${m.id && w > 480 ? '  ·  open' : ''}`, x + (right ? 14 : -14), y + 9);
      if (m.id) {
        // Ring marks scents you can switch to
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, on ? 14 : 11, 0, Math.PI * 2);
        ctx.stroke();
      }
      state.regions.push({ x: x - 22, y: y - 22, w: 44, h: 44, i, cx: x, cy: y });
    });
  }

  /* ------------------------------ interaction ------------------------------ */

  function updateReadout() {
    let text = '';
    if (state.tab === 'price') {
      const data = history();
      const i = state.index >= 0 ? state.index : data.length - 1;
      const drop = Math.round((1 - data[data.length - 1] / data[0]) * 100);
      text = `${MONTHS[i]}: ${inr(data[i])} · down ${drop}% in 12 months`;
    } else if (state.tab === 'compare') {
      const rows = retailers();
      const r = rows[state.index >= 0 ? state.index : 0];
      text = `${r.name}: ${inr(r.price)} · ${inr(r.price / state.size)} per ml`;
      if (state.index > 0) text += ` · ${inr(r.price - rows[0].price)} above lowest`;
    } else {
      const list = similar();
      const m = list[state.index >= 0 ? state.index : 0];
      text = `${m.name}: ${Math.round(m.score * 100)}% similar notes`;
    }
    readout.textContent = text;
    canvas.setAttribute('aria-label', `${state.scent.name}, ${tabs.find((t) => t.dataset.tab === state.tab).textContent}. ${text}`);
  }

  function animate() {
    cancelAnimationFrame(raf);
    if (reducedMotion) {
      state.anim = 1;
      draw();
      return;
    }
    state.anim = 0;
    animStart = performance.now();
    const step = (now) => {
      state.anim = Math.min(1, (now - animStart) / 650);
      draw();
      if (state.anim < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function render({ animated = true } = {}) {
    title.textContent = state.scent.name;
    meta.textContent = `${state.scent.family} · Eau de parfum · ${state.size} ml`;
    panel.style.setProperty('--shop-c', state.scent.color);
    scentButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.scent === state.scent.id)));
    tabs.forEach((t) => {
      const on = t.dataset.tab === state.tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    dialog.querySelector('#shop-view').setAttribute('aria-labelledby', `shop-tab-${state.tab}`);
    sizes.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.size) === state.size)));
    help.textContent = HELP[state.tab];
    state.index = -1;
    updateReadout();
    if (animated) animate();
    else draw();
  }

  function setIndex(i) {
    if (i === state.index) return;
    state.index = i;
    updateReadout();
    if (state.anim >= 1) draw();
  }

  function hit(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const r = state.regions.find((g) => x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h);
    return r ? r.i : -1;
  }

  function activate(i) {
    if (state.tab !== 'similar' || i < 0) return;
    const m = similar()[i];
    if (m?.id) {
      state.scent = scentById(m.id);
      render();
    }
  }

  canvas.addEventListener('pointermove', (e) => {
    const i = hit(e);
    if (i >= 0 || e.pointerType === 'mouse') setIndex(i);
    canvas.style.cursor = state.tab === 'similar' && i >= 0 && similar()[i].id ? 'pointer' : 'crosshair';
  });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') setIndex(-1);
  });
  canvas.addEventListener('click', (e) => {
    const i = hit(e);
    setIndex(i);
    activate(i);
  });
  canvas.addEventListener('keydown', (e) => {
    const n = state.regions.length;
    if (!n) return;
    if (['ArrowRight', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      setIndex((state.index + 1 + n) % n);
    } else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      setIndex(state.index <= 0 ? n - 1 : state.index - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate(state.index);
    }
  });

  tabs.forEach((t, k) => {
    t.addEventListener('click', () => {
      state.tab = t.dataset.tab;
      render();
    });
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = tabs[(k + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
    });
  });
  scentButtons.forEach((b) =>
    b.addEventListener('click', () => {
      state.scent = scentById(b.dataset.scent);
      render();
    }),
  );
  sizes.forEach((b) =>
    b.addEventListener('click', () => {
      state.size = Number(b.dataset.size);
      render();
    }),
  );

  new ResizeObserver(() => {
    if (!dialog.hidden) draw();
  }).observe(canvas);

  /* ------------------------------ dialog state ----------------------------- */

  const focusables = () =>
    [...panel.querySelectorAll('a[href], button:not([disabled]), canvas, [tabindex]:not([tabindex="-1"])')].filter(
      (n) => n.offsetParent !== null && !(n.getAttribute('role') === 'tab' && n.tabIndex === -1),
    );

  function open(tab = 'price') {
    if (!dialog.hidden && dialog.classList.contains('is-open')) {
      state.tab = tab;
      render();
      return;
    }
    clearTimeout(closeTimer);
    returnFocus = document.activeElement;
    state.tab = tab;
    dialog.hidden = false;
    onOpen?.();
    requestAnimationFrame(() => {
      dialog.classList.add('is-open');
      render();
      dialog.querySelector(`[data-tab="${state.tab}"]`).focus({ preventScroll: true });
    });
  }

  function close() {
    if (dialog.hidden) return;
    dialog.classList.remove('is-open');
    onClose?.();
    closeTimer = setTimeout(() => {
      dialog.hidden = true;
    }, 450);
    returnFocus?.focus?.({ preventScroll: true });
  }

  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-shop-close]')) close();
  });
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-shop-open]');
    if (trigger) open(trigger.dataset.shopOpen);
  });
  document.addEventListener('keydown', (e) => {
    if (dialog.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  return { open, close, isOpen: () => !dialog.hidden };
}
