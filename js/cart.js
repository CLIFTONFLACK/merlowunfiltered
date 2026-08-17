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
   ─────────────────────────────────────────────────────────── */

window.Merlow = (function () {
  const CART_KEY = 'merlow-cart-v2';
  const MAX_PER_LINE = 10;

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

  /* Cheapest variant, marked "from" only where the variants actually differ —
     a one-variant cap should read as a flat price, not "from". */
  function priceLabel(variants) {
    if (!variants || !variants.length) return null;
    const low = Math.min(...variants.map((v) => v.price));
    const high = Math.max(...variants.map((v) => v.price));
    const amount = escapeHtml(money(low, variants[0].currency));
    return high > low ? `<span class="shop__price-from">from</span>${amount}` : amount;
  }

  function productHref(product) {
    return `/shop/${product.id}`;
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
    save();
    render();
    open();
  }

  function remove(variantId) {
    cart = cart.filter((i) => i.variantId !== variantId);
    save();
    render();
  }

  function setQuantity(variantId, quantity) {
    if (quantity < 1) return remove(variantId);
    const item = cart.find((i) => i.variantId === variantId);
    if (!item) return;
    item.quantity = Math.min(MAX_PER_LINE, quantity);
    save();
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
          <div class="cart__total"><span>Total</span><span id="cartTotal">&mdash;</span></div>
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
    const totalEl = document.getElementById('cartTotal');
    const toggleEl = document.getElementById('cartToggle');
    const checkoutBtn = document.getElementById('cartCheckout');

    const n = count();
    if (countEl) countEl.textContent = String(n);
    if (toggleEl) toggleEl.hidden = n === 0;

    if (!cart.length) {
      itemsEl.innerHTML = '<li class="cart__empty">Your cart is empty.</li>';
      if (totalEl) totalEl.textContent = '—';
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }

    let total = 0;
    let currency = 'USD';
    itemsEl.innerHTML = cart.map((item) => {
      total += item.price * item.quantity;
      currency = item.currency || currency;
      const label = item.variantName
        ? `${item.name} — ${item.variantName}`
        : item.name;
      return `
        <li class="cart__item" data-variant="${item.variantId}">
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

    if (totalEl) totalEl.textContent = money(total, currency);
    if (checkoutBtn) checkoutBtn.disabled = false;
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

    if (toggle) toggle.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer && !drawer.hidden) close();
    });

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
              items: cart.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.url) throw new Error(data.error || 'Checkout failed');
          window.location.href = data.url;
        } catch (err) {
          if (note) note.textContent = 'Couldn’t start checkout — try again in a moment.';
          checkout.disabled = false;
          checkout.textContent = 'Checkout';
        }
      });
    }

    handleOrderReturn();
    render();
  }

  return { init, add, remove, setQuantity, open, close, render, count, money, escapeHtml, priceLabel, productHref };
})();
