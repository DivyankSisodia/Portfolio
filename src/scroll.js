import Lenis from 'lenis';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Smooth scrolling plus the mapping from scroll position to story time `s`.
 * Chapter i spans s in [i, i + 1); the last chapter ends at s = 3.5 (see NOTES.md).
 */
export function createScroll(chapters, { reducedMotion }) {
  const lenis = reducedMotion
    ? null
    : new Lenis({
        lerp: 0.085,
        wheelMultiplier: 0.85,
        touchMultiplier: 1.4,
        autoRaf: false,
      });

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
