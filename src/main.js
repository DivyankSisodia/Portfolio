import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/800.css';
import '@fontsource/orbitron/900.css';
import 'lenis/dist/lenis.css';
import './styles.css';
import { createChapterUI, createLoader, initAbout, initCursor, initGlitch } from './ui.js';
import { createScroll } from './scroll.js';
import { initShop } from './shop.js';

const STORY_END = 3.5;
const UI_SELECTOR = 'a, button, summary, details, input, .nav, .about, .shop, .hud__rail';
let mouse = null;
const root = document.documentElement;
root.classList.add('js');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const chapters = [...document.querySelectorAll('.chapter')];
const loader = createLoader();
document.getElementById('year').textContent = String(new Date().getFullYear());

function hasWebGL2() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function qualityTier() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const fewCores = (navigator.hardwareConcurrency || 8) <= 4;
  return coarse || small || fewCores ? 'low' : 'high';
}

async function boot() {
  const scroll = createScroll(chapters, { reducedMotion });
  const ui = createChapterUI(chapters, { reducedMotion });
  initGlitch({ reducedMotion });
  initCursor({ reducedMotion });
  initAbout({ onOpen: () => scroll.stop(), onClose: () => scroll.start() });
  const shop = initShop({
    reducedMotion,
    onOpen: () => {
      scroll.stop();
      root.classList.add('shop-used');
    },
    onClose: () => scroll.start(),
  });
  if (window.matchMedia('(pointer: coarse)').matches) {
    document.querySelector('.shop-hint__text').textContent = 'Tap the bottle or the chart';
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-scroll-to]');
    if (!link) return;
    e.preventDefault();
    scroll.scrollToChapter(link.dataset.scrollTo);
    history.replaceState(null, '', `#${link.dataset.scrollTo}`);
  });

  let experience = null;
  if (hasWebGL2()) {
    try {
      loader.set(0.05, 'Loading the district');
      const { Experience } = await import('./three/Experience.js');
      experience = new Experience({
        canvas: document.getElementById('webgl'),
        quality: qualityTier(),
        reducedMotion,
      });
      await experience.init((fraction, label) => loader.set(fraction, label));
    } catch (err) {
      console.error('The 3D scene could not start; showing the static version instead.', err);
      experience?.stop();
      experience = null;
      root.classList.add('no-webgl');
    }
  } else {
    root.classList.add('no-webgl');
  }

  // Deep links: ?s=<story time> or #chapter
  scroll.measure();
  const sParam = parseFloat(new URLSearchParams(window.location.search).get('s'));
  if (!Number.isNaN(sParam)) scroll.scrollToStory(Math.min(Math.max(sParam, 0), STORY_END), true);
  else if (window.location.hash) scroll.scrollToChapter(window.location.hash.slice(1), true);

  if (experience) {
    experience.jumpTo(Number.isNaN(sParam) ? scroll.story() : sParam);
    experience.start();

    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        mouse = { x: (e.clientX / window.innerWidth) * 2 - 1, y: -((e.clientY / window.innerHeight) * 2 - 1), target: e.target };
        experience.setPointer(mouse.x, mouse.y);
      },
      { passive: true },
    );
    document.addEventListener('pointerleave', () => (mouse = null));

    // Click or tap the 3D bottle / holo chart to open the shop.
    // Clicks on real UI (links, buttons, dialogs) are left alone.
    document.addEventListener('click', (e) => {
      if (shop.isOpen() || e.target.closest(UI_SELECTOR)) return;
      const kind = experience.pick((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
      if (kind) shop.open(kind === 'chart' ? 'compare' : 'price');
    });
    let resizeQueued = false;
    window.addEventListener('resize', () => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => {
        resizeQueued = false;
        experience.resize();
      });
    });
  }

  let hoverKind = null;
  const frame = () => {
    const s = scroll.story();
    ui.update(s, STORY_END);
    if (experience) {
      experience.setStory(s);
      experience.setScrollVelocity(scroll.velocity());
      // Re-test hover every frame so it stays right while the camera moves under a still mouse
      const kind = mouse && !shop.isOpen() && !mouse.target.closest?.(UI_SELECTOR) ? experience.pick(mouse.x, mouse.y) : null;
      if (kind !== hoverKind) {
        hoverKind = kind;
        experience.setHover(kind);
        root.classList.toggle('is-pick', Boolean(kind));
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  loader.done();
}

boot();
