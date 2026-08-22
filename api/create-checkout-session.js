'use strict';

/* POST /api/create-checkout-session
   { items: [{variantId, quantity}], country: "GB" }  ->  { url }

   Everything that decides what is charged is worked out here, from Printful,
   on every request. The cart sends ids, quantities and a destination country
   and nothing else — prices and postage in the request body would be a way to
   buy a jacket for a penny. */

const Stripe = require('stripe');
const { getCatalog, getShippingRates, flattenVariants } = require('../lib/printful');
const {
  quote,
  quantityOf,
  isShippable,
  toStripeShippingOptions,
  DEFAULT_COUNTRY,
} = require('../lib/shipping');
const { sessionMetadata } = require('../lib/ownership');

/* Built on first use rather than at module load, so a missing key is a clear
   answer from the handler below instead of a cold-start crash. */
let stripeClient = null;
function stripe() {
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseBody(req.body);
  if (!body) return res.status(400).json({ error: 'Invalid request body' });

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return res.status(400).json({ error: 'Cart is empty' });

  const country = String(body.country || DEFAULT_COUNTRY).toUpperCase();
  if (!isShippable(country)) {
    return res.status(400).json({ error: 'We don’t ship there yet' });
  }

  /* Checked after the request itself, so a malformed cart is still a 400
     whether or not Stripe is wired up. Everything else about the shop works
     without it — the catalog, the mockups, the postage quote — so an
     unconfigured checkout should say what is missing rather than fail as if
     the cart were at fault. */
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set; checkout cannot run');
    return res.status(503).json({ error: 'Checkout isn’t switched on yet' });
  }

  try {
    const catalog = await getCatalog();
    const variantMap = flattenVariants(catalog);

    const lineItems = items.map((item) => {
      const variant = variantMap.get(Number(item.variantId));
      if (!variant) throw new Error(`UNKNOWN_VARIANT:${item.variantId}`);

      return {
        quantity: quantityOf(item),
        price_data: {
          currency: variant.currency.toLowerCase(),
          unit_amount: Math.round(variant.price * 100),
          product_data: {
            name: variant.label
              ? `${variant.productName} — ${variant.label}`
              : variant.productName,
            images: variant.image ? [variant.image] : undefined,
            // Read back out of session.line_items in the webhook so the
            // Printful order always matches what was actually paid for —
            // no separate cart record to go stale or get truncated.
            metadata: { variantId: String(variant.id) },
          },
        },
      };
    });

    const rates = await quote(getShippingRates, variantMap, items, country);
    if (!rates.length) throw new Error('NO_SHIPPING_RATES');

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      /* This account also serves GetForged, and a Stripe webhook subscribes to
         an event type for the whole account rather than to one app. The tag is
         what lets each side's handler recognise its own traffic — see
         lib/ownership.js. Repeated onto the PaymentIntent so the charge itself
         carries it too, which is what makes a Stripe export or a Sigma query
         able to tell the two businesses apart after the fact. */
      metadata: sessionMetadata(),
      payment_intent_data: { metadata: sessionMetadata() },
      // Locked to the one country the postage was quoted for. Checkout will
      // not let the buyer pick another, so the rate on the session is always
      // the rate for where the parcel is going.
      shipping_address_collection: { allowed_countries: [country] },
      shipping_options: toStripeShippingOptions(rates),
      success_url: `${origin}/?order=success#shop`,
      cancel_url: `${origin}/?order=cancelled#shop`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    const message = String(err.message);
    if (message.startsWith('UNKNOWN_VARIANT:') || message.startsWith('UNPRICEABLE_VARIANT:')) {
      return res.status(400).json({ error: 'One of the items in your cart is no longer available' });
    }
    if (message === 'NO_SHIPPING_RATES') {
      return res.status(502).json({ error: 'We couldn’t work out postage to that country just now' });
    }
    console.error('POST /api/create-checkout-session failed:', err);
    return res.status(500).json({ error: 'Couldn’t start checkout — try again in a moment' });
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
