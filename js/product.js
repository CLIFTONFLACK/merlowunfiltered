'use strict';

/* /shop/:id — the full product page.

   The id comes from the path, because /shop/:id is rewritten to this file by
   vercel.json rather than redirected, so the browser keeps the pretty URL.

   Colour and size are chosen separately and resolved to a sync variant only
   when both are known. Printful does not guarantee a full grid — a colour may
   exist in three sizes and not the fourth — so sizes that the chosen colour
   does not come in are disabled rather than hidden, which keeps the row from
   reflowing under the pointer as you compare colours.
   ─────────────────────────────────────────────────────────── */

(function () {
  const { escapeHtml, money, mockup, productTitle, swatchColor } = window.Merlow;

  const state = { product: null, color: null, size: null };

  function productIdFromPath() {
    const m = window.location.pathname.match(/\/shop\/(\d+)/);
    if (m) return m[1];
    return new URLSearchParams(window.location.search).get('id');
  }

  /* ── variant resolution ──────────────────────────────────── */

  /* With no colours or sizes to pick from (a one-variant cap), the single
     variant is the selection. */
  function isSimple(p) {
    return !p.colors.length && !p.sizes.length;
  }

  function matching({ color, size }) {
    return state.product.variants.filter(
      (v) => (color == null || v.color === color) && (size == null || v.size === size)
    );
  }

  function selected() {
    if (isSimple(state.product)) return state.product.variants[0] || null;
    const needsColor = state.product.colors.length > 0;
    const needsSize = state.product.sizes.length > 0;
    if ((needsColor && !state.color) || (needsSize && !state.size)) return null;
    return matching({ color: state.color, size: state.size })[0] || null;
  }

  function sizeAvailable(size) {
    return matching({ color: state.color, size }).length > 0;
  }

  /* ── rendering ───────────────────────────────────────────── */

  function galleryHtml(p) {
    if (!p.images.length) return '';
    const title = productTitle(p);
    return `
      <div class="product__gallery">
        <div class="product__stage">
          <img id="productImage" src="${escapeHtml(mockup(p.images[0]))}" alt="${escapeHtml(title)}"
               width="800" height="800" decoding="async">
        </div>
        ${p.images.length > 1 ? `
          <ul class="product__thumbs">
            ${p.images.map((src, n) => `
              <li>
                <button type="button" class="product__thumb${n === 0 ? ' is-on' : ''}" data-image="${escapeHtml(mockup(src))}"
                        aria-label="View image ${n + 1} of ${p.images.length}">
                  <img src="${escapeHtml(mockup(src, 200))}" alt="" width="200" height="200" loading="lazy" decoding="async">
                </button>
              </li>`).join('')}
          </ul>` : ''}
      </div>`;
  }

  function priceHtml(p) {
    const chosen = selected();
    if (chosen) return escapeHtml(money(chosen.price, chosen.currency));
    if (p.priceFrom == null) return '';
    return p.priceTo > p.priceFrom
      ? `<span class="shop__price-from">from</span>${escapeHtml(money(p.priceFrom, p.currency))}`
      : escapeHtml(money(p.priceFrom, p.currency));
  }

  function optionsHtml(p) {
    if (isSimple(p)) return '';

    const colors = p.colors.length ? `
      <div class="product__option">
        <span class="product__option-label" id="colorLabel">Colour${state.color ? ` <b>${escapeHtml(state.color)}</b>` : ''}</span>
        <div class="product__swatches" role="radiogroup" aria-labelledby="colorLabel">
          ${p.colors.map((c) => `
            <button type="button" role="radio" aria-checked="${state.color === c.name}"
                    class="product__swatch${state.color === c.name ? ' is-on' : ''}"
                    data-color="${escapeHtml(c.name)}" title="${escapeHtml(c.name)}"
                    style="--swatch: ${swatchColor(c.code)}">
              <span class="visually-hidden">${escapeHtml(c.name)}</span>
            </button>`).join('')}
        </div>
      </div>` : '';

    const sizes = p.sizes.length ? `
      <div class="product__option">
        <span class="product__option-label" id="sizeLabel">Size</span>
        <div class="product__sizes" role="radiogroup" aria-labelledby="sizeLabel">
          ${p.sizes.map((s) => {
            const ok = sizeAvailable(s);
            return `
            <button type="button" role="radio" aria-checked="${state.size === s}"
                    class="product__size${state.size === s ? ' is-on' : ''}"
                    data-size="${escapeHtml(s)}" ${ok ? '' : 'disabled'}
                    ${ok ? '' : 'title="Not available in this colour"'}>${escapeHtml(s)}</button>`;
          }).join('')}
        </div>
      </div>` : '';

    return colors + sizes;
  }

  function detailsHtml(p) {
    const spec = [
      p.brand && `<div><dt>Brand</dt><dd>${escapeHtml(p.brand)}</dd></div>`,
      p.model && `<div><dt>Model</dt><dd>${escapeHtml(p.model)}</dd></div>`,
      p.type && `<div><dt>Type</dt><dd>${escapeHtml(p.type)}</dd></div>`,
    ].filter(Boolean).join('');

    return `
      ${p.description ? `<div class="product__desc">${describe(p.description)}</div>` : ''}
      ${spec ? `<dl class="product__spec">${spec}</dl>` : ''}`;
  }

  /* Printful writes a prose paragraph, then the spec as lines each opening with
     a "·". Run together as one paragraph that reads as a wall; as a list it
     reads as a list. Blocks are split on blank lines, and any block whose lines
     are mostly bullets becomes one. */
  function describe(text) {
    return text
      .split(/\r?\n\s*\r?\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const bullets = lines.filter((l) => /^[·•*•-]\s+/.test(l));
        if (bullets.length && bullets.length >= lines.length - 1) {
          return `<ul class="product__features">${lines
            .map((l) => `<li>${escapeHtml(l.replace(/^[·•*•-]\s+/, ''))}</li>`)
            .join('')}</ul>`;
        }
        return `<p>${escapeHtml(lines.join(' '))}</p>`;
      })
      .join('');
  }

  function render() {
    const p = state.product;
    const chosen = selected();
    const needsChoice = !isSimple(p) && !chosen;

    /* Name what is actually missing. "Choose your options" on a product whose
       colour was preselected leaves you looking for a second choice that
       isn't there. */
    const missing = [
      p.colors.length && !state.color ? 'a colour' : null,
      p.sizes.length && !state.size ? 'a size' : null,
    ].filter(Boolean);

    document.getElementById('product').innerHTML = `
      <div class="wrap product__grid">
        ${galleryHtml(p)}
        <div class="product__body">
          <h1 class="product__name">${escapeHtml(productTitle(p))}</h1>
          <p class="product__price">${priceHtml(p)}</p>
          ${optionsHtml(p)}
          ${p.variants.length ? `
            <button class="btn btn--primary product__add" id="addToCart" type="button" ${needsChoice ? 'disabled' : ''}>
              ${needsChoice ? `Choose ${missing.join(' and ')}` : 'Add to cart'}
            </button>
            <p class="product__note">Made to order, usually printed within 3–7 days. Postage is worked out from your country in the cart.</p>
          ` : '<p class="shop__note">Currently unavailable</p>'}
          ${detailsHtml(p)}
        </div>
      </div>`;

    bind();
  }

  function bind() {
    document.querySelectorAll('[data-image]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const img = document.getElementById('productImage');
        // data-image is already the proxied URL, so this stays in one space.
        if (img) img.src = btn.dataset.image;
        document.querySelectorAll('.product__thumb').forEach((b) => b.classList.toggle('is-on', b === btn));
      });
    });

    document.querySelectorAll('[data-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.color = btn.dataset.color;
        // A size that the new colour does not come in cannot stay selected.
        if (state.size && !sizeAvailable(state.size)) state.size = null;
        showVariantImage();
        render();
      });
    });

    document.querySelectorAll('[data-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        state.size = btn.dataset.size;
        render();
      });
    });

    const add = document.getElementById('addToCart');
    if (add) {
      add.addEventListener('click', () => {
        const chosen = selected();
        if (!chosen) return;
        window.Merlow.add({
          variantId: chosen.id,
          name: productTitle(state.product),
          variantName: [chosen.color, chosen.size].filter(Boolean).join(' / ') || chosen.name,
          price: chosen.price,
          currency: chosen.currency,
          image: chosen.image,
        });
      });
    }
  }

  /* Picking a colour should show that colour, not leave the previous mockup up. */
  function showVariantImage() {
    const first = matching({ color: state.color })[0];
    if (!first || !first.image) return;
    const p = state.product;
    const index = p.images.indexOf(first.image);
    if (index >= 0) p.images = [first.image, ...p.images.filter((src) => src !== first.image)];
  }

  /* ── boot ────────────────────────────────────────────────── */

  async function load() {
    const host = document.getElementById('product');
    const id = productIdFromPath();

    if (!id) {
      host.innerHTML = '<div class="wrap"><p class="shop__status">No product specified. <a href="/shop">Back to the shop</a>.</p></div>';
      return;
    }

    try {
      const res = await fetch(`/api/product?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      state.product = data.product;

      // One colour or one size is not a choice — preselect it.
      if (state.product.colors.length === 1) state.color = state.product.colors[0].name;
      if (state.product.sizes.length === 1) state.size = state.product.sizes[0];

      document.title = `${productTitle(state.product)} — MERLOW`;
      render();
    } catch (err) {
      host.innerHTML = `<div class="wrap"><p class="shop__status">Couldn&rsquo;t load this product. <a href="/shop">Back to the shop</a>.</p></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.MerlowReveal.init();
    window.Merlow.init();
    load();
    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
  });
})();
