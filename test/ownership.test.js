'use strict';

/* node --test test/ownership.test.js — see the note at the top of
   mockup.test.js about NODE_PATH.

   MERLOW and GetForged share a Stripe account. A webhook endpoint subscribes to
   an event type for the whole account, so each shop's endpoint is delivered the
   other's completed checkouts. Getting this wrong in either direction is
   expensive: drop one of ours and a paid order is never made; accept one of
   theirs and we either error forever or try to order a GetForged product from
   Printful. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { APP, sessionMetadata, owns, tagRejects } = require('../lib/ownership');

const tagged = (app) => ({ id: 'cs_1', metadata: app ? { app } : {} });
const merlowLines = [{ price: { product: { metadata: { variantId: '5451559113' } } } }];
const getforgedLines = [{ price: { product: { metadata: { sku: 'FORGE-1' } } } }];

test('a session this shop created is tagged for it', () => {
  assert.deepEqual(sessionMetadata(), { app: APP });
  assert.equal(APP, 'merlow');
});

test('a tagged MERLOW session is ours', () => {
  assert.equal(owns(tagged('merlow'), merlowLines).ours, true);
  // The tag alone settles it — no need to have fetched the lines yet.
  assert.equal(owns(tagged('merlow'), []).ours, true);
});

test("a session tagged for another app is not ours, and is rejected without an API call", () => {
  assert.equal(tagRejects(tagged('getforged')), true);
  assert.equal(owns(tagged('getforged'), merlowLines).ours, false);
});

test('an untagged session of ours is still ours — the variant ids give it away', () => {
  /* This is the one that matters most. Any real order taken between checkout
     going live and tagging shipping has no tag. Dropping it would mean a paid
     customer who never receives anything. */
  assert.equal(tagRejects(tagged(null)), false);
  const verdict = owns(tagged(null), merlowLines);
  assert.equal(verdict.ours, true, verdict.why);
});

test('an untagged session of theirs is not ours', () => {
  const verdict = owns(tagged(null), getforgedLines);
  assert.equal(verdict.ours, false, verdict.why);
});

test('an untagged session with no lines at all is not ours', () => {
  // Nothing to identify it by. Better to ignore than to guess and order.
  assert.equal(owns(tagged(null), []).ours, false);
});

test('a malformed session does not throw its way into a retry loop', () => {
  assert.equal(owns(undefined, undefined).ours, false);
  assert.equal(owns({}, []).ours, false);
  assert.equal(tagRejects(undefined), false);
});

test('a variantId of 0 or nonsense does not count as one of ours', () => {
  assert.equal(owns(tagged(null), [{ price: { product: { metadata: { variantId: '0' } } } }]).ours, false);
  assert.equal(owns(tagged(null), [{ price: { product: { metadata: { variantId: 'abc' } } } }]).ours, false);
});
