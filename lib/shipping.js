'use strict';

/* Where the shop ships to, and what Printful charges to send a cart there.

   Stripe's hosted Checkout can only offer shipping rates that were fixed when
   the session was created — it cannot re-quote once the buyer types an
   address. Printful, meanwhile, will not quote against a bare country: the US,
   Canada and Australia need a state, and several countries need a postcode.

   Between those two facts sits this file. The buyer picks a country in the
   cart; that country is quoted against a real address inside it, which is what
   Printful needs to answer; and the Stripe session is then locked to that same
   country, so nobody can be quoted for London and shipped to Sydney.

   The anchor addresses are only there to obtain the country's rate. Printful
   prices apparel per country as a flat rate plus a smaller per-extra-item fee,
   so the anchor's answer is the country's answer. Where it isn't — a remote
   address inside a large country — Printful may charge Brian a little more
   than the buyer paid. That is a known, bounded gap, and the alternative on
   the table was charging nothing for shipping at all. */

const SHIP_TO = {
  GB: { name: 'United Kingdom', city: 'London', zip: 'EC1A 1BB' },
  IE: { name: 'Ireland', city: 'Dublin', zip: 'D01 F5P2' },
  US: { name: 'United States', city: 'Los Angeles', state_code: 'CA', zip: '90001' },
  CA: { name: 'Canada', city: 'Toronto', state_code: 'ON', zip: 'M5V 3L9' },
  AU: { name: 'Australia', city: 'Sydney', state_code: 'NSW', zip: '2000' },
  DE: { name: 'Germany', city: 'Berlin', zip: '10115' },
  FR: { name: 'France', city: 'Paris', zip: '75001' },
  ES: { name: 'Spain', city: 'Madrid', zip: '28001' },
  IT: { name: 'Italy', city: 'Rome', state_code: 'RM', zip: '00184' },
  NL: { name: 'Netherlands', city: 'Amsterdam', zip: '1011 AB' },
};

const DEFAULT_COUNTRY = 'GB';

/* Stripe accepts at most five shipping options on a session. Printful rarely
   returns more than three, but the cap is Stripe's and it is a hard error. */
const MAX_RATES = 5;

function countries() {
  return Object.entries(SHIP_TO).map(([code, c]) => ({ code, name: c.name }));
}

function isShippable(code) {
  return Object.prototype.hasOwnProperty.call(SHIP_TO, String(code || '').toUpperCase());
}

function recipientFor(code) {
  const country = String(code).toUpperCase();
  const anchor = SHIP_TO[country];
  if (!anchor) throw new Error(`UNSUPPORTED_COUNTRY:${code}`);
  return {
    country_code: country,
    state_code: anchor.state_code,
    city: anchor.city,
    zip: anchor.zip,
  };
}

/**
 * What Printful will charge to send these cart lines to this country.
 *
 * @param {(recipient, items) => Promise<Array>} getShippingRates lib/printful's
 * @param {Map<number, object>} variantMap  sync variant id -> variant
 * @param {Array<{variantId: number|string, quantity: number}>} items
 * @param {string} country ISO-2
 */
async function quote(getShippingRates, variantMap, items, country) {
  const lines = items.map((item) => {
    const variant = variantMap.get(Number(item.variantId));
    if (!variant) throw new Error(`UNKNOWN_VARIANT:${item.variantId}`);
    if (!variant.catalogVariantId) throw new Error(`UNPRICEABLE_VARIANT:${item.variantId}`);
    return { catalogVariantId: variant.catalogVariantId, quantity: quantityOf(item) };
  });

  const rates = await getShippingRates(recipientFor(country), lines);
  return rates.filter((r) => Number.isFinite(r.rate)).slice(0, MAX_RATES);
}

/* One buyer, up to ten of a thing. Applied identically here and when the cart
   is priced, so the quantity a rate was quoted for is the quantity charged. */
function quantityOf(item) {
  return Math.max(1, Math.min(10, Number(item.quantity) || 1));
}

/**
 * Printful's rates as Stripe shipping options. The Printful rate id rides
 * along in metadata so the webhook can put the buyer's actual choice on the
 * Printful order instead of guessing at it.
 */
function toStripeShippingOptions(rates) {
  return rates.map((rate) => ({
    shipping_rate_data: {
      type: 'fixed_amount',
      display_name: rate.name || 'Shipping',
      fixed_amount: {
        amount: Math.round(rate.rate * 100),
        currency: String(rate.currency || 'USD').toLowerCase(),
      },
      metadata: { printfulRateId: String(rate.id) },
      ...deliveryEstimate(rate),
    },
  }));
}

function deliveryEstimate(rate) {
  const min = Number(rate.minDeliveryDays);
  const max = Number(rate.maxDeliveryDays);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0) return {};
  return {
    delivery_estimate: {
      minimum: { unit: 'business_day', value: min },
      maximum: { unit: 'business_day', value: Math.max(min, max) },
    },
  };
}

module.exports = {
  SHIP_TO,
  DEFAULT_COUNTRY,
  MAX_RATES,
  countries,
  isShippable,
  recipientFor,
  quote,
  quantityOf,
  toStripeShippingOptions,
};
