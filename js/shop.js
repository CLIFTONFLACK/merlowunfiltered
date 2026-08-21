'use strict';

/* /shop — the full catalog. Cards are links; sizes and colours are chosen on
   the product page, where there is room to show what you are choosing. */

(function () {
  const { productCard } = window.Merlow;

  async function load() {
    const grid = document.getElementById('shopGrid');
    if (!grid) return;

    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const products = Array.isArray(data.products) ? data.products : [];

      grid.innerHTML = products.length
        ? products.map(productCard).join('')
        : '<li class="shop__status">The shop is being stocked — check back soon.</li>';
    } catch (err) {
      grid.innerHTML = '<li class="shop__status">Couldn&rsquo;t load the shop right now — refresh to try again.</li>';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Without this, everything carrying `.reveal` stays at opacity 0 for good.
    window.MerlowReveal.init();
    window.Merlow.init();
    load();
    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
  });
})();
