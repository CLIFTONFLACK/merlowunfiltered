'use strict';

/* POST /api/shipping-rates  { items: [{variantId, quantity}], country: "GB" }

   What Printful will charge to send this cart to that country, so the cart can
   show a total that includes postage before anyone is sent to Stripe.

   This is a quote, not a commitment: /api/create-checkout-session asks Printful
   again and builds the Stripe session from that answer, so nothing here is
   trusted on the way back in. */

const { getCatalog, getShippingRates, flattenVariants } = require('../lib/printful');
const { quote, countries, isShippable, DEFAULT_COUNTRY } = require('../lib/shipping');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    // Lets the cart build its country picker from one source of truth.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ countries: countries(), default: DEFAULT_COUNTRY });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseBody(req.body);
  if (!body) return res.status(400).json({ error: 'Invalid request body' });

  const items = Array.isArray(body.items) ? body.items : [];
  const country = String(body.country || '').toUpperCase();

  if (!items.length) return res.status(400).json({ error: 'Cart is empty' });
  if (!isShippable(country)) {
    return res.status(400).json({ error: 'We don’t ship there yet' });
  }

  try {
    const variantMap = flattenVariants(await getCatalog());
    const rates = await quote(getShippingRates, variantMap, items, country);

    if (!rates.length) {
      return res.status(502).json({ error: 'Printful returned no shipping options' });
    }

    return res.status(200).json({ country, rates });
  } catch (err) {
    const message = String(err.message);
    if (message.startsWith('UNKNOWN_VARIANT:') || message.startsWith('UNPRICEABLE_VARIANT:')) {
      return res.status(400).json({ error: 'One of the items in your cart is no longer available' });
    }
    console.error('POST /api/shipping-rates failed:', err);
    return res.status(502).json({ error: 'Could not work out shipping just now' });
  }
};

function parseBody(body) {
  if (typeof body !== 'string') return body && typeof body === 'object' ? body : null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
