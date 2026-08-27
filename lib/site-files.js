'use strict';

/* Reading the site's own files from inside a function.
   lib/site-files.js

   The editor opens the real shop.html and the real js/copy.js, because those
   files ARE the content — see lib/copy.js. A function therefore has to be able
   to read files that are otherwise only ever served as static assets.

   Two things make that less obvious than it sounds:

   1. Vercel bundles a function with the files it can SEE it uses, by reading
      the source rather than by running it. A path built at runtime is
      invisible to that, so shop.html would be left out of the bundle and every
      read would fail in production while working perfectly on a laptop.

      Guarded twice, because getting it wrong is only discovered in production:
      the LITERAL table below is written in the one shape the file tracer
      understands — `path.join(__dirname, '..', 'a-string')` — so the files are
      pulled in whether or not anything else works, and the
      `functions.includeFiles` entry in vercel.json says the same thing again
      in the way the documentation recommends. Either alone should do it.

   2. The working directory a bundled function starts in is not promised to be
      the project root. So the root is FOUND — by looking for the file we know
      is there — rather than assumed, and the answer is cached for the life of
      the instance.
*/

const fs = require('node:fs');
const path = require('node:path');

/** The file that identifies the project root. It is also one we need. */
const ANCHOR = 'shop.html';

let cached = null;

/**
 * The directory the site's files are in.
 *
 * @throws when none of the candidates holds the anchor, which means the
 *   includeFiles entry has gone missing from vercel.json. Throwing beats
 *   returning a wrong root: the caller turns it into a visible error on the
 *   admin page, where the fix ("put it back") is one line away.
 */
function root() {
  if (cached) return cached;

  const candidates = [
    process.cwd(),
    path.join(__dirname, '..'),
    path.join(process.cwd(), 'api', '..'),
  ];

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, ANCHOR))) {
        cached = dir;
        return cached;
      }
    } catch {
      // An unreadable candidate is simply not the answer.
    }
  }

  throw new Error(
    `Could not find ${ANCHOR}. The admin functions need it bundled — check the ` +
    '"functions" → "includeFiles" entry in vercel.json.'
  );
}

/**
 * The three files, spelled out.
 *
 * Every path here is a literal joined to __dirname, which is the form Vercel's
 * file tracer reads statically — that is the whole point of writing them out
 * rather than deriving them, and it is why a new editable file must be ADDED
 * here rather than just named in lib/copy.js. Left out, it would work locally
 * and 500 in production.
 */
const LITERAL = {
  'index.html': () => path.join(__dirname, '..', 'index.html'),
  'shop.html': () => path.join(__dirname, '..', 'shop.html'),
  'product.html': () => path.join(__dirname, '..', 'product.html'),
  'js/copy.js': () => path.join(__dirname, '..', 'js', 'copy.js'),
};

/**
 * One file, as text. Relative to the project root, forward slashes.
 *
 * The literal path is tried first and the found root second. They are normally
 * the same directory; the fallback is for a layout where lib/ has been moved
 * relative to the pages, which is a thing that happens once and then never
 * again, loudly.
 */
function read(relative) {
  if (Object.hasOwn(LITERAL, relative)) {
    try {
      return fs.readFileSync(LITERAL[relative](), 'utf8');
    } catch {
      // Fall through to the search below rather than fail on the first guess.
    }
  }
  return fs.readFileSync(path.join(root(), ...relative.split('/')), 'utf8');
}

/** Several, as {path: text}. */
function readAll(relatives) {
  const out = {};
  for (const relative of relatives) out[relative] = read(relative);
  return out;
}

module.exports = { ANCHOR, LITERAL, root, read, readAll };
