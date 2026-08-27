'use strict';

/* GET /admin — what can be edited, and whether it will work.
 *
 * A hub of two links would not be worth a page. What makes it worth one is the
 * second half: this deployment's answer to "will a save actually land?", asked
 * before you have typed anything rather than discovered by a red bar after you
 * have typed a paragraph.
 *
 * Everything reported here is READ, not assumed. The token is checked by using
 * it, the branch by asking where it points, the copy by parsing the real files.
 */

const auth = require('../../lib/admin-auth.js');
const github = require('../../lib/github.js');
const { loadDocument } = require('../../lib/content.js');
const { getCatalog } = require('../../lib/printful.js');
const { esc, shell } = require('../../lib/admin-page.js');

/** A product to open the product page on. Any one will do — it is the template
 *  being edited, not the shirt. */
async function sampleProduct() {
  try {
    const catalog = await getCatalog();
    return Array.isArray(catalog) && catalog.length ? catalog[0] : null;
  } catch {
    return null;
  }
}

/**
 * Everything that could stop a save, checked rather than hoped about.
 *
 * @returns {Promise<string[]>} one line per problem, empty when there are none
 */
async function problems(doc) {
  const out = [];

  for (const file of doc.broken) {
    out.push(`<code>${esc(file)}</code> could not be read, or is not in the shape the editor expects. Nothing in it can be edited until that is fixed.`);
  }
  if (doc.missing.length) {
    out.push(`${doc.missing.length} string${doc.missing.length === 1 ? '' : 's'} the schema names cannot be found in any file: <code>${esc(doc.missing.join(', '))}</code>. A <code>data-edit</code> mark has probably been removed.`);
  }

  if (!github.configured()) {
    out.push('No <code>GITHUB_TOKEN</code> is set, so a save has nowhere to go. Add a fine-grained token with read and write access to Contents on the repository, then redeploy.');
    return out;
  }

  /* Asked before anything else about GitHub, because this repository is public
     and so every READ succeeds for any valid token — including one belonging to
     a different account. Without this the first sign of trouble is a 403 landing
     on somebody who has just typed a paragraph. */
  const access = await github.writeAccess();
  if (!access.canWrite) {
    out.push(
      `The GitHub token ${access.login ? `belongs to <code>${esc(access.login)}</code> and ` : ''}` +
      `cannot write to <code>${esc(github.repo())}</code>, so no save will land. ` +
      (access.error ? `GitHub said: ${esc(access.error)}. ` : '') +
      'Check it is a token on the account that owns the repository, that the repository is in its list, ' +
      'and that <b>Contents</b> is set to <b>Read and write</b> rather than Read-only. ' +
      'Changing that permission takes effect at once — the token does not need reissuing.'
    );
  }

  try {
    const { stale, head, deployed } = await github.freshness();
    if (stale) {
      out.push(
        `This deployment was built from <code>${esc(String(deployed).slice(0, 7))}</code>, but ` +
        `<code>${esc(github.branch())}</code> is now at <code>${esc(head.slice(0, 7))}</code>. ` +
        'Saving would commit these older files on top of the newer ones and undo them. ' +
        'Deploy the branch first, then edit.'
      );
    }
  } catch (err) {
    out.push(`GitHub would not answer: ${esc(err.message)}`);
  }

  return out;
}

const page = ({ items, warnings }) =>
  shell({
    title: 'Admin — MERLOW',
    body: `
  <h1 class="admin__h">Edit the copy</h1>
  <p class="admin__sub">
    Open a page and type on it. Every save is one commit to the site's
    repository, and the change is live about a minute later.
  </p>
  ${warnings.map((line) => `<p class="admin__error" role="alert">${line}</p>`).join('')}
  <ul class="admin__list">
    ${items.map((item) => `
    <li>
      <a class="admin__link" href="${esc(item.href)}">
        <b>${esc(item.name)}</b>
        <span>${esc(item.detail)}</span>
      </a>
    </li>`).join('')}
  </ul>
  <form method="POST" action="/admin/signin">
    <input type="hidden" name="out" value="1">
    <button class="admin__out" type="submit">Sign out</button>
  </form>`,
  });

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

  const gate = auth.adminGate(req);
  if (!gate.ok) {
    res.statusCode = 302;
    res.setHeader('Location', `/admin/signin?next=${encodeURIComponent('/admin')}`);
    return res.end();
  }

  const doc = loadDocument();
  const [warnings, product] = await Promise.all([problems(doc), sampleProduct()]);

  const items = [
    { name: 'The home page', detail: '/ — the hero, the chorus, the three story panels, the section headings and the footer', href: '/admin/edit?page=home' },
    { name: 'The shop', detail: '/shop — the heading, the lede, the navigation and the footer', href: '/admin/edit?page=shop' },
    {
      name: 'A product page',
      detail: product
        ? `/shop/${product.id} — the labels, the button and the made-to-order note, shown on ${product.name ?? 'a real product'}`
        : '/shop/:id — the labels, the button and the made-to-order note',
      href: product ? `/admin/edit?page=product&id=${encodeURIComponent(product.id)}` : '/admin/edit?page=product',
    },
  ];

  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (req.method === 'HEAD') return res.end();
  return res.end(page({ items, warnings }));
};
