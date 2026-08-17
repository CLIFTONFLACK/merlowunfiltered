'use strict';

/* ───────────────────────────────────────────────────────────
   Scroll reveal — shared by every page

   Elements carrying `.reveal` sit at opacity 0 until they come into view.
   That makes it a single point of failure: anything that carries the class on
   a page where this never runs stays invisible for good. It therefore lives
   here rather than in the home page's bundle, and every page loads it.
   ─────────────────────────────────────────────────────────── */

window.MerlowReveal = (function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Anything injected after boot carrying `.reveal` — the shop grid, the
     product page, the shop's own error messages — was never picked up by a
     one-off sweep, and sat at opacity 0 permanently. */
  function watchForLateReveals(handle) {
    if (!('MutationObserver' in window)) return;
    new MutationObserver((records) => {
      records.forEach((rec) => {
        rec.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.classList.contains('reveal')) handle(node);
          node.querySelectorAll?.('.reveal').forEach(handle);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      const show = (el) => el.classList.add('is-in');
      document.querySelectorAll('.reveal').forEach(show);
      watchForLateReveals(show);
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    watchForLateReveals((el) => io.observe(el));
  }

  return { init, reduceMotion };
})();
