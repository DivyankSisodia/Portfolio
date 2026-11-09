const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* -------------------------------------------------------------------------- */
/* Loader                                                                      */
/* -------------------------------------------------------------------------- */

export function createLoader() {
  const bar = document.getElementById('loader-bar');
  const pct = document.getElementById('loader-pct');
  const label = document.getElementById('loader-label');
  let shown = 0;
  return {
    set(fraction, text) {
      shown = Math.max(shown, fraction);
      bar.style.transform = `scaleX(${shown})`;
      pct.textContent = `${Math.round(shown * 100)}%`;
      if (text) label.textContent = text;
    },
    done() {
      this.set(1, 'Entering');
      requestAnimationFrame(() => document.documentElement.classList.remove('is-loading'));
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Chapters, HUD and reveals                                                   */
/* -------------------------------------------------------------------------- */

export function createChapterUI(chapters, { reducedMotion }) {
  const hudIndex = document.getElementById('hud-index');
  const hudTitle = document.getElementById('hud-title');
  const hudDesc = document.getElementById('hud-desc');
  const hudNum = document.getElementById('hud-num');
  const hudBar = document.getElementById('hud-bar');
  const ticks = [...document.querySelectorAll('.hud__tick')];
  const navLinks = [...document.querySelectorAll('.nav__links a[data-scroll-to]')];
  let current = -1;
  const counted = new Set();

  // Stagger index for reveal transitions
  chapters.forEach((ch) => {
    ch.querySelectorAll('[data-reveal]').forEach((el, i) => el.style.setProperty('--i', i));
  });

  function setActive(index) {
    if (index === current) return;
    current = index;
    const ch = chapters[index];
    const num = String(index + 1).padStart(2, '0');
    hudIndex.textContent = num;
    hudNum.textContent = num;
    hudTitle.textContent = ch.dataset.title;
    hudDesc.textContent = ch.dataset.desc;
    ticks.forEach((t, i) => t.classList.toggle('is-active', i <= index));
    navLinks.forEach((a) => a.classList.toggle('is-current', a.dataset.scrollTo === ch.id && index > 0));
    if (!counted.has(index)) {
      counted.add(index);
      ch.querySelectorAll('[data-count]').forEach((el) => countUp(el, reducedMotion));
    }
  }

  return {
    update(s, end) {
      chapters.forEach((ch, i) => {
        const last = i === chapters.length - 1;
        const on = s >= i - 0.38 && (last || s < i + 0.82);
        ch.classList.toggle('is-active', on);
      });
      setActive(clamp(Math.floor(s + 0.32), 0, chapters.length - 1));
      hudBar.style.transform = `scaleY(${clamp(s / end, 0, 1)})`;
    },
  };
}

function countUp(el, reducedMotion) {
  const target = Number(el.dataset.count);
  const suffix = el.dataset.suffix || '';
  const format = (v) => `${Math.round(v).toLocaleString('en-US')}${suffix}`;
  if (reducedMotion) {
    el.textContent = format(target);
    return;
  }
  const start = performance.now();
  const duration = 1500;
  const tick = (now) => {
    const t = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = format(target * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* -------------------------------------------------------------------------- */
/* Glitch bursts on the accent headline                                        */
/* -------------------------------------------------------------------------- */

export function initGlitch({ reducedMotion }) {
  const items = [...document.querySelectorAll('.glitch')];
  if (reducedMotion || !items.length) return;
  const fire = (el) => {
    el.classList.remove('is-glitching');
    void el.offsetWidth;
    el.classList.add('is-glitching');
    setTimeout(() => el.classList.remove('is-glitching'), 520);
  };
  items.forEach((el) => el.addEventListener('pointerenter', () => fire(el)));
  const loop = () => {
    items.forEach(fire);
    setTimeout(loop, 4200 + Math.random() * 3800);
  };
  setTimeout(loop, 2600);
}

/* -------------------------------------------------------------------------- */
/* Cursor follower (fine pointers only)                                        */
/* -------------------------------------------------------------------------- */

export function initCursor({ reducedMotion }) {
  const el = document.querySelector('.cursor');
  if (!el || reducedMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let x = -100;
  let y = -100;
  let cx = x;
  let cy = y;
  window.addEventListener(
    'pointermove',
    (e) => {
      x = e.clientX;
      y = e.clientY;
      el.classList.add('is-visible');
      const hover = e.target.closest?.('a, button, summary');
      el.classList.toggle('is-hover', Boolean(hover));
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => el.classList.remove('is-visible'));
  const tick = () => {
    cx += (x - cx) * 0.2;
    cy += (y - cy) * 0.2;
    el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* -------------------------------------------------------------------------- */
/* About dialog with focus trap                                                */
/* -------------------------------------------------------------------------- */

export function initAbout({ onOpen, onClose }) {
  const dialog = document.getElementById('about');
  const trigger = document.querySelector('.nav__about');
  const panel = dialog.querySelector('.about__panel');
  const focusables = () =>
    [...panel.querySelectorAll('a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter(
      (n) => n.offsetParent !== null,
    );
  let closeTimer = null;

  function open() {
    clearTimeout(closeTimer);
    dialog.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    onOpen?.();
    requestAnimationFrame(() => {
      dialog.classList.add('is-open');
      dialog.querySelector('.about__close').focus({ preventScroll: true });
    });
  }

  function close() {
    dialog.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    onClose?.();
    closeTimer = setTimeout(() => {
      dialog.hidden = true;
    }, 650);
    trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', () => (dialog.hidden ? open() : close()));
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
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
  return { open, close };
}
