/* Deploy check — run against a real deployment, preview or production.
 *
 *   NODE_PATH=<workspace>/node_modules node test/deploy-check.mjs https://merlow.space
 *
 * It asserts the two promises the shop makes that nothing else can: every
 * mockup it renders comes back with no backdrop and with the product still in
 * it, and postage to every country on offer is a real number from Printful.
 *
 * It also asks the checkout endpoint to open a session. On a deployment with
 * Stripe keys that is a real write — an unpaid Checkout Session, which costs
 * nothing, moves nothing and expires on its own, but it will show up in the
 * Stripe dashboard. On a deployment without them it asserts the endpoint says
 * so plainly instead of erroring. What it does not do is complete a payment;
 * that is the by-hand runbook in README.md.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const BASE = process.argv[2];
if (!BASE) {
  console.error('usage: node test/deploy-check.mjs <base-url>');
  process.exit(2);
}

/* Product-level thumbnails Printful flattened onto white. The site does not
   render these any more — lib/printful.js prefers the cut-out variant mockup —
   but they are the only real input that exercises the keying code, so the
   check pushes them through it on purpose. The white cap is the one that
   matters: a naive key removes the hat along with the backdrop.

   These are Printful's content-addressed URLs, so they are stable. If Printful
   ever re-renders a mockup the control below fails loudly rather than quietly
   testing nothing. */
const FLATTENED = {
  'white cap': 'https://files.cdn.printful.com/files/119/11915d89fb82490ddb4ec76e055a13ef_preview.png',
  'letterman jacket': 'https://files.cdn.printful.com/files/21b/21b0dfd05cdf731f0f884223c63686fe_preview.png',
  'denim tee': 'https://files.cdn.printful.com/files/822/8223b1e7fe16126965ffef278bb2a03b_preview.png',
};

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
}

/* Alpha at the four corners, and how opaque the middle tenth of the frame is.
   Between them: "the backdrop is gone" and "the product is not". */
async function measure(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]
    .map(([x, y]) => data[(y * width + x) * 4 + 3]);

  let opaque = 0;
  let seen = 0;
  for (let y = Math.floor(height * 0.45); y < Math.floor(height * 0.55); y++) {
    for (let x = Math.floor(width * 0.45); x < Math.floor(width * 0.55); x++) {
      seen++;
      if (data[(y * width + x) * 4 + 3] > 200) opaque++;
    }
  }

  return { corners, centre: opaque / seen };
}

async function proxied(url, width = 400) {
  const res = await fetch(`${BASE}/api/mockup?src=${encodeURIComponent(url)}&w=${width}`, {
    headers: { Accept: 'image/png' },
    redirect: 'manual',
  });
  return { res, buffer: res.status === 200 ? Buffer.from(await res.arrayBuffer()) : null };
}

/* ── the catalog ─────────────────────────────────────────── */

const { products } = await (await fetch(`${BASE}/api/products`)).json();
check('the catalog lists products', products.length > 0, `${products.length} products`);
check(
  'no product title still carries the boilerplate',
  products.every((p) => p.title && !/official\s+merlow/i.test(p.title)),
  products.map((p) => p.title).join(' | ')
);

/* ── every image the shop will actually render ───────────── */

const rendered = new Map();
for (const p of products) {
  if (p.thumbnail) rendered.set(p.thumbnail, `${p.title} card`);
  (p.images || []).forEach((img, n) => rendered.set(img, `${p.title} image ${n + 1}`));
}

for (const [url, label] of rendered) {
  const { res, buffer } = await proxied(url);
  if (!buffer) {
    check(`${label}: served by the proxy`, false, `HTTP ${res.status} — fell back to Printful with its backdrop`);
    continue;
  }
  const { corners, centre } = await measure(buffer);
  check(`${label}: no backdrop`, corners.every((a) => a === 0), `corners=${corners.join(',')}`);
  check(`${label}: product intact`, centre > 0.9, `centre ${(centre * 100).toFixed(0)}% opaque`);
}

/* ── the keying path itself ──────────────────────────────── */

for (const [label, url] of Object.entries(FLATTENED)) {
  // Control first: the raw file must really have a backdrop, or the assertion
  // below is being passed by an image that never needed keying.
  const raw = await measure(Buffer.from(await (await fetch(url)).arrayBuffer()));
  check(
    `${label}: the unkeyed original really is on white (control)`,
    raw.corners.every((a) => a === 255),
    `corners=${raw.corners.join(',')}`
  );

  const { res, buffer } = await proxied(url);
  if (!buffer) {
    check(`${label}: keyed by the proxy`, false, `HTTP ${res.status}`);
    continue;
  }
  const key = res.headers.get('x-mockup-key');
  const { corners, centre } = await measure(buffer);

  check(`${label}: the proxy actually keyed it`, /^(generous|tight)$/.test(key || ''), `key=${key}`);
  check(`${label}: backdrop gone`, corners.every((a) => a === 0), `corners=${corners.join(',')}`);
  check(`${label}: product intact`, centre > 0.9, `centre ${(centre * 100).toFixed(0)}% opaque`);
}

/* ── postage ─────────────────────────────────────────────── */

const { countries } = await (await fetch(`${BASE}/api/shipping-rates`)).json();
const variant = products.flatMap((p) => p.variants)[0];

for (const country of countries) {
  const res = await fetch(`${BASE}/api/shipping-rates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country: country.code, items: [{ variantId: variant.id, quantity: 1 }] }),
  });
  const data = await res.json();
  const rates = Array.isArray(data.rates) ? data.rates : [];
  const priced = res.ok && rates.length > 0 && rates.every((r) => r.rate > 0);

  check(`postage to ${country.name}`, priced, priced ? rates.map((r) => `${r.name} $${r.rate}`).join(', ') : JSON.stringify(data));
  check(
    `postage to ${country.name}: the rate name is not a stale date`,
    rates.every((r) => !/estimated delivery/i.test(r.name)),
    rates.map((r) => r.name).join(', ')
  );
}

/* ── the things that must be refused ─────────────────────── */

const unshippable = await fetch(`${BASE}/api/shipping-rates`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ country: 'ZZ', items: [{ variantId: variant.id, quantity: 1 }] }),
});
check('a country we do not ship to is refused', unshippable.status === 400, `HTTP ${unshippable.status}`);

const emptyCart = await fetch(`${BASE}/api/create-checkout-session`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ items: [], country: 'GB' }),
});
check('an empty cart cannot open a checkout', emptyCart.status === 400, `HTTP ${emptyCart.status}`);

/* Checkout is either wired up or deliberately not. Both are fine; a generic
   500 is not, and that is what an unconfigured deployment used to give. */
const live = await fetch(`${BASE}/api/create-checkout-session`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ items: [{ variantId: variant.id, quantity: 1 }], country: 'GB' }),
});
const liveBody = await live.json().catch(() => ({}));
if (live.status === 200) {
  check('checkout opens a Stripe session', /^https:\/\/checkout\.stripe\.com\//.test(liveBody.url || ''), liveBody.url);
} else {
  check(
    'checkout is off, and says so rather than erroring',
    live.status === 503,
    `HTTP ${live.status} ${JSON.stringify(liveBody)}`
  );
}

const offsite = await fetch(`${BASE}/api/mockup?src=${encodeURIComponent('https://example.com/a.png')}`, {
  redirect: 'manual',
});
check('the mockup proxy will not fetch a non-Printful host', offsite.status === 400, `HTTP ${offsite.status}`);

const unsigned = await fetch(`${BASE}/api/webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
check('an unsigned webhook is rejected', unsigned.status === 400, `HTTP ${unsigned.status}`);

console.log(failures ? `\n${failures} FAILED` : '\nall green');
process.exit(failures ? 1 : 0);
