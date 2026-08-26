'use strict';

/* Which Checkout Sessions belong to this shop, and whose name goes on the
   charge.

   MERLOW and GetForged share one Stripe account, and a Stripe webhook endpoint
   subscribes to an *event type* for the whole account — it cannot be scoped to
   one product, one app or one domain. So merlow.space's endpoint is delivered
   GetForged's completed checkouts, and GetForged's endpoint is delivered
   MERLOW's. Both have always been true; adding the MERLOW endpoint only made
   the second direction visible.

   Left alone, a GetForged session arriving here has no Printful variant on any
   line, the handler raises, Stripe gets a 500 and retries — forever, on every
   GetForged sale, until Stripe disables the endpoint for failing too often.
   The fix is to recognise other people's traffic and say a polite 200 to it.

   Sessions are tagged at creation (`metadata.app`). The structural fallback
   below is for sessions created before tagging existed — including any real
   order taken in the window between checkout going live and this shipping.

   The same fact — one account, two shops — is why a card statement needs to
   say which of them it came from, so that lives here too. */

const APP = 'merlow';

/* What a buyer sees on their card statement, appended to the account's own
   descriptor prefix, so the line reads roughly "GETBRIAN* MERLOW". Without it
   the only name on the bill is GetBrian, which a MERLOW customer has no reason
   to recognise weeks later — and an unrecognised line is how a chargeback
   starts.

   Stripe's rules, and why this is kept short:
     - the prefix and the suffix share one 22-character budget. The prefix is
       set on the account and cannot be read from here, so the suffix leaves
       room rather than spending it. Over budget Stripe truncates; it does not
       fail the payment, which is exactly why this would go unnoticed.
     - letters, numbers and spaces only, and at least one letter.
   Both are asserted in test/ownership.test.js. */
const STATEMENT_DESCRIPTOR_SUFFIX = 'MERLOW';

/* Our own ceiling, not Stripe's: keeps at least 12 of the 22 back for whatever
   the account's prefix turns out to be. */
const SUFFIX_BUDGET = 10;

/** Goes on every Checkout Session this shop creates. */
function sessionMetadata() {
  return { app: APP };
}

/**
 * @param {object} session a checkout.session
 * @param {Array} lineItems its expanded line items, or [] if not fetched yet
 * @returns {{ours: boolean, why: string}}
 */
function owns(session, lineItems = []) {
  const tag = session?.metadata?.app;

  if (tag === APP) return { ours: true, why: 'tagged for this shop' };
  if (tag) return { ours: false, why: `tagged for ${tag}` };

  /* Untagged. It predates the tag, and could be from either shop — so ask the
     only question that separates them without one: is anything in it a thing
     this shop sells? Every MERLOW line carries the Printful sync variant id
     the order is built from. Nothing of GetForged's does. */
  const printful = lineItems.some(
    (li) => Number(li?.price?.product?.metadata?.variantId) > 0
  );

  return printful
    ? { ours: true, why: 'untagged, but its lines carry Printful variant ids' }
    : { ours: false, why: 'untagged, and nothing in it is a Printful variant' };
}

/* A session tagged for someone else can be dismissed without spending an API
   call on its line items. Kept separate from owns() so the webhook can reject
   early and still do the full check once it has them. */
function tagRejects(session) {
  const tag = session?.metadata?.app;
  return Boolean(tag) && tag !== APP;
}

module.exports = {
  APP,
  STATEMENT_DESCRIPTOR_SUFFIX,
  SUFFIX_BUDGET,
  sessionMetadata,
  owns,
  tagRejects,
};
