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
  featured:   '',   // Album section — official lyric video
  official:   '',   // Video section — official lyric video
  short:      '',   // Video section — chorus cut / short

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
           aria-label="${track.artist} — video">
        <div class="yt" data-yt="track-${n}"
             data-yt-title="UNFILTERED feat. ${track.artist} — ${track.genre}"></div>
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
    <button class="yt__facade" type="button"
            style="background-image:url('https://i.ytimg.com/vi/${id}/hqdefault.jpg')"
            aria-label="Play: ${title}">
      <span class="yt__play" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </span>
    </button>`;

  slot.querySelector('.yt__facade').addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
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
   7. Mailing-list placeholder
   ─────────────────────────────────────────────────────────── */

function initSignup() {
  const form = document.getElementById('signup');
  const note = document.getElementById('signupNote');
  if (!form || !note) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    note.textContent =
      'Not connected yet — no provider is wired up, so nothing was sent.';
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
  initSignup();

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
});
