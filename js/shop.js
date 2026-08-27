'use strict';

/* /shop — the full catalog. Cards are links; sizes and colours are chosen on
   the product page, where there is room to show what you are choosing. */

(function () {
  const { productCard, copy, escapeHtml } = window.Merlow;

  /* Both of these are states of the grid nobody sees when things are going
     well, which is why /admin/edit lists them in a panel rather than expecting
     you to break the shop to reword them. */
  const status = (key) => `<li class="shop__status">${escapeHtml(copy(key))}</li>`;

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
        : status('shop.empty');
    } catch (err) {
      grid.innerHTML = status('shop.error');
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
