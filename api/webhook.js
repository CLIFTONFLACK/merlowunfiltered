'use strict';

/* POST /api/webhook — Stripe tells us a checkout was paid; we place the order.

   Registered in the Stripe dashboard against `checkout.session.completed`, and
   verified by signature, so this is the one place an order can be created and
   nobody can create one by calling it. */

const Stripe = require('stripe');
const { printfulFetch } = require('../lib/printful');

/* Built on first use, for the same reason as in create-checkout-session.js. */
let stripeClient = null;
function stripe() {
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

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

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    // Answering 400 rather than 200 matters: Stripe keeps retrying a 400 for a
    // while, so an event that arrives during a misconfiguration is not simply
    // swallowed and forgotten.
    console.error('STRIPE_WEBHOOK_SECRET is not set; refusing to trust this event');
    return res.status(400).send('Webhook Error: this deployment has no webhook secret');
  }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe().webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    /* A session can complete without the money having arrived — a delayed
       payment method is authorised now and settles later. Printful would be
       told to make the garment either way. */
    if (session.payment_status !== 'paid') {
      console.log(`session ${session.id} completed but is ${session.payment_status}; not ordering`);
      return res.status(200).json({ received: true, ordered: false });
    }

    try {
      const created = await fulfillOrder(session);
      return res.status(200).json({ received: true, ordered: created });
    } catch (err) {
      console.error('Printful order creation failed for session', session.id, err);
      // Non-2xx tells Stripe to retry this webhook later rather than
      // silently losing a paid order that never reached Printful.
      return res.status(500).json({ error: 'Fulfillment failed' });
    }
  }

  return res.status(200).json({ received: true });
}

async function fulfillOrder(session) {
  const lineItems = await stripe().checkout.sessions.listLineItems(session.id, {
    expand: ['data.price.product'],
    limit: 100,
  });

  const items = lineItems.data
    .map((li) => ({
      sync_variant_id: Number(li.price?.product?.metadata?.variantId),
      quantity: li.quantity,
    }))
    .filter((i) => Number.isFinite(i.sync_variant_id) && i.sync_variant_id > 0);

  if (!items.length) {
    throw new Error(`session ${session.id} has no line items carrying a variantId`);
  }

  const shipping = session.shipping_details || session.collected_information?.shipping_details;
  const customer = session.customer_details;
  const address = shipping?.address || customer?.address;

  await printfulFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({
      // Printful rejects a second order with the same external_id, which is
      // what makes a Stripe retry harmless — see the catch below.
      external_id: session.id,
      confirm: AUTO_CONFIRM_ORDERS,
      shipping: await chosenShippingMethod(session),
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
  }).catch((err) => {
    /* Stripe retries a webhook it did not get a 2xx for, and it will retry one
       whose order *was* placed if the response was lost on the way back. Left
       alone that becomes a second jacket. Printful refuses the duplicate
       external_id, and being refused for that reason means the work is
       already done. */
    if (isDuplicateOrder(err)) {
      console.log(`session ${session.id} already has a Printful order; nothing to do`);
      return null;
    }
    throw err;
  });

  return true;
}

function isDuplicateOrder(err) {
  return /external_id/i.test(String(err.message)) && /exist|duplicat|already/i.test(String(err.message));
}

/* Which of the rates we offered the buyer actually chose, as Printful's own id
   for it. Without this Printful picks its cheapest service, which is usually
   but not always the one that was paid for. */
async function chosenShippingMethod(session) {
  const rateId = session.shipping_cost?.shipping_rate;
  if (!rateId) return undefined;
  try {
    const rate = await stripe().shippingRates.retrieve(rateId);
    return rate?.metadata?.printfulRateId || undefined;
  } catch (err) {
    console.warn(`could not read shipping rate ${rateId}:`, err.message);
    return undefined;
  }
}

/* Stripe needs the exact request bytes to verify the signature — a body that
   has been through JSON.parse and back does not hash to the same thing. The
   config below asks Vercel not to parse it, and this reads the stream.
   Buffer and string cases are covered too, because which of the three arrives
   depends on the runtime honouring that config, and a webhook that silently
   fails to verify would look exactly like a bad secret. */
async function getRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length) return Buffer.concat(chunks);

  throw new Error(
    'the request body was consumed before the handler ran, so the signature cannot be checked'
  );
}

handler.config = { api: { bodyParser: false } };

module.exports = handler;
