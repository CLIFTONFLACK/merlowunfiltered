'use strict';

const Stripe = require('stripe');
const { printfulFetch } = require('../lib/printful');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// SAFETY DEFAULT: orders are created in Printful as drafts (confirm: false),
// so nothing is produced or charged to your Printful account automatically.
// Each order needs a manual confirm in the Printful dashboard until you've
// watched a handful go through end-to-end. Flip to true only once you trust
// the pipeline — see Website/README.md.
const AUTO_CONFIRM_ORDERS = false;

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    try {
      await fulfillOrder(event.data.object);
    } catch (err) {
      console.error('Printful order creation failed for session', event.data.object.id, err);
      // Non-2xx tells Stripe to retry this webhook later rather than
      // silently losing a paid order that never reached Printful.
      return res.status(500).json({ error: 'Fulfillment failed' });
    }
  }

  return res.status(200).json({ received: true });
}

async function fulfillOrder(session) {
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    expand: ['data.price.product'],
    limit: 100,
  });

  const items = lineItems.data.map((li) => ({
    sync_variant_id: Number(li.price.product.metadata.variantId),
    quantity: li.quantity,
  }));

  const shipping = session.shipping_details;
  const customer = session.customer_details;
  const address = (shipping || customer)?.address;

  await printfulFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({
      external_id: session.id,
      confirm: AUTO_CONFIRM_ORDERS,
      recipient: {
        name: shipping?.name || customer?.name || '',
        email: customer?.email || '',
        address1: address?.line1 || '',
        address2: address?.line2 || '',
        city: address?.city || '',
        state_code: address?.state || '',
        country_code: address?.country || '',
        zip: address?.postal_code || '',
      },
      items,
    }),
  });
}

// Stripe needs the raw request bytes to verify the webhook signature, so the
// body parser is disabled below and the stream is read manually here.
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

handler.config = { api: { bodyParser: false } };

module.exports = handler;
