'use strict';

/* node --test test/mockup.test.js

   npm cannot install into this repo's folder (it lives on a Google Drive
   mount, where npm fails with EBADF), so these run from a workspace that has
   node_modules and points NODE_PATH at it:

     NODE_PATH=<workspace>/node_modules node --test "<repo>/test"

   Fixtures are synthesised rather than downloaded, so the suite is
   deterministic and says something about the algorithm rather than about
   whatever Printful is serving today. */

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const { dekey } = require('../lib/mockup');

const SIZE = 400;

/* A shape of `fill`, optionally ringed by `edge`, standing on `backdrop`. */
async function fixture({ backdrop = '#ffffff', fill, edge = null, alpha = true }) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
      <rect width="${SIZE}" height="${SIZE}" fill="${backdrop}"/>
      <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="120" fill="${fill}"
              ${edge ? `stroke="${edge}" stroke-width="4"` : ''}/>
    </svg>`;
  const img = sharp(Buffer.from(svg));
  return (alpha ? img.ensureAlpha() : img).png().toBuffer();
}

/* Alpha at the four corners — the actual claim, "no backdrop". */
function corners({ data, width, height }) {
  return [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]
    .map(([x, y]) => data[(y * width + x) * 4 + 3]);
}

/* How opaque the middle of the frame is. The product lives there. */
function centreOpacity({ data, width, height }) {
  let opaque = 0;
  let seen = 0;
  for (let y = Math.floor(height * 0.45); y < Math.floor(height * 0.55); y++) {
    for (let x = Math.floor(width * 0.45); x < Math.floor(width * 0.55); x++) {
      seen++;
      if (data[(y * width + x) * 4 + 3] > 200) opaque++;
    }
  }
  return opaque / seen;
}

test('a dark garment on white comes off its backdrop', async () => {
  const cut = await dekey(await fixture({ fill: '#2a2a2a' }));

  assert.equal(cut.keyed, true);
  assert.equal(cut.pass, 'generous');
  assert.deepEqual(corners(cut), [0, 0, 0, 0], 'the corners must be fully transparent');
  assert.equal(centreOpacity(cut), 1, 'the garment itself must survive intact');
});

test('a white garment on white survives — the flood must not walk into it', async () => {
  // The white Adidas cap: a crown a few levels below the studio white, held
  // apart from it only by the shading around its silhouette.
  const cut = await dekey(await fixture({ fill: '#fafafa', edge: '#ebebeb' }));

  assert.equal(cut.keyed, true);
  assert.equal(cut.pass, 'tight', 'the generous pass leaks here and must be rejected');
  assert.deepEqual(corners(cut), [0, 0, 0, 0], 'the corners must still be transparent');
  assert.equal(centreOpacity(cut), 1, 'the cap must not be eaten');
});

test('the retry is what saves it, not luck — the first pass really does leak', async () => {
  /* A check nobody has watched fail is not a check. The test above would pass
     just as happily if the generous pass had never been in danger, so this
     reads the rejected attempt back and asserts it *did* flood the middle of
     the frame. If a future threshold change makes the first pass safe here,
     this goes red and the fixture needs to get harder. */
  const cut = await dekey(await fixture({ fill: '#fafafa', edge: '#ebebeb' }));
  const generous = cut.attempts.find((a) => a.pass === 'generous');

  assert.ok(generous, 'the generous pass must have been tried first');
  assert.equal(generous.accepted, false, 'and must have been rejected');
  assert.ok(
    generous.centre > 0.5,
    `expected it to flood the centre, but it only took ${(generous.centre * 100).toFixed(1)}%`
  );
});

test('an already cut-out mockup is passed through untouched', async () => {
  const transparent = await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
             <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="120" fill="#2a2a2a"/>
           </svg>`
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

  const cut = await dekey(transparent);

  assert.equal(cut.keyed, false);
  assert.equal(cut.pass, 'already-cut-out');
  assert.deepEqual(corners(cut), [0, 0, 0, 0]);
  assert.equal(centreOpacity(cut), 1);
});

test('a backdrop that is not there is left alone rather than invented', async () => {
  // A mockup shot on mid grey: nothing near white, so nothing to remove.
  const cut = await dekey(await fixture({ backdrop: '#6e6e6e', fill: '#2a2a2a' }));

  assert.equal(cut.keyed, false);
  assert.equal(cut.pass, 'left-alone');
  assert.deepEqual(corners(cut), [255, 255, 255, 255], 'the original pixels come back as they were');
});
