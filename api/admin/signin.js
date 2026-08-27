'use strict';

/* GET  /admin/signin — the password form
 * POST /admin/signin — the exchange, and the sign-out
 *
 * A plain <form>, posted normally, with no script on the page at all. The one
 * thing on this site that must work when everything else is broken is the way
 * back in to fix it.
 *
 * ── Guessing ──────────────────────────────────────────────────────────────
 *
 * Every wrong answer costs a fixed delay, and an address that keeps getting
 * them is locked out for a while. Both are best-effort and the comment below
 * says why rather than leaving somebody to discover it: the counter lives in
 * one warm function instance, and a platform that can start a second instance
 * can start a second counter. It raises the cost of a guessing run by orders
 * of magnitude; it is not a wall, and the actual wall is the length of the
 * password.
 */

const auth = require('../../lib/admin-auth.js');
const { esc, shell } = require('../../lib/admin-page.js');

const DELAY_MS = 700;
const MAX_TRIES = 8;
const WINDOW_MS = 10 * 60 * 1000;

/* Instance-local, and deliberately so — see the note above. A Map rather than
   an object so that a key like "__proto__" out of a header is just a key. */
const tries = new Map();

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** The address, as far as the platform will say. */
const caller = (req) =>
  String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';

function tooMany(who, now = Date.now()) {
  const seen = tries.get(who);
  if (!seen || now - seen.first > WINDOW_MS) return false;
  return seen.count >= MAX_TRIES;
}

function countFailure(who, now = Date.now()) {
  const seen = tries.get(who);
  if (!seen || now - seen.first > WINDOW_MS) tries.set(who, { first: now, count: 1 });
  else seen.count += 1;

  // The Map is the only thing here that could grow without bound. Anything
  // whose window has closed is no longer evidence of anything.
  for (const [key, value] of tries) if (now - value.first > WINDOW_MS) tries.delete(key);
}

/**
 * Where to go after signing in.
 *
 * Only a path on this site, and only one under /admin. Without both checks,
 * `?next=https://elsewhere.example` turns the sign-in page into an open
 * redirect — and `//elsewhere.example` is a path that is also a URL, which is
 * why the second character is checked too.
 */
function safeNext(value) {
  if (typeof value !== 'string') return '/admin';
  if (!value.startsWith('/admin') || value.startsWith('//')) return '/admin';
  return value;
}

/** The body of a normally-posted form. */
async function formBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

const page = ({ next, error, unconfigured }) =>
  shell({
    title: 'Sign in — MERLOW',
    body: `
  <h1 class="admin__h">Sign in</h1>
  <p class="admin__sub">The content editor for merlow.space.</p>
  ${error ? `<p class="admin__error" role="alert">${esc(error)}</p>` : ''}
  ${unconfigured ? `
  <p class="admin__error" role="alert">
    No password is set on this deployment, so nobody can sign in. Set
    <code>MERLOW_ADMIN_PASSWORD</code> and <code>MERLOW_SESSION_SECRET</code>
    in the project's environment variables and redeploy.
  </p>` : `
  <form method="POST" action="/admin/signin">
    <input type="hidden" name="next" value="${esc(next)}">
    <label class="admin__label" for="password">Password</label>
    <input class="admin__input" id="password" name="password" type="password"
           autocomplete="current-password" required autofocus>
    <button class="admin__btn" type="submit">Sign in</button>
  </form>`}
  <p class="admin__note">Editing changes the live site. Every save is a commit.</p>`,
  });

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');

  const url = new URL(req.url, 'https://merlow.space');

  if (req.method === 'GET' || req.method === 'HEAD') {
    // Already signed in and nothing to do here. Send them on rather than
    // showing a form that will just bounce them back.
    if (auth.signedIn(req)) {
      res.statusCode = 302;
      res.setHeader('Location', safeNext(url.searchParams.get('next')));
      return res.end();
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (req.method === 'HEAD') return res.end();
    return res.end(page({
      next: safeNext(url.searchParams.get('next')),
      error: url.searchParams.get('again') ? 'That password was not right.' : null,
      unconfigured: auth.unconfigured(),
    }));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, POST');
    return res.end();
  }

  const form = await formBody(req);

  // Signing out is a POST too. A link that ends a session gets followed by
  // every link-prefetcher there is, and then nobody can stay signed in.
  if (form.get('out') === '1') {
    res.statusCode = 302;
    res.setHeader('Set-Cookie', auth.clearCookie());
    res.setHeader('Location', '/admin/signin');
    return res.end();
  }

  const next = safeNext(form.get('next'));
  const who = caller(req);

  if (tooMany(who)) {
    await sleep(DELAY_MS);
    res.statusCode = 429;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.end(page({
      next,
      error: 'Too many attempts. Wait ten minutes and try again.',
      unconfigured: auth.unconfigured(),
    }));
  }

  if (!auth.checkPassword(form.get('password'))) {
    countFailure(who);
    await sleep(DELAY_MS);
    res.statusCode = 303;
    res.setHeader('Location', `/admin/signin?again=1&next=${encodeURIComponent(next)}`);
    return res.end();
  }

  tries.delete(who);
  res.statusCode = 303;
  res.setHeader('Set-Cookie', auth.setCookie());
  res.setHeader('Location', next);
  return res.end();
};
