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

async function printfulFetch(path, options = {}) {
  const res = await fetch(`${PRINTFUL_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || data?.result || res.statusText;
    throw new Error(`Printful ${path} failed (${res.status}): ${message}`);
  }
  return data.result;
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

  const products = await printfulFetch('/store/products');
  const detailed = await Promise.all(
    (products || []).map((p) => printfulFetch(`/store/products/${p.id}`))
  );

  const catalog = detailed.map(({ sync_product, sync_variants }) => ({
    id: sync_product.id,
    name: sync_product.name,
    thumbnail: sync_product.thumbnail,
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

module.exports = { printfulFetch, getCatalog, flattenVariants };
