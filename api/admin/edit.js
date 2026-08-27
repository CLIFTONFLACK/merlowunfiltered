'use strict';

/* GET /admin/edit — the page, with its copy editable.
 *
 * Not a page that resembles /shop. It IS shop.html, read off disk and returned
 * with a class on <body> and two tags before </body>. Same stylesheet, same
 * scripts, same products fetched live from the same API. lib/edit-mode.js
 * explains at length why the usual arrangement — a form beside the thing it
 * edits — is the one that goes wrong, and that it goes wrong quietly, by
 * drifting.
 *
 * ── The gate is here, not in the browser ─────────────────────────────────
 *
 * adminGate runs before anything is read or rendered. The same gate guards the
 * endpoint that writes, because a page you cannot open is not a protection if
 * the API behind it will take your POST.
 */

const auth = require('../../lib/admin-auth.js');
const siteFiles = require('../../lib/site-files.js');
const pageEdit = require('../../lib/page-edit.js');
const copy = require('../../lib/copy.js');
const { loadDocument } = require('../../lib/content.js');
const { editStyles, editChrome, editScript } = require('../../lib/edit-mode.js');

const PAGES = {
  home: { file: 'index.html', label: 'the home page', prefix: 'home' },
  shop: { file: 'shop.html', label: 'the shop', prefix: 'shop' },
  product: { file: 'product.html', label: 'a product page', prefix: 'product' },
};

/** The other pages, so the bar can get you to them without going via /admin. */
const others = (name) =>
  Object.keys(PAGES)
    .filter((key) => key !== name)
    .map((key) => ({ url: `/admin/edit?page=${key}`, label: `Edit ${PAGES[key].label}` }));

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end();
  }

  const url = new URL(req.url, 'https://merlow.space');
  const name = Object.hasOwn(PAGES, url.searchParams.get('page') ?? '')
    ? url.searchParams.get('page')
    : 'shop';

  const gate = auth.adminGate(req);
  if (!gate.ok) {
    res.statusCode = 302;
    res.setHeader('Location', `/admin/signin?next=${encodeURIComponent(`/admin/edit?page=${name}`)}`);
    return res.end();
  }

  const target = PAGES[name];
  const doc = loadDocument();

  // A file that cannot be read or parsed must not be offered for editing: the
  // save would be built on values that were never loaded, and would write the
  // ones it does have over a file it does not understand.
  if (doc.broken.includes(target.file) || doc.broken.includes('js/copy.js')) {
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    return res.end(
      `Cannot open the editor: ${doc.broken.join(', ')} could not be read in the shape it has to be in.\n` +
      'See /admin, which says the same thing with the fix next to it.\n'
    );
  }

  const source = siteFiles.read(target.file);

  /* The panel lists only the strings belonging to the page being edited. All
     37 values are still sent, because a save posts the whole document and the
     server decides what changed — but a panel offering to reword the product
     button while you are looking at the shop is a panel nobody trusts. */
  const fields = copy.SCHEMA.filter(
    (entry) => entry.group && entry.key.split('.')[0] === target.prefix
  );

  const ctx = {
    pageLabel: target.label,
    others: others(name),
    fields,
    values: doc.values,
  };

  const html = pageEdit.withEditLayer(source, {
    styles: editStyles(),
    chrome: editChrome(ctx),
    script: editScript(ctx),
  });

  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (req.method === 'HEAD') return res.end();
  return res.end(html);
};
