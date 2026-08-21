'use strict';

/* Shared Printful API client used by the serverless functions in /api.
   Lives outside /api so Vercel doesn't turn it into its own endpoint. */

const PRINTFUL_BASE = 'https://api.printful.com';

function authHeaders() {
  const headers = {
    Authorization: `Bearer ${process.env.PRINTFUL_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
  // Only needed for account-level tokens (developers.printful.com) that can
  // see more than one store. Legacy per-store private tokens don't need it.
  if (process.env.PRINTFUL_STORE_ID) {
    headers['X-PF-Store-Id'] = process.env.PRINTFUL_STORE_ID;
  }
  return headers;
}

/* Returns the whole envelope, so callers that need `paging` can read it. */
async function printfulFetchFull(path, options = {}) {
  const res = await fetch(`${PRINTFUL_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || data?.result || res.statusText;
    throw new Error(`Printful ${path} failed (${res.status}): ${message}`);
  }
  return data;
}

async function printfulFetch(path, options = {}) {
  return (await printfulFetchFull(path, options)).result;
}

/* Printful pages /store/products at 20 by default and 100 at most, and returns
   the true count in `paging.total`. Without this the shop silently stops at the
   first page — the products beyond it just never appear, with no error to
   notice. Walks every page. */
async function fetchAllStoreProducts() {
  const PAGE = 100;
  const all = [];

  for (let offset = 0; ; offset += PAGE) {
    const { result, paging } = await printfulFetchFull(
      `/store/products?limit=${PAGE}&offset=${offset}`
    );
    const page = result || [];
    all.push(...page);

    const total = Number(paging?.total);
    const done = page.length < PAGE || (Number.isFinite(total) && all.length >= total);
    if (done) break;
  }

  return all;
}

/* Bounded fan-out. One detail request per product against Printful's 120/min
   limit, so a catalog of any size stays under it instead of firing every
   request at once. Preserves input order. */
async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/* Which mockup fronts a product card. Both options end up with no backdrop —
   /api/mockup sees to that — so this is only choosing the composition.

     'variant'  the mockup Brian picked for the first colourway. Printful
                always cuts these out, and they are sometimes a lifestyle shot,
                so the grid can mix a person in among the flat studio shots.
     'product'  Printful's own main image for the product. Consistently a flat
                studio shot, and consistently flattened onto white, so it
                leans on the keying in lib/mockup.js to be usable here.

   Flip the constant to change the whole grid. Changing which mockup a single
   product uses is a Printful job, not a code one. */
const CARD_IMAGE = 'variant';

const CACHE_MS = 60_000;
/* Catalog products are Printful's own blanks — a Bella+Canvas 3001 does not
   change its colour list this hour. Held far longer than the store's own
   products, and deduplicated, so enriching a shop full of tees costs one
   lookup rather than one per tee. */
const CATALOG_CACHE_MS = 30 * 60_000;

let cache = { at: 0, catalog: null };
const detailCache = new Map(); // sync product id -> { at, product }
const blankCache = new Map(); // catalog product id -> { at, promise }

/* ───────────────────────────────────────────────────────────
   Shaping

   A Printful *sync* product carries a name, a thumbnail and its variants —
   no description, no colour names, no brand. Those live on the *catalog*
   product it was made from, which every sync variant points at through
   product.product_id. One extra lookup per distinct blank turns the shop
   from a list of names into something with colours and copy.
   ─────────────────────────────────────────────────────────── */

async function blank(catalogId) {
  const key = String(catalogId);
  const hit = blankCache.get(key);
  if (hit && Date.now() - hit.at < CATALOG_CACHE_MS) return hit.promise;

  const promise = printfulFetch(`/products/${catalogId}`)
    .then((cat) => ({
      info: cat?.product || null,
      variants: new Map((cat?.variants || []).map((v) => [v.id, v])),
    }))
    .catch((err) => {
      // A missing catalog record costs the blurb and the swatch colours, not
      // the product — the variants below still price and sell correctly.
      console.warn(`catalog lookup ${catalogId} failed:`, err.message);
      blankCache.delete(key);
      return { info: null, variants: new Map() };
    });

  blankCache.set(key, { at: Date.now(), promise });
  return promise;
}

async function shape({ sync_product, sync_variants }) {
  const synced = (sync_variants || []).filter((v) => v.synced);

  // Every sync variant of a product comes from the same catalog product.
  const catalogId = synced.find((v) => v.product?.product_id)?.product?.product_id;
  const { info, variants: blankVariants } = catalogId
    ? await blank(catalogId)
    : { info: null, variants: new Map() };

  const variants = synced.map((v) => {
    const cv = blankVariants.get(v.product?.variant_id) || {};
    return {
      id: v.id,
      // The catalog variant id, which is what /shipping/rates prices against.
      catalogVariantId: v.product?.variant_id || null,
      name: v.name,
      price: Number(v.retail_price),
      currency: v.currency,
      image: variantImage(v, sync_product),
      size: cv.size || null,
      color: cv.color || null,
      colorCode: cv.color_code || null,
      availability: cv.availability_status || null,
    };
  });

  return {
    id: sync_product.id,
    name: sync_product.name,
    title: cleanTitle(sync_product.name),
    // Printful calls this thumbnail_url — reading `.thumbnail` gives undefined,
    // which is why the card used to fall through to the first variant by
    // accident. Which one leads is a decision now; see CARD_IMAGE.
    thumbnail:
      CARD_IMAGE === 'product'
        ? sync_product.thumbnail_url || variants[0]?.image || ''
        : variants[0]?.image || sync_product.thumbnail_url || '',
    description: info?.description || null,
    brand: info?.brand || null,
    model: info?.model || null,
    type: info?.type_name || null,
    currency: variants[0]?.currency || 'USD',
    priceFrom: variants.length ? Math.min(...variants.map((v) => v.price)) : null,
    priceTo: variants.length ? Math.max(...variants.map((v) => v.price)) : null,
    // Distinct mockups, in variant order — the gallery for the detail page.
    images: [...new Set(variants.map((v) => v.image).filter(Boolean))],
    colors: distinct(variants, 'color').map((color) => ({
      name: color,
      code: variants.find((v) => v.color === color)?.colorCode || null,
    })),
    sizes: distinct(variants, 'size'),
    variants,
  };
}

/* The mockup Printful rendered for this variant, falling back to the blank
   catalog shot and then to the product's own thumbnail. */
function variantImage(variant, syncProduct) {
  return (
    variant.files?.find((f) => f.type === 'preview')?.preview_url ||
    variant.product?.image ||
    syncProduct?.thumbnail_url ||
    ''
  );
}

/* Product names are typed into Printful, where they need to identify the
   product inside an account that might hold several artists. On MERLOW's own
   shop "Official MERLOW" is on every single card, so it says nothing and just
   pushes the actual name onto a second line. Dropped here, along with the
   double spaces that come with it, and whatever separator it leaves behind.

   Deliberately conservative: it removes one known phrase and tidies up after
   itself. Anything that comes out empty or absurdly short keeps the original,
   because a stray name is better than a blank card. */
function cleanTitle(raw) {
  const original = String(raw || '').replace(/\s+/g, ' ').trim();

  const cleaned = original
    .replace(/\bofficial\s+merlow\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\(\s*\)/g, '') // "(Official MERLOW)" -> "()"
    .replace(/\(\s*[-–—]\s*/g, '(') // "( - UNFILTERED)" -> "(UNFILTERED)"
    .replace(/\s*[-–—]\s*\)/g, ')')
    .replace(/\s[-–—](\s[-–—])+\s/g, ' — ') // "Alliance - - Black" -> "Alliance — Black"
    // Both sides must be spaced. An unspaced hyphen is part of a word, and
    // this is the rule that would otherwise turn "T-Shirt" into "T — Shirt".
    .replace(/\s[-–—]\s/g, ' — ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s—–-]+/, '')
    .replace(/[\s—–-]+$/, '')
    .trim();

  return cleaned.length >= 3 ? cleaned : original;
}

/* Distinct non-null values of a key, in first-seen order. */
function distinct(rows, key) {
  return [...new Set(rows.map((r) => r[key]).filter(Boolean))];
}

/* ───────────────────────────────────────────────────────────
   Public reads
   ─────────────────────────────────────────────────────────── */

/**
 * The store's synced products with variants, prices, colours and images, in a
 * shape the frontend can render directly. Cached in-memory for a minute per
 * warm lambda instance so a page load doesn't hammer Printful.
 */
async function getCatalog() {
  if (cache.catalog && Date.now() - cache.at < CACHE_MS) return cache.catalog;

  const products = await fetchAllStoreProducts();
  const detailed = await mapWithConcurrency(products, 6, (p) =>
    printfulFetch(`/store/products/${p.id}`)
  );
  const catalog = await mapWithConcurrency(detailed, 6, shape);

  cache = { at: Date.now(), catalog };
  return catalog;
}

async function getProductDetail(id) {
  const hit = detailCache.get(String(id));
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.product;

  const product = await shape(await printfulFetch(`/store/products/${id}`));
  detailCache.set(String(id), { at: Date.now(), product });
  return product;
}

/** Flattens the catalog into a Map keyed by sync variant id. */
function flattenVariants(catalog) {
  const map = new Map();
  catalog.forEach((product) => {
    product.variants.forEach((variant) => {
      map.set(variant.id, {
        ...variant,
        productName: product.title || product.name,
        productId: product.id,
      });
    });
  });
  return map;
}

/* ───────────────────────────────────────────────────────────
   Shipping

   Stripe's hosted Checkout can only offer a fixed list of shipping rates
   chosen when the session is created — it cannot recalculate once the buyer
   types an address. So the destination is asked for on this site first, priced
   here against Printful, and the resulting rates are handed to Stripe as the
   only options. The session is then locked to that one country, so nobody can
   pay a UK rate and have it posted to Australia.
   ─────────────────────────────────────────────────────────── */

/* Printful writes the delivery window into the rate's own name — "Flat Rate
   (Estimated delivery: Aug 27-28)". Stripe is given the same window as a
   structured delivery_estimate and renders it itself, so leaving it in the
   name shows it twice, and shows it as a date that was computed when the
   session was made rather than one Stripe keeps current. */
function rateName(name) {
  return String(name || 'Shipping')
    .replace(/\s*\(estimated delivery:[^)]*\)\s*/i, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Shipping';
}

/**
 * @param {{country_code: string, state_code?: string, zip?: string, city?: string}} recipient
 * @param {Array<{catalogVariantId: number, quantity: number}>} items
 * @returns {Promise<Array<{id, name, rate: number, currency, minDeliveryDays, maxDeliveryDays}>>}
 */
async function getShippingRates(recipient, items) {
  const result = await printfulFetch('/shipping/rates', {
    method: 'POST',
    body: JSON.stringify({
      recipient: {
        country_code: recipient.country_code,
        state_code: recipient.state_code || undefined,
        zip: recipient.zip || undefined,
        city: recipient.city || undefined,
      },
      items: items.map((i) => ({ variant_id: i.catalogVariantId, quantity: i.quantity })),
      currency: 'USD',
      locale: 'en_US',
    }),
  });

  return (result || []).map((r) => ({
    id: r.id,
    name: rateName(r.name),
    rate: Number(r.rate),
    currency: r.currency,
    minDeliveryDays: r.minDeliveryDays ?? null,
    maxDeliveryDays: r.maxDeliveryDays ?? null,
  }));
}

module.exports = {
  printfulFetch,
  printfulFetchFull,
  getCatalog,
  getProductDetail,
  getShippingRates,
  flattenVariants,
  cleanTitle,
};
