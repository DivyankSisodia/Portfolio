import Lenis from 'lenis';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Chapters are 200vh tall, so 0.35 story units per second is 70vh/s: one chapter takes about 3 s
// and the whole story (s 0 to 3.5) at least 10 s, however hard the user scrolls.
const MAX_STORY_PER_SECOND = 0.35;
const CHAPTER_VH = 2;
// Scroll the user may push in one go before the limit kicks in (a couple of wheel notches)
const BURST_VH = 0.25;

/**
 * Token bucket for scroll input, in pixels. Refills at the max pace and holds at most one burst.
 * Input beyond the budget is dropped, not queued, so the page stops soon after the user stops.
 */
function createPaceLimiter() {
  let budget = null;
  let last = performance.now();
  const rate = () => MAX_STORY_PER_SECOND * CHAPTER_VH * window.innerHeight;
  const cap = () => BURST_VH * window.innerHeight;
  return {
    take(delta) {
      const now = performance.now();
      budget = budget === null ? cap() : Math.min(cap(), budget + ((now - last) / 1000) * rate());
      last = now;
      const allowed = Math.sign(delta) * Math.min(Math.abs(delta), budget);
      budget -= Math.abs(allowed);
      return allowed;
    },
  };
}

/**
 * Space, Page Up/Down and the arrow keys normally jump the page natively, past the pace limit.
 * Route them through Lenis and the same budget instead. Home/End and nav links stay deliberate jumps.
 */
function initPagedKeys(lenis, pace) {
  const steps = { PageDown: 0.85, PageUp: -0.85, ArrowDown: 0.12, ArrowUp: -0.12, ' ': 0.85 };
  window.addEventListener('keydown', (e) => {
    if (!(e.key in steps) || e.altKey || e.ctrlKey || e.metaKey || lenis.isStopped) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable], dialog, [role="dialog"]')) return;
    if (e.key === ' ' && e.target.closest?.('button, a, summary')) return;
    e.preventDefault();
    const step = steps[e.key] * (e.key === ' ' && e.shiftKey ? -1 : 1) * window.innerHeight;
    const allowed = pace.take(step);
    if (allowed) lenis.scrollTo(lenis.targetScroll + allowed, { lerp: 0.085, programmatic: false });
  });
}

/**
 * Smooth scrolling plus the mapping from scroll position to story time `s`.
 * Chapter i spans s in [i, i + 1); the last chapter ends at s = 3.5 (see NOTES.md).
 */
export function createScroll(chapters, { reducedMotion }) {
  // Pace limit: fast wheels, flicks and key presses can't push the story faster than this.
  // Slow scrolling stays inside the burst allowance and feels unchanged.
  const pace = createPaceLimiter();
  const lenis = reducedMotion
    ? null
    : new Lenis({
        lerp: 0.085,
        wheelMultiplier: 0.85,
        touchMultiplier: 1,
        // Lenis drives touch too, so phone flicks go through the same pace limit
        syncTouch: true,
        syncTouchLerp: 0.06,
        autoRaf: false,
        virtualScroll: (data) => {
          // Dialogs scroll on their own; Lenis skips them via data-lenis-prevent
          if (data.event.target?.closest?.('[data-lenis-prevent]')) return true;
          if (data.event.type === 'touchend') {
            // Lenis sizes the fling from its own velocity and ignores deltaY, so do the fling here
            if (lenis.isStopped || lenis.isLocked || !lenis.velocity) return true;
            const fling = pace.take(Math.sign(lenis.velocity) * Math.abs(lenis.velocity) ** 1.7);
            if (fling) lenis.scrollTo(lenis.targetScroll + fling, { lerp: 0.06, programmatic: false });
            return false;
          }
          const allowed = pace.take(data.deltaY);
          if (allowed === 0 && data.deltaY !== 0) {
            // Swallow the input so the browser doesn't scroll natively either
            if (data.event.cancelable) data.event.preventDefault();
            return false;
          }
          data.deltaY = allowed;
          return true;
        },
      });
  if (lenis) initPagedKeys(lenis, pace);

  let metrics = [];
  const measure = () => {
    metrics = chapters.map((ch) => ({ top: ch.offsetTop, height: ch.offsetHeight }));
  };
  measure();
  window.addEventListener('resize', measure);

  const scrollY = () => (lenis ? lenis.scroll : window.scrollY);

  function storyAt(y) {
    for (let i = 0; i < metrics.length; i++) {
      const { top, height } = metrics[i];
      if (y < top + height || i === metrics.length - 1) return i + clamp((y - top) / height, 0, 1);
    }
    return 0;
  }

  function yForStory(s) {
    const i = clamp(Math.floor(s), 0, metrics.length - 1);
    const { top, height } = metrics[i];
    return top + (s - i) * height;
  }

  function scrollToY(y, immediate = false) {
    if (lenis) lenis.scrollTo(y, { immediate, duration: immediate ? 0 : 2.4, force: true });
    else window.scrollTo({ top: y, behavior: immediate || reducedMotion ? 'auto' : 'smooth' });
  }

  function raf(time) {
    lenis?.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  return {
    lenis,
    measure,
    story: () => storyAt(scrollY()),
    velocity: () => (lenis ? lenis.velocity : 0),
    scrollToStory: (s, immediate) => scrollToY(yForStory(s), immediate),
    scrollToChapter: (id, immediate) => {
      const index = chapters.findIndex((c) => c.id === id);
      if (index >= 0) scrollToY(metrics[index].top + (index === 0 ? 0 : 2), immediate);
    },
    stop: () => lenis?.stop(),
    start: () => lenis?.start(),
  };
}
