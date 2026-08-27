'use strict';

/* ───────────────────────────────────────────────────────────
   Cart — shared by the home page, /shop and the product pages

   Loaded before every other page script. It owns localStorage, the drawer,
   and the handoff to Stripe Checkout, and it mounts its own markup so the
   three pages cannot drift apart.

   Cart lines carry their own name, price and image rather than looking them
   up in a catalog the current page may not have loaded — a product page holds
   one product, but the cart can hold three. Prices here are for display only:
   /api/create-checkout-session re-prices every line against Printful before
   it builds the Stripe session, so a tampered localStorage cannot change what
   anyone is charged.

   Postage works the same way. The country picked here is quoted against
   Printful through /api/shipping-rates so the total on screen is the total,
   but the quote shown is never the quote charged — the checkout endpoint asks
   Printful again and builds the Stripe session from that.
   ─────────────────────────────────────────────────────────── */

window.Merlow = (function () {
  const CART_KEY = 'merlow-cart-v2';
  const COUNTRY_KEY = 'merlow-ship-country';
  const MAX_PER_LINE = 10;
  const QUOTE_DEBOUNCE_MS = 350;

  /* ── helpers ─────────────────────────────────────────────── */

  function money(amount, currency) {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
    } catch {
      return `${Number(amount).toFixed(2)} ${currency}`;
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /* Copy that a script prints, rather than copy that sits in the markup, lives
     in js/copy.js — one flat table of dotted keys, rewritten whole by
     /admin/edit. See lib/copy.js for why the two are kept apart.

     js/copy.js is loaded before this file by every page that needs it, so a
     missing key is a mistake in the schema and not a race. Falling back to the
     key itself is deliberate: "product.add" printed on a button is a bug
     somebody reports in a minute, where an empty button is one nobody can
     describe. */
  function copy(key, vars) {
    const table = window.MERLOW_COPY || {};
    let out = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key;
    if (vars) {
      Object.keys(vars).forEach((name) => {
        out = out.split(`{${name}}`).join(vars[name]);
      });
    }
    return out;
  }

  /* Every product mockup on the site goes through /api/mockup, which serves it
     with the backdrop taken off. Printful cuts out most of them already but
     not all, and a white box on this page is loud. Anything not from Printful
     is left alone — the endpoint will not fetch it anyway. */
  function mockup(src, width = 800) {
    if (!src) return '';
    if (!/^https:\/\/[^/]*\.printful\.com\//i.test(src)) return src;
    return `/api/mockup?src=${encodeURIComponent(src)}&w=${width}`;
  }

  /* Cheapest variant, marked "from" only where the variants actually differ —
     a one-variant cap should read as a flat price, not "from". */
  function priceLabel(variants) {
    if (!variants || !variants.length) return null;
    const low = Math.min(...variants.map((v) => v.price));
    const high = Math.max(...variants.map((v) => v.price));
    const amount = escapeHtml(money(low, variants[0].currency));
    return high > low
      ? `<span class="shop__price-from">${escapeHtml(copy('product.priceFrom'))}</span>${amount}`
      : amount;
  }

  function productHref(product) {
    return `/shop/${product.id}`;
  }

  /* The product's display name, with the "Official MERLOW" that sits on every
     one of them taken off by the API. Falls back for anything older. */
  function productTitle(product) {
    return product.title || product.name || '';
  }

  /* Colour codes come from Printful and end up inside a style attribute. Only
     a hex colour is ever let through; anything else is a swatch that would
     have been wrong anyway, and this is not the place to find out that a
     catalog field can carry a semicolon. */
  function swatchColor(code) {
    return /^#[0-9a-f]{3,8}$/i.test(String(code || '')) ? code : '#555';
  }

  /* One card, used by the home page's preview row and by /shop, because two
     copies of it is how the two grids drift apart. Sizes and colours are
     chosen on the product page, where there is room to show what is being
     chosen between; the swatches here only say how many there are. */
  function productCard(product) {
    const variants = product.variants || [];
    const title = productTitle(product);
    const image = mockup(product.thumbnail || (variants[0] && variants[0].image) || '');
    const price = priceLabel(variants);
    const colors = (product.colors || []).filter((c) => c && c.name);

    return `
      <li class="shop__item reveal">
        <a class="shop__link" href="${escapeHtml(productHref(product))}">
          <span class="shop__media">
            ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" width="800" height="800" loading="lazy" decoding="async">` : ''}
          </span>
          <span class="shop__meta">
            <span class="shop__name">${escapeHtml(title)}</span>
            ${price ? `<span class="shop__price">${price}</span>` : ''}
          </span>
          ${colors.length > 1 ? `
            <span class="shop__colors">
              ${colors.map((c) => `<span class="shop__color" style="--swatch: ${swatchColor(c.code)}"></span>`).join('')}
              <span class="shop__colors-count">${colors.length} colours</span>
            </span>` : ''}
          <span class="shop__cta">${variants.length ? 'View' : 'Currently unavailable'}</span>
        </a>
      </li>`;
  }

  /* ── storage ─────────────────────────────────────────────── */

  let cart = load();

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      // Drop anything that predates this shape rather than rendering blanks.
      return parsed.filter((i) => i && i.variantId && i.quantity && i.name);
    } catch {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* private mode — the cart just won't survive the page */
    }
  }

  function count() {
    return cart.reduce((sum, i) => sum + i.quantity, 0);
  }

  /* line: { variantId, quantity, name, variantName, price, currency, image } */
  function add(line, quantity = 1) {
    const existing = cart.find((i) => i.variantId === line.variantId);
    if (existing) {
      existing.quantity = Math.min(MAX_PER_LINE, existing.quantity + quantity);
    } else {
      cart.push({ ...line, quantity: Math.min(MAX_PER_LINE, quantity) });
    }
    changed();
    open();
  }

  function remove(variantId) {
    cart = cart.filter((i) => i.variantId !== variantId);
    changed();
  }

  function setQuantity(variantId, quantity) {
    if (quantity < 1) return remove(variantId);
    const item = cart.find((i) => i.variantId === variantId);
    if (!item) return;
    item.quantity = Math.min(MAX_PER_LINE, quantity);
    changed();
  }

  /* The one way the cart changes. Persisting, re-quoting postage for the new
     contents and redrawing are the same event, and splitting them is how a
     total ends up describing a cart that is no longer there. */
  function changed() {
    save();
    quoteSoon();
  }

  /* ── shipping ────────────────────────────────────────────── */

  /* status: 'idle' | 'quoting' | 'quoted' | 'unavailable' */
  const shipping = { country: null, status: 'idle', rate: null, currency: 'USD' };
  let quoteTimer = null;
  let quoteToken = 0;

  function savedCountry() {
    try {
      const saved = localStorage.getItem(COUNTRY_KEY);
      if (saved) return saved;
    } catch { /* private mode */ }

    // A better first guess than always GB, and it is only a default: the
    // picker is right there, and Stripe collects the real address anyway.
    const region = (navigator.language || '').split('-')[1];
    return region ? region.toUpperCase() : null;
  }

  async function loadCountries() {
    const select = document.getElementById('cartCountry');
    if (!select) return;

    try {
      const res = await fetch('/api/shipping-rates');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data.countries) ? data.countries : [];
      if (!list.length) throw new Error('no countries');

      select.innerHTML = list
        .map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.name)}</option>`)
        .join('');

      const wanted = savedCountry();
      const supported = list.some((c) => c.code === wanted);
      shipping.country = supported ? wanted : data.default || list[0].code;
      select.value = shipping.country;
      select.disabled = false;

      quoteSoon();
    } catch (err) {
      // No picker means no quote, and the total says so rather than lying.
      select.closest('.cart__ship')?.setAttribute('hidden', '');
      shipping.status = 'unavailable';
      render();
    }
  }

  function setCountry(code) {
    shipping.country = code;
    try {
      localStorage.setItem(COUNTRY_KEY, code);
    } catch { /* private mode */ }
    quoteSoon();
  }

  /* Debounced, because holding the + button is a burst of cart changes and
     each one would otherwise be a round trip to Printful. */
  function quoteSoon() {
    clearTimeout(quoteTimer);
    if (!cart.length || !shipping.country) {
      shipping.status = 'idle';
      shipping.rate = null;
    } else {
      shipping.status = 'quoting';
      quoteTimer = setTimeout(quoteShipping, QUOTE_DEBOUNCE_MS);
    }
    render();
  }

  async function quoteShipping() {
    const token = ++quoteToken;
    try {
      const res = await fetch('/api/shipping-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: shipping.country,
          items: cart.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        }),
      });
      const data = await res.json();
      // A slow answer to an old cart must not overwrite a fast answer to the
      // current one.
      if (token !== quoteToken) return;
      if (!res.ok || !Array.isArray(data.rates) || !data.rates.length) throw new Error('no rates');

      const cheapest = data.rates.reduce((a, b) => (b.rate < a.rate ? b : a));
      shipping.rate = cheapest;
      shipping.currency = cheapest.currency || shipping.currency;
      shipping.status = 'quoted';
    } catch (err) {
      if (token !== quoteToken) return;
      // Checkout is deliberately still allowed: the server quotes again, and a
      // Printful hiccup here should not stop someone buying a jacket.
      shipping.rate = null;
      shipping.status = 'unavailable';
    }
    render();
  }

  /* ── markup ──────────────────────────────────────────────── */

  const MARKUP = `
    <button class="cart__toggle" id="cartToggle" type="button" aria-haspopup="dialog" aria-controls="cartDrawer" hidden>
      <span class="cart__toggle-label">Cart</span>
      <span class="cart__count" id="cartCount">0</span>
    </button>
    <div class="cart" id="cartDrawer" role="dialog" aria-modal="true" aria-labelledby="cartTitle" hidden>
      <div class="cart__panel">
        <div class="cart__head">
          <h2 class="cart__title" id="cartTitle">Your cart</h2>
          <button class="cart__close" id="cartClose" type="button" aria-label="Close cart">&times;</button>
        </div>
        <ul class="cart__items" id="cartItems"></ul>
        <div class="cart__foot">
          <div class="cart__ship">
            <label class="cart__ship-label" for="cartCountry">Ship to</label>
            <select class="cart__ship-select" id="cartCountry" disabled>
              <option>Loading&hellip;</option>
            </select>
          </div>
          <dl class="cart__totals">
            <div><dt>Subtotal</dt><dd id="cartSubtotal">&mdash;</dd></div>
            <div><dt>Shipping</dt><dd id="cartShipping">&mdash;</dd></div>
            <div class="cart__grand"><dt>Total</dt><dd id="cartTotal">&mdash;</dd></div>
          </dl>
          <button class="btn btn--primary cart__checkout" id="cartCheckout" type="button" disabled>Checkout</button>
          <p class="cart__note" id="cartNote"></p>
        </div>
      </div>
    </div>`;

  function mount() {
    if (document.getElementById('cartDrawer')) return;
    const host = document.createElement('div');
    host.className = 'cart__host';
    host.innerHTML = MARKUP;
    document.body.appendChild(host);
  }

  /* ── rendering ───────────────────────────────────────────── */

  function render() {
    const itemsEl = document.getElementById('cartItems');
    if (!itemsEl) return;

    const countEl = document.getElementById('cartCount');
    const toggleEl = document.getElementById('cartToggle');
    const checkoutBtn = document.getElementById('cartCheckout');

    const n = count();
    if (countEl) countEl.textContent = String(n);
    if (toggleEl) toggleEl.hidden = n === 0;

    if (!cart.length) {
      itemsEl.innerHTML = '<li class="cart__empty">Your cart is empty.</li>';
      setTotals(null);
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }

    let subtotal = 0;
    let currency = 'USD';
    itemsEl.innerHTML = cart.map((item) => {
      subtotal += item.price * item.quantity;
      currency = item.currency || currency;
      const label = item.variantName ? `${item.name} — ${item.variantName}` : item.name;
      const image = mockup(item.image, 160);
      return `
        <li class="cart__item" data-variant="${item.variantId}">
          <span class="cart__item-media">
            ${image ? `<img src="${escapeHtml(image)}" alt="" width="80" height="80" loading="lazy" decoding="async">` : ''}
          </span>
          <span class="cart__item-name">${escapeHtml(label)}</span>
          <span class="cart__item-qty">
            <button type="button" data-qty="-1" aria-label="Decrease quantity">&minus;</button>
            <span>${item.quantity}</span>
            <button type="button" data-qty="1" aria-label="Increase quantity">+</button>
          </span>
          <span class="cart__item-price">${escapeHtml(money(item.price * item.quantity, item.currency))}</span>
          <button type="button" class="cart__item-remove" data-remove aria-label="Remove ${escapeHtml(label)}">&times;</button>
        </li>`;
    }).join('');

    itemsEl.querySelectorAll('[data-qty]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const variantId = Number(btn.closest('.cart__item').dataset.variant);
        const item = cart.find((i) => i.variantId === variantId);
        if (item) setQuantity(variantId, item.quantity + Number(btn.dataset.qty));
      });
    });
    itemsEl.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        remove(Number(btn.closest('.cart__item').dataset.variant));
      });
    });

    setTotals({ subtotal, currency });
    if (checkoutBtn) checkoutBtn.disabled = shipping.status === 'quoting';
  }

  function setTotals(totals) {
    const subtotalEl = document.getElementById('cartSubtotal');
    const shippingEl = document.getElementById('cartShipping');
    const totalEl = document.getElementById('cartTotal');
    if (!totalEl) return;

    if (!totals) {
      if (subtotalEl) subtotalEl.textContent = '—';
      if (shippingEl) shippingEl.textContent = '—';
      totalEl.textContent = '—';
      return;
    }

    const { subtotal, currency } = totals;
    if (subtotalEl) subtotalEl.textContent = money(subtotal, currency);

    if (shipping.status === 'quoted' && shipping.rate) {
      if (shippingEl) shippingEl.textContent = money(shipping.rate.rate, shipping.rate.currency);
      totalEl.textContent = money(subtotal + shipping.rate.rate, currency);
    } else {
      if (shippingEl) {
        shippingEl.textContent =
          shipping.status === 'quoting' ? 'Working it out…' : 'At checkout';
      }
      totalEl.textContent = money(subtotal, currency);
    }
  }

  function open() {
    const drawer = document.getElementById('cartDrawer');
    if (drawer) drawer.hidden = false;
  }

  function close() {
    const drawer = document.getElementById('cartDrawer');
    if (drawer) drawer.hidden = true;
  }

  /* ── checkout ────────────────────────────────────────────── */

  function handleOrderReturn() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('order');
    if (!status) return;

    const note = document.getElementById('cartNote');
    if (status === 'success') {
      cart = [];
      save();
      render();
      if (note) note.textContent = 'Thanks — your order is confirmed. A receipt is on its way to your email.';
      open();
    } else if (note) {
      note.textContent = 'Checkout was cancelled — your cart is still here.';
      open();
    }

    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }

  function init() {
    mount();

    const toggle = document.getElementById('cartToggle');
    const closeBtn = document.getElementById('cartClose');
    const checkout = document.getElementById('cartCheckout');
    const note = document.getElementById('cartNote');
    const drawer = document.getElementById('cartDrawer');
    const country = document.getElementById('cartCountry');

    if (toggle) toggle.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer && !drawer.hidden) close();
    });

    if (country) country.addEventListener('change', () => setCountry(country.value));

    if (checkout) {
      checkout.addEventListener('click', async () => {
        if (!cart.length) return;
        checkout.disabled = true;
        checkout.textContent = 'Redirecting…';
        if (note) note.textContent = '';
        try {
          const res = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              country: shipping.country,
              items: cart.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.url) throw new Error(data.error || 'Checkout failed');
          window.location.href = data.url;
        } catch (err) {
          /* Show the server's own words. "That's no longer available" and
             "we don't ship there yet" are things the reader can act on, and a
             blanket apology leaves them stuck. Each message is written to
             stand on its own, so nothing is appended to it here. */
          if (note) note.textContent = `${err.message || 'Couldn’t start checkout — try again in a moment'}.`;
          checkout.disabled = false;
          checkout.textContent = 'Checkout';
        }
      });
    }

    handleOrderReturn();
    render();
    loadCountries();
  }

  return {
    init,
    add,
    remove,
    setQuantity,
    open,
    close,
    render,
    count,
    money,
    copy,
    escapeHtml,
    mockup,
    priceLabel,
    productHref,
    productTitle,
    productCard,
    swatchColor,
  };
})();
