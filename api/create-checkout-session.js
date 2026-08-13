'use strict';

const Stripe = require('stripe');
const { getCatalog, flattenVariants } = require('../lib/printful');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Countries Printful is asked to ship to. Add/remove as needed.
const SHIP_COUNTRIES = ['GB', 'US', 'CA', 'IE', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid request body' });
    }
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  try {
    const catalog = await getCatalog();
    const variantMap = flattenVariants(catalog);

    const lineItems = items.map((item) => {
      const variant = variantMap.get(Number(item.variantId));
      if (!variant) {
        throw new Error(`UNKNOWN_VARIANT:${item.variantId}`);
      }
      const quantity = Math.max(1, Math.min(10, Number(item.quantity) || 1));
      return {
        quantity,
        price_data: {
          currency: variant.currency.toLowerCase(),
          unit_amount: Math.round(variant.price * 100),
          product_data: {
            name: `${variant.productName} — ${variant.name}`,
            images: variant.image ? [variant.image] : undefined,
            // Read back out of session.line_items in the webhook so the
            // Printful order always matches what was actually paid for —
            // no separate cart record to go stale or get truncated.
            metadata: { variantId: String(variant.id) },
          },
        },
      };
    });

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: SHIP_COUNTRIES },
      success_url: `${origin}/?order=success#shop`,
      cancel_url: `${origin}/?order=cancelled#shop`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    if (String(err.message).startsWith('UNKNOWN_VARIANT:')) {
      return res.status(400).json({ error: 'One of the items in your cart is no longer available' });
    }
    console.error('POST /api/create-checkout-session failed:', err);
    return res.status(500).json({ error: 'Could not start checkout' });
  }
};
