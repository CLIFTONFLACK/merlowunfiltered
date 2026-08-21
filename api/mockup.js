'use strict';

/* GET /api/mockup?src=<printful image url>&w=800

   Serves a product mockup with the backdrop taken off, so every card in the
   shop sits on the page's own black rather than in a white box. See
   lib/mockup.js for how the cut is made and why it is careful.

   Printful's file URLs are content-addressed, so the answer for a given src
   never changes and can be cached at the edge for a year.

   If anything here fails — a bad fetch, an image sharp can't read — the
   request is redirected to the original Printful URL. The shop keeps working
   with the mockup it would have had before; it just keeps its backdrop. */

const { renderMockup } = require('../lib/mockup');

/* An open image proxy is a liability: it would let anyone fetch arbitrary URLs
   from this origin, and cache the result on Brian's CDN. Only Printful. */
const ALLOWED_HOST = /(^|\.)printful\.com$/i;

const MIN_WIDTH = 64;
const MAX_WIDTH = 1200;
const FETCH_TIMEOUT_MS = 8000;

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const src = params.get('src') || '';

  let source;
  try {
    source = new URL(src);
  } catch {
    return res.status(400).json({ error: 'A src image URL is required' });
  }
  if (source.protocol !== 'https:' || !ALLOWED_HOST.test(source.hostname)) {
    return res.status(400).json({ error: 'That image is not from Printful' });
  }

  const width = clamp(Number(params.get('w')) || 800, MIN_WIDTH, MAX_WIDTH);
  // WebP carries alpha at a fraction of PNG's weight, and every browser that
  // can display a cut-out mockup can read it. PNG is the honest fallback.
  const format = /image\/webp/.test(req.headers.accept || '') ? 'webp' : 'png';

  try {
    const upstream = await fetchWithTimeout(source.toString());
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);

    const input = Buffer.from(await upstream.arrayBuffer());
    const { body, contentType, keyed, pass } = await renderMockup(input, { width, format });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
    // Both formats are served from one URL, so caches must key on Accept.
    res.setHeader('Vary', 'Accept');
    // Lets the deploy check assert the cut actually happened rather than
    // inferring it from a 200, which a redirect would also give.
    res.setHeader('X-Mockup-Key', keyed ? pass : `none:${pass}`);
    return res.status(200).send(body);
  } catch (err) {
    console.error(`GET /api/mockup src=${source.hostname}${source.pathname} failed:`, err.message);
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.redirect(302, source.toString());
  }
};

async function fetchWithTimeout(url) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: abort.signal });
  } finally {
    clearTimeout(timer);
  }
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
