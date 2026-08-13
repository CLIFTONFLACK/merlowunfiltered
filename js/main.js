/* ═══════════════════════════════════════════════════════════
   MERLOW — UNFILTERED
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ───────────────────────────────────────────────────────────
   1. YOUTUBE IDS — THE ONLY PLACE YOU EDIT

   Paste the 11-character YouTube video ID between the quotes.
   From https://www.youtube.com/watch?v=dQw4w9WgXcQ  →  'dQw4w9WgXcQ'

   Any slot left empty renders as a labelled placeholder tile,
   so the layout stays correct while you fill them in.
   ─────────────────────────────────────────────────────────── */

const VIDEOS = {
  featured:   '9Us7JsDWFEg',   // Story 03 — official lyric video

  'track-01': '',   // Caldwell            — Indie UK
  'track-02': '',   // Marcus Whitefield   — Indie UK
  'track-03': '',   // Clara.B.            — A Capella
  'track-04': '',   // Ellison Sisters     — A Capella
  'track-05': '',   // Edith Vale          — Country Rock
  'track-06': '',   // Ashworth            — Folk Anthem
  'track-07': '',   // Rachel Heart        — Folk Anthem
  'track-08': '',   // Darius Kohan        — OldSkool Rap
  'track-09': '',   // Ben-D               — OldSkool Rap
  'track-10': '',   // The Hallorans       — Power Pop
  'track-11': '',   // Five Roses          — Power Pop
  'track-12': '',   // The Nazarians       — Rap Funk
  'track-13': '',   // Oko Funk Syndicate  — Rap Funk
  'track-14': '',   // Mansour Drive       — Rock Anthem
  'track-15': '',   // Black Rosen         — Rock Anthem
};

/* The record. Order = tracklist order. */
const TRACKS = [
  { artist: 'Caldwell',           genre: 'Indie UK' },
  { artist: 'Marcus Whitefield',  genre: 'Indie UK' },
  { artist: 'Clara.B.',           genre: 'A Capella' },
  { artist: 'Ellison Sisters',    genre: 'A Capella' },
  { artist: 'Edith Vale',         genre: 'Country Rock' },
  { artist: 'Ashworth',           genre: 'Folk Anthem' },
  { artist: 'Rachel Heart',       genre: 'Folk Anthem' },
  { artist: 'Darius Kohan',       genre: 'OldSkool Rap' },
  { artist: 'Ben-D',              genre: 'OldSkool Rap' },
  { artist: 'The Hallorans',      genre: 'Power Pop' },
  { artist: 'Five Roses',         genre: 'Power Pop' },
  { artist: 'The Nazarians',      genre: 'Rap Funk' },
  { artist: 'Oko Funk Syndicate', genre: 'Rap Funk' },
  { artist: 'Mansour Drive',      genre: 'Rock Anthem' },
  { artist: 'Black Rosen',        genre: 'Rock Anthem' },
];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ───────────────────────────────────────────────────────────
   2. Tracklist
   ─────────────────────────────────────────────────────────── */

function buildTracklist() {
  const list = document.getElementById('tracklist');
  if (!list) return;

  TRACKS.forEach((track, i) => {
    const n = String(i + 1).padStart(2, '0');
    const panelId = `track-panel-${n}`;

    const li = document.createElement('li');
    li.className = 'track';
    li.innerHTML = `
      <button class="track__btn" type="button"
              aria-expanded="false" aria-controls="${panelId}">
        <span class="track__num">${n}</span>
        <span class="track__artist">${track.artist}</span>
        <span class="track__genre">${track.genre}</span>
        <span class="track__chev" aria-hidden="true"></span>
      </button>
      <div class="track__panel" id="${panelId}" role="region"
           aria-label="${track.artist}, video">
        <div class="yt" data-yt="track-${n}"
             data-yt-title="UNFILTERED feat. ${track.artist} (${track.genre})"></div>
      </div>`;

    li.querySelector('.track__btn').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const panel = document.getElementById(panelId);
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      panel.classList.toggle('is-open', !open);
    });

    list.appendChild(li);
  });
}

/* ───────────────────────────────────────────────────────────
   3. YouTube slots

   Empty id  → placeholder tile.
   Filled id → click-to-load facade (thumbnail only; the iframe
               and everything YouTube ships with it are injected
               on click, not on page load).
   ─────────────────────────────────────────────────────────── */

function renderSlot(slot) {
  const key = slot.dataset.yt;
  const title = slot.dataset.ytTitle || 'Video';
  const id = (VIDEOS[key] || '').trim();

  if (!id) {
    slot.innerHTML = `
      <div class="yt__placeholder">
        <span class="yt__badge">YouTube ID pending</span>
        <p class="yt__label">${title}</p>
        <p class="yt__hint">js/main.js &rarr; VIDEOS['${key}']</p>
      </div>`;
    return;
  }

  slot.innerHTML = `
    <button class="yt__facade" type="button" aria-label="Play: ${title}">
      <span class="yt__play" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </span>
    </button>`;

  const facade = slot.querySelector('.yt__facade');

  /* hqdefault is 4:3 and letterboxes inside a 16:9 tile. maxresdefault is a
     true 16:9 frame but does not exist for every upload, so try it first and
     fall back rather than assuming either one. */
  const setThumb = (name) => {
    facade.style.backgroundImage = `url('https://i.ytimg.com/vi/${id}/${name}.jpg')`;
  };
  const probe = new Image();
  probe.onload = () => setThumb(probe.naturalWidth > 320 ? 'maxresdefault' : 'hqdefault');
  probe.onerror = () => setThumb('hqdefault');
  probe.src = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  setThumb('hqdefault');

  facade.addEventListener('click', () => {
    /* Stripped-back player: no annotations, no red progress bar, related
       videos held to this channel. Controls and keyboard are left alone —
       they are what makes the player usable, not branding. */
    const params = new URLSearchParams({
      autoplay: '1',
      rel: '0',
      modestbranding: '1',
      iv_load_policy: '3',
      playsinline: '1',
      color: 'white',
    });
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?${params}`;
    iframe.title = title;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    slot.replaceChildren(iframe);
  });
}

function buildVideoSlots() {
  document.querySelectorAll('.yt[data-yt]').forEach(renderSlot);
}

/* ───────────────────────────────────────────────────────────
   4. Scroll reveal
   ─────────────────────────────────────────────────────────── */

function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

  items.forEach((el) => io.observe(el));
}

/* ───────────────────────────────────────────────────────────
   5. Hero video

   Autoplay is refused in some contexts even when muted. Rather
   than leave a dead frame, fall back to the poster and, if the
   user prefers reduced motion, never start it at all.
   ─────────────────────────────────────────────────────────── */

function initHeroVideo() {
  const video = document.getElementById('heroVideo');
  if (!video) return;

  if (reduceMotion) {
    video.autoplay = false;
    video.removeAttribute('autoplay');
    video.pause();
    return;
  }

  const play = video.play();
  if (play && typeof play.catch === 'function') {
    play.catch(() => { /* poster stands in — nothing else to do */ });
  }
}

/* ───────────────────────────────────────────────────────────
   6. Story clips

   Three silent loops, `preload="none"` so none of them is
   fetched on page load — each starts only when its band is on
   screen and pauses when it leaves. Under reduced motion they
   never start, and the poster frame stands in.
   ─────────────────────────────────────────────────────────── */

function initStoryVideos() {
  const clips = document.querySelectorAll('.band__video');
  if (!clips.length || reduceMotion || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const v = entry.target;
      if (entry.isIntersecting) {
        if (v.preload === 'none') v.preload = 'auto';
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => { /* poster stands in */ });
      } else {
        v.pause();
      }
    });
  }, { rootMargin: '100px 0px', threshold: 0.25 });

  clips.forEach((v) => io.observe(v));
}

/* ───────────────────────────────────────────────────────────
   7. Shop — Printful catalog + cart

   Products load from /api/products (a serverless proxy in front of
   Printful, keeping the API token server-side). The cart itself is
   just localStorage; checkout hands the cart to /api/create-checkout-
   session, which builds a Stripe Checkout Session and returns its
   hosted URL — the browser is redirected there directly, so no
   Stripe.js or publishable key is needed on this page at all.
   ─────────────────────────────────────────────────────────── */

const CART_KEY = 'merlow-cart-v1';

let shopCatalog = [];
let cart = loadCart();

function loadCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function money(amount, currency) {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function findVariant(variantId) {
  for (const product of shopCatalog) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

function addToCart(variantId, quantity) {
  const existing = cart.find((item) => item.variantId === variantId);
  if (existing) {
    existing.quantity = Math.min(10, existing.quantity + quantity);
  } else {
    cart.push({ variantId, quantity });
  }
  saveCart();
  renderCart();
  openCart();
}

function removeFromCart(variantId) {
  cart = cart.filter((item) => item.variantId !== variantId);
  saveCart();
  renderCart();
}

function setQuantity(variantId, quantity) {
  if (quantity < 1) return removeFromCart(variantId);
  const item = cart.find((i) => i.variantId === variantId);
  if (!item) return;
  item.quantity = Math.min(10, quantity);
  saveCart();
  renderCart();
}

function renderProductCard(product) {
  const variants = product.variants || [];
  const image = product.thumbnail || (variants[0] && variants[0].image) || '';
  const options = variants
    .map((v) => `<option value="${v.id}">${escapeHtml(v.name)} — ${money(v.price, v.currency)}</option>`)
    .join('');

  return `
    <li class="shop__item reveal">
      <span class="shop__media">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async">` : ''}
      </span>
      <span class="shop__meta">
        <span class="shop__name">${escapeHtml(product.name)}</span>
      </span>
      ${variants.length ? `
        <form class="shop__form" data-add-to-cart="${product.id}">
          <label class="shop__label" for="variant-${product.id}">Size / option</label>
          <select class="shop__select" id="variant-${product.id}" required>
            <option value="" disabled selected>Choose an option</option>
            ${options}
          </select>
          <button class="btn btn--line shop__add" type="submit">Add to cart</button>
        </form>` : `<p class="shop__note">Currently unavailable</p>`}
    </li>`;
}

async function loadShop() {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;

  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    shopCatalog = Array.isArray(data.products) ? data.products : [];

    if (!shopCatalog.length) {
      grid.innerHTML = '<li class="shop__status reveal">The shop is being stocked — check back soon.</li>';
      return;
    }

    grid.innerHTML = shopCatalog.map(renderProductCard).join('');
    grid.querySelectorAll('[data-add-to-cart]').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const select = form.querySelector('select');
        const variantId = Number(select.value);
        if (!variantId) return;
        addToCart(variantId, 1);
      });
    });
    renderCart();
  } catch (err) {
    grid.innerHTML = '<li class="shop__status reveal">Couldn&rsquo;t load the shop right now — refresh to try again.</li>';
  }
}

function renderCart() {
  const countEl = document.getElementById('cartCount');
  const itemsEl = document.getElementById('cartItems');
  const totalEl = document.getElementById('cartTotal');
  const toggleEl = document.getElementById('cartToggle');
  const checkoutBtn = document.getElementById('cartCheckout');
  if (!itemsEl) return;

  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  if (countEl) countEl.textContent = String(count);
  if (toggleEl) toggleEl.hidden = count === 0;

  if (!cart.length) {
    itemsEl.innerHTML = '<li class="cart__empty">Your cart is empty.</li>';
    if (totalEl) totalEl.textContent = '—';
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }

  let total = 0;
  let currency = 'GBP';
  itemsEl.innerHTML = cart.map((item) => {
    const found = findVariant(item.variantId);
    if (!found) return '';
    const { product, variant } = found;
    total += variant.price * item.quantity;
    currency = variant.currency || currency;
    return `
      <li class="cart__item" data-variant="${variant.id}">
        <span class="cart__item-name">${escapeHtml(product.name)} — ${escapeHtml(variant.name)}</span>
        <span class="cart__item-qty">
          <button type="button" data-qty="-1" aria-label="Decrease quantity">&minus;</button>
          <span>${item.quantity}</span>
          <button type="button" data-qty="1" aria-label="Increase quantity">+</button>
        </span>
        <span class="cart__item-price">${money(variant.price * item.quantity, variant.currency)}</span>
        <button type="button" class="cart__item-remove" data-remove aria-label="Remove item">&times;</button>
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
      removeFromCart(Number(btn.closest('.cart__item').dataset.variant));
    });
  });

  if (totalEl) totalEl.textContent = money(total, currency);
  if (checkoutBtn) checkoutBtn.disabled = false;
}

function openCart() {
  const drawer = document.getElementById('cartDrawer');
  if (drawer) drawer.hidden = false;
}

function closeCart() {
  const drawer = document.getElementById('cartDrawer');
  if (drawer) drawer.hidden = true;
}

function handleOrderReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('order');
  if (!status) return;

  const note = document.getElementById('cartNote');
  if (status === 'success') {
    cart = [];
    saveCart();
    if (note) note.textContent = 'Thanks — your order is confirmed. A receipt is on its way to your email.';
    openCart();
  } else if (note) {
    note.textContent = 'Checkout was cancelled — your cart is still here.';
  }

  history.replaceState(null, '', window.location.pathname + window.location.hash);
}

function initCart() {
  const toggle = document.getElementById('cartToggle');
  const close = document.getElementById('cartClose');
  const checkout = document.getElementById('cartCheckout');
  const note = document.getElementById('cartNote');

  if (toggle) toggle.addEventListener('click', openCart);
  if (close) close.addEventListener('click', closeCart);

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
  renderCart();
}

/* ───────────────────────────────────────────────────────────
   8. Mailing-list placeholder
   ─────────────────────────────────────────────────────────── */

function initSignup() {
  const form = document.getElementById('signup');
  const note = document.getElementById('signupNote');
  if (!form || !note) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    note.textContent =
      'Not connected yet. No provider is wired up, so nothing was sent.';
    note.dataset.state = 'ok';
  });
}

/* ───────────────────────────────────────────────────────────
   Boot
   ─────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  buildTracklist();
  buildVideoSlots();
  initReveal();
  initHeroVideo();
  initStoryVideos();
  initCart();
  loadShop();
  initSignup();

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
});
