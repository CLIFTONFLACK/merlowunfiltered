'use strict';

/* node --test test/printful.test.js — see the note at the top of mockup.test.js
   about NODE_PATH. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { cleanTitle, variantLabel } = require('../lib/printful');

test('the boilerplate every product carries is dropped from the card', () => {
  // The five names as Printful actually returns them today, trailing double
  // spaces and all.
  assert.equal(cleanTitle('Adidas Alliance - Official MERLOW - Black '), 'Adidas Alliance — Black');
  assert.equal(cleanTitle('Adidas Alliance - Official MERLOW - White'), 'Adidas Alliance — White');
  assert.equal(cleanTitle('Letterman Jacket - Official MERLOW'), 'Letterman Jacket');
  assert.equal(
    cleanTitle('Denim Embroidered Logo T-Shirt  (Official MERLOW) '),
    'Denim Embroidered Logo T-Shirt'
  );
  assert.equal(
    cleanTitle('Denim T-Shirt  (Official MERLOW - UNFILTERED) '),
    'Denim T-Shirt (UNFILTERED)'
  );
});

test('a hyphen inside a word is not a separator', () => {
  // The rule that normalises " - " to " — " must not reach into "T-Shirt",
  // "long-sleeve" or "V-neck".
  assert.equal(cleanTitle('T-Shirt'), 'T-Shirt');
  assert.equal(cleanTitle('Long-sleeve V-neck Tee'), 'Long-sleeve V-neck Tee');
});

test('a name that is nothing but boilerplate keeps its original', () => {
  assert.equal(cleanTitle('Official MERLOW'), 'Official MERLOW');
  assert.equal(cleanTitle('  Official   MERLOW  '), 'Official MERLOW');
});

test('a name with no boilerplate is left as it is, bar tidying whitespace', () => {
  assert.equal(cleanTitle('Tour Hoodie'), 'Tour Hoodie');
  assert.equal(cleanTitle('Tour   Hoodie '), 'Tour Hoodie');
  assert.equal(cleanTitle('Tour Hoodie - Black'), 'Tour Hoodie — Black');
});

test('anything unusable falls back rather than blanking the card', () => {
  assert.equal(cleanTitle(''), '');
  assert.equal(cleanTitle(null), '');
  assert.equal(cleanTitle(undefined), '');
});

test('a variant is labelled by what tells it apart, not by the product name again', () => {
  // Printful repeats the whole product name in every variant name. Pasted next
  // to the product name — which is what the Stripe checkout page and the
  // emailed receipt show — it read "Denim Embroidered Logo T-Shirt — Denim
  // Embroidered Logo T-Shirt  (Official MERLOW)  / S".
  const product = 'Denim T-Shirt  (Official MERLOW - UNFILTERED) ';

  // With a catalog record, the options are already fields.
  assert.equal(
    variantLabel(`${product} / Black / S`, product, { color: 'Black', size: 'S' }),
    'Black / S'
  );

  // Without one, the product name is cut off the front of the variant name.
  assert.equal(variantLabel(`${product} / Black / S`, product, {}), 'Black / S');
  assert.equal(variantLabel('Letterman Jacket - Official MERLOW / 2XL', 'Letterman Jacket - Official MERLOW', {}), '2XL');
});

test('a one-variant product has nothing to say about which variant it is', () => {
  /* The cap comes one way, and its catalog record still carries a colour and a
     size — so variantLabel alone would answer "Black / White / One size", which
     is accurate and says nothing next to "Adidas Alliance — Black". Blanking it
     is shape()'s job, not this function's; asserted here so the two halves stay
     honest about which one does it. */
  const cap = 'Adidas Alliance - Official MERLOW - Black ';
  assert.equal(variantLabel(cap, cap, { color: 'Black / White', size: 'One size' }), 'Black / White / One size');
  assert.equal(variantLabel(cap, cap, {}), '');
});

test('a variant name that does not start with the product name is left alone', () => {
  assert.equal(variantLabel('Small / Red', 'Tour Hoodie', {}), 'Small / Red');
});
