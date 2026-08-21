'use strict';

/* node --test test/printful.test.js — see the note at the top of mockup.test.js
   about NODE_PATH. */

const test = require('node:test');
const assert = require('node:assert/strict');

const { cleanTitle } = require('../lib/printful');

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
