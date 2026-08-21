'use strict';

/* Takes the backdrop off a product mockup.

   Printful hands back two different kinds of image for the same store. The
   per-variant mockups already carry an alpha channel; the product-level
   `thumbnail_url` is the same garment flattened onto white. On a near-black
   card the flattened ones show as a bright white box, and the two kinds sit
   side by side in the same grid.

   `lib/printful.js` prefers the cut-out variant mockup, so most images arrive
   here already transparent and pass straight through. This exists for the ones
   that don't — a product whose only image is flattened — so the promise
   "no backdrop" holds for whatever Brian syncs next, not just for today's five.

   The obvious implementation — make every white pixel transparent — destroys
   the white Adidas cap, whose crown is the same white as the backdrop it
   stands on. Two things stop that:

     1. The backdrop is found by flooding inward from the border, so only
        backdrop *connected to the edge* is removed. Enclosed white is safe.
     2. Flooding can still slip through a soft edge into a white subject, so
        the result is checked: if the middle of the frame came out empty, the
        key ate the product. It then retries hugging the sampled backdrop
        colour, and failing that gives the original back untouched. A mockup
        with a white box behind it is worse than one without; a mockup with a
        hole through the product is worse than both. */

const sharp = require('sharp');

/* First pass. A pixel is backdrop if it is bright and neutral; between SOFT
   and HARD it is partly backdrop, which turns the garment's anti-aliased
   outline and its drop shadow into an alpha ramp rather than a jagged cut. */
const HARD_L = 248;
const SOFT_L = 204;
const MAX_CHROMA = 26; // channel spread above which a pixel is a colour, not grey

/* Second pass, used only when the first one leaked. Measured against the
   backdrop's own sampled luminance instead of a fixed value: the studio white
   is exactly 255 and the white cap never quite reaches it, so a few levels is
   the whole difference between them. Swept 8/12/16/20/26 against the white
   Adidas cap: 12 already nicks the crown and 26 takes most of the hat, so the
   ramp stays deliberately narrow and a little of the mockup's own soft shadow
   survives around the brim. */
const TIGHT_HARD_DROP = 3;
const TIGHT_SOFT_DROP = 8;

/* The product always occupies the middle of a mockup. If this much of the
   centre box is gone, the flood is inside the product, not behind it. */
const CENTRE_BOX = 0.4;
const CENTRE_LEAK = 0.5;

/* Below this there was no backdrop worth removing. */
const MIN_REMOVED = 0.005;

/**
 * @param {Buffer} input any image sharp can read
 * @returns {Promise<{data: Buffer, width: number, height: number, keyed: boolean,
 *                    removed: number, pass: string}>}
 *   RGBA pixels with the backdrop taken out. `keyed: false` means the pixels
 *   are exactly as they arrived — either already cut out, or not safely
 *   cuttable — and `pass` says which of those it was. `attempts` records what
 *   each pass would have removed, including the ones that were rejected.
 */
async function dekey(input) {
  const source = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = source.info;

  if (borderIsTransparent(source.data, width, height)) {
    return {
      ...frame(source, width, height),
      keyed: false,
      removed: 0,
      pass: 'already-cut-out',
      attempts: [],
    };
  }

  const backdrop = sampleBackdrop(source.data, width, height);
  const attempts = [];

  for (const [pass, limits] of [
    ['generous', { hard: HARD_L, soft: SOFT_L }],
    ['tight', { hard: backdrop.luma - TIGHT_HARD_DROP, soft: backdrop.luma - TIGHT_SOFT_DROP }],
  ]) {
    const data = Buffer.from(source.data); // each attempt starts from the original
    const backdropness = measureBackdrop(data, width, height, limits);
    const { removed, centre } = floodFromBorder(data, backdropness, width, height);
    const fraction = removed / (width * height);
    const accepted = fraction >= MIN_REMOVED && centre <= CENTRE_LEAK;

    // Kept on the way out so a caller — or a test — can see what each pass
    // would have done, rather than only which one won.
    attempts.push({ pass, removed: fraction, centre, accepted });

    if (fraction < MIN_REMOVED) break; // nothing found; a tighter pass finds less
    if (accepted) return { data, width, height, keyed: true, removed: fraction, pass, attempts };
  }

  return { ...frame(source, width, height), keyed: false, removed: 0, pass: 'left-alone', attempts };
}

function frame(source, width, height) {
  return { data: source.data, width, height };
}

/* Sampled along all four edges rather than at the corners alone: a mockup can
   be cut out and still have the garment running off one side. */
function borderIsTransparent(data, width, height) {
  let clear = 0;
  let seen = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 64));

  const look = (x, y) => {
    seen++;
    if (data[(y * width + x) * 4 + 3] < 16) clear++;
  };

  for (let x = 0; x < width; x += step) {
    look(x, 0);
    look(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    look(0, y);
    look(width - 1, y);
  }

  return seen > 0 && clear / seen > 0.5;
}

/* The most common colour along the border, which is the backdrop unless the
   product runs off the edge. Median rather than mean so one dark pixel of
   garment doesn't drag the reading down. */
function sampleBackdrop(data, width, height) {
  const lumas = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 128));

  const look = (x, y) => {
    const i = (y * width + x) * 4;
    lumas.push(luma(data[i], data[i + 1], data[i + 2]));
  };

  for (let x = 0; x < width; x += step) {
    look(x, 0);
    look(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    look(0, y);
    look(width - 1, y);
  }

  lumas.sort((a, b) => a - b);
  return { luma: lumas[Math.floor(lumas.length / 2)] || 255 };
}

function luma(r, g, b) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/* 0 = subject, 255 = backdrop, in between = the ramp across an edge or a
   shadow. Stored per pixel so the flood can carry the ramp into the alpha
   channel instead of thresholding it away. */
function measureBackdrop(data, width, height, { hard, soft }) {
  const out = new Uint8Array(width * height);
  const span = Math.max(1, hard - soft);

  for (let i = 0, p = 0; p < out.length; p++, i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    if (max - min > MAX_CHROMA) continue; // a colour, so not the grey backdrop

    const l = luma(r, g, b);
    if (l <= soft) continue;

    out[p] = l >= hard ? 255 : Math.round(((l - soft) / span) * 255);
  }

  return out;
}

/* Four-connected flood inward from every border pixel that looks like
   backdrop, writing the ramp straight into alpha. Iterative and typed — an
   800x800 mockup is 640k pixels and a recursive fill would blow the stack.
   Reports how much was taken overall, and how much of the centre box went
   with it, which is what tells a clean key from one that ate the product. */
function floodFromBorder(data, backdropness, width, height) {
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  let removed = 0;
  let centreRemoved = 0;

  const x0 = Math.floor((width * (1 - CENTRE_BOX)) / 2);
  const x1 = width - x0;
  const y0 = Math.floor((height * (1 - CENTRE_BOX)) / 2);
  const y1 = height - y0;
  const centreTotal = Math.max(1, (x1 - x0) * (y1 - y0));

  const push = (p) => {
    if (seen[p] || backdropness[p] === 0) return;
    seen[p] = 1;
    queue[tail++] = p;
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (head < tail) {
    const p = queue[head++];
    removed++;

    // 255 backdrop -> alpha 0; a half-lit shadow pixel keeps half its alpha.
    data[p * 4 + 3] = 255 - backdropness[p];

    const x = p % width;
    const y = (p - x) / width;
    if (x >= x0 && x < x1 && y >= y0 && y < y1) centreRemoved++;

    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (y > 0) push(p - width);
    if (y < height - 1) push(p + width);
  }

  return { removed, centre: centreRemoved / centreTotal };
}

/**
 * Full pipeline: fetched bytes in, an encoded image with no backdrop out.
 *
 * @param {Buffer} input
 * @param {{width?: number, format?: 'webp'|'png'}} options
 */
async function renderMockup(input, { width = 800, format = 'webp' } = {}) {
  const cut = await dekey(input);

  let pipeline = sharp(cut.data, { raw: { width: cut.width, height: cut.height, channels: 4 } });
  if (width && width < cut.width) {
    pipeline = pipeline.resize({ width, withoutEnlargement: true });
  }

  const body =
    format === 'png'
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : await pipeline.webp({ quality: 86, alphaQuality: 100, effort: 4 }).toBuffer();

  return {
    body,
    keyed: cut.keyed,
    removed: cut.removed,
    pass: cut.pass,
    contentType: format === 'png' ? 'image/png' : 'image/webp',
  };
}

module.exports = { dekey, renderMockup };
