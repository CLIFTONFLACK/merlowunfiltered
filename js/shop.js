'use strict';

/* /shop — the full catalog. Cards are links; sizes and colours are chosen on
   the product page, where there is room to show what you are choosing. */

(function () {
  const { escapeHtml, priceLabel, productHref } = window.Merlow;

  function card(product) {
    const variants = product.variants || [];
    const image = product.thumbnail || (variants[0] && variants[0].image) || '';
    const price = priceLabel(variants);

    return `
      <li class="shop__item reveal">
        <a class="shop__link" href="${escapeHtml(productHref(product))}">
          <span class="shop__media">
            ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" width="800" height="800" loading="lazy" decoding="async">` : ''}
          </span>
          <span class="shop__meta">
            <span class="shop__name">${escapeHtml(product.name)}</span>
            ${price ? `<span class="shop__price">${price}</span>` : ''}
          </span>
          <span class="shop__cta">${variants.length ? 'View' : 'Currently unavailable'}</span>
        </a>
      </li>`;
  }

  async function load() {
    const grid = document.getElementById('shopGrid');
    if (!grid) return;

    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const products = Array.isArray(data.products) ? data.products : [];

      grid.innerHTML = products.length
        ? products.map(card).join('')
        : '<li class="shop__status">The shop is being stocked — check back soon.</li>';
    } catch (err) {
      grid.innerHTML = '<li class="shop__status">Couldn&rsquo;t load the shop right now — refresh to try again.</li>';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.Merlow.init();
    load();
    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
  });
})();
