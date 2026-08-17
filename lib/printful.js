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

let cache = { at: 0, catalog: null };
const CACHE_MS = 60_000;

/**
 * Returns the store's synced products with variants, prices, and images,
 * in a shape the frontend can render directly. Cached in-memory for a
 * minute per warm lambda instance to avoid hammering Printful on every
 * page load.
 */
async function getCatalog() {
  if (cache.catalog && Date.now() - cache.at < CACHE_MS) return cache.catalog;

  const products = await fetchAllStoreProducts();
  const detailed = await mapWithConcurrency(products, 6, (p) =>
    printfulFetch(`/store/products/${p.id}`)
  );

  const catalog = detailed.map(({ sync_product, sync_variants }) => ({
    id: sync_product.id,
    name: sync_product.name,
    // Printful calls this thumbnail_url. Reading `.thumbnail` gave undefined on
    // every product, so the card silently fell back to the first variant's
    // preview and the store's own main image was never used.
    thumbnail: sync_product.thumbnail_url,
    variants: (sync_variants || [])
      .filter((v) => v.synced)
      .map((v) => ({
        id: v.id,
        name: v.name,
        price: Number(v.retail_price),
        currency: v.currency,
        image:
          v.files?.find((f) => f.type === 'preview')?.preview_url ||
          v.product?.image ||
          sync_product.thumbnail,
      })),
  }));

  cache = { at: Date.now(), catalog };
  return catalog;
}

/** Flattens the catalog into a Map keyed by sync variant id. */
function flattenVariants(catalog) {
  const map = new Map();
  catalog.forEach((product) => {
    product.variants.forEach((variant) => {
      map.set(variant.id, { ...variant, productName: product.name, productId: product.id });
    });
  });
  return map;
}

module.exports = { printfulFetch, printfulFetchFull, getCatalog, flattenVariants };
