/* ═══════════════════════════════════════════════════════════
   MERLOW — UNFILTERED
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ───────────────────────────────────────────────────────────
   1. YOUTUBE IDS — THE ONLY PLACE YOU EDIT

   Paste the 11-character YouTube video ID between the quotes.
   From https://www.youtube.com/watch?v=dQw4w9WgXcQ  →  'dQw4w9WgXcQ'

   Any slot left empty renders as a "not yet released" tile, so
   the layout stays correct while the rest of the record lands.
   ─────────────────────────────────────────────────────────── */

const CHANNEL_URL = 'https://www.youtube.com/@MerlowHQ';
const PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLEjCGD4tGVKQ';

const VIDEOS = {
  featured:   '-XMXp3gifag',   // the Marcus Whitefield cut, as the album's calling card

  'track-01': 'A3Bn3vJVUB8',   // Caldwell            — Indie UK
  'track-02': '-XMXp3gifag',   // Marcus Whitefield   — Indie UK
  'track-03': 'meuu3SeXyaE',   // Clara.B.            — A Capella
  'track-04': '_HOLLTDt3co',   // Ellison Sisters     — A Capella
  'track-05': 'zLWAso5D7yc',   // Edith Vale          — Country Rock
  'track-06': 'lgwP56wD8so',   // Ashworth            — Folk Anthem
  'track-07': 'SYB_n0iSxng',   // Rachel Heart        — Folk Anthem
  'track-08': 'bV3C4U2hQcQ',   // Darius Kohan        — OldSkool Rap
  'track-09': 'ZxZVDCCGOG4',   // Ben-D               — OldSkool Rap
  'track-10': 'I6I3zKhUOaE',   // The Hallorans       — Power Pop
  'track-11': '7u3vxmxrJMM',   // Five Roses          — Power Pop
  'track-12': 'jNuNULtmwAs',   // The Nazarians       — Rap Funk
  'track-13': 'MD9uI8PYPf0',   // Oko Funk Syndicate  — Rap Funk
  'track-14': 'ZuS1k-Bj0j8',   // Mansour Drive       — Rock Anthem
  'track-15': 'VurVtUUdo_s',   // Black Rosen         — Rock Anthem
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

const reduceMotion = window.MerlowReveal.reduceMotion;

/* ───────────────────────────────────────────────────────────
   2. Tracklist
   ─────────────────────────────────────────────────────────── */

function buildTracklist() {
  const list = document.getElementById('tracklist');
  if (!list) return;

  TRACKS.forEach((track, i) => {
    const n = String(i + 1).padStart(2, '0');
    const panelId = `track-panel-${n}`;

    /* A row with no video behind it still opens — it just opens onto the
       "not yet released" tile. Say so on the row itself rather than making
       someone click to find out. */
    const pending = !(VIDEOS[`track-${n}`] || '').trim();

    const li = document.createElement('li');
    li.className = pending ? 'track track--pending' : 'track';
    li.innerHTML = `
      <button class="track__btn" type="button"
              aria-expanded="false" aria-controls="${panelId}">
        <span class="track__num">${n}</span>
        <span class="track__artist">${track.artist}</span>
        <span class="track__genre">${track.genre}${pending ? ' <span class="track__soon">Soon</span>' : ''}</span>
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
    /* Public-facing, because this renders on the live site: a visitor opening
       one of the tracks still to land should be told that, not shown the
       source file it gets pasted into. */
    slot.innerHTML = `
      <div class="yt__placeholder">
        <span class="yt__badge">Not yet released</span>
        <p class="yt__label">${title}</p>
        <p class="yt__hint">Dropping soon &mdash; <a href="${CHANNEL_URL}" rel="noopener">subscribe on YouTube</a></p>
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

/* Lives in js/reveal.js now, because /shop and the product pages need it too
   and an element carrying `.reveal` on a page without it never becomes
   visible. */
const initReveal = () => window.MerlowReveal.init();

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

const { money, escapeHtml, priceLabel, productHref } = window.Merlow;

/* How many products the home page previews before sending you to /shop. */
const HOME_PREVIEW = 3;

/* The home cards are a window onto the shop, not the shop itself: picture,
   name, price, and a way through. Sizes and colours are chosen on the product
   page, where there is room to show what you are choosing between. */
function renderProductCard(product) {
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

async function loadShop() {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;

  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const products = Array.isArray(data.products) ? data.products : [];

    if (!products.length) {
      grid.innerHTML = '<li class="shop__status reveal">The shop is being stocked — check back soon.</li>';
      return;
    }

    grid.innerHTML = products.slice(0, HOME_PREVIEW).map(renderProductCard).join('');

    // Only worth pointing at the full shop when there is more behind it.
    const more = document.getElementById('shopMore');
    if (more) {
      more.hidden = false;
      const rest = products.length - HOME_PREVIEW;
      more.textContent = rest > 0 ? `See all ${products.length} pieces` : 'See the full shop';
    }
  } catch (err) {
    grid.innerHTML = '<li class="shop__status reveal">Couldn&rsquo;t load the shop right now — refresh to try again.</li>';
  }
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
  window.Merlow.init();
  loadShop();
  initSignup();

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
});
