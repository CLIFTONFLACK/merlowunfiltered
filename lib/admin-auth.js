'use strict';

/* Who may edit the site.
   lib/admin-auth.js

   VANCE-HQ gates its editor on Google SSO against a company domain. merlow.space
   has no company behind it and exactly one person editing it, so this is the
   whole of the concept: one password held in the environment, exchanged once
   for a signed cookie.

   ── Two environment variables, and both are required ──────────────────────

     MERLOW_ADMIN_PASSWORD   what you type
     MERLOW_SESSION_SECRET   what signs the cookie you get back

   The second is NOT derived from the first, though it easily could be and that
   would be one fewer thing to set. A key derived from a password is only as
   unguessable as the password: anyone who got hold of a cookie could grind at
   it offline until it verified, and then mint their own. A random secret makes
   a stolen cookie worth nothing but the session it already is.

   Neither has a default. A missing one leaves NOBODY able to sign in, which is
   the right way round — the alternative, a build that quietly falls back to a
   known value, is an editor open to the internet.

   ── The cookie ────────────────────────────────────────────────────────────

   `<base64url(payload)>.<base64url(hmac)>`, and the payload holds only an
   expiry. There is one admin, so there is no identity to carry; a session here
   answers "may you edit" and nothing else.

   HttpOnly so script cannot read it, Secure so it never crosses plain HTTP,
   SameSite=Lax so it is withheld from a cross-site POST — which is the first
   of the two CSRF layers. The second is the X-Merlow-Admin header the save
   endpoint demands; see api/admin/content.js.
*/

const crypto = require('node:crypto');

const COOKIE = 'merlow_admin';

/** Twelve hours. Long enough for an afternoon of edits, short enough that a
 *  laptop left open in a café is not a standing invitation. */
const SESSION_SECONDS = 12 * 60 * 60;

const read = (v) => (typeof v === 'string' ? v.trim() : '') || null;

const password = (env = process.env) => read(env.MERLOW_ADMIN_PASSWORD);
const secret = (env = process.env) => read(env.MERLOW_SESSION_SECRET);

/**
 * Nobody can sign in, and it is worth telling them so.
 *
 * The difference between "that password is wrong" and "there is no password
 * set on this deployment" is invisible from the outside otherwise, and the
 * second one sends you looking for a typo that does not exist.
 */
const unconfigured = (env = process.env) => !password(env) || !secret(env);

const b64u = (buf) => Buffer.from(buf).toString('base64url');

/**
 * Compare without leaking how far the comparison got.
 *
 * Both sides are hashed first so that timingSafeEqual is always handed two
 * buffers of the same length — it throws on a length mismatch, and a throw on
 * "wrong length" would itself be a signal about the length of the password.
 */
function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

const checkPassword = (candidate, env = process.env) => {
  const expected = password(env);
  if (!expected || typeof candidate !== 'string' || !candidate) return false;
  return sameSecret(candidate, expected);
};

const mac = (data, env = process.env) =>
  b64u(crypto.createHmac('sha256', secret(env)).update(data).digest());

/** A signed token good until `exp`. */
function issue(env = process.env, now = Date.now()) {
  const payload = b64u(JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_SECONDS }));
  return `${payload}.${mac(payload, env)}`;
}

/**
 * Is this token one we issued, and is it still in date?
 *
 * The signature is checked BEFORE the payload is parsed. Reading an unverified
 * payload — even just to look at its expiry — is how a parser gets handed
 * attacker-controlled input it was never meant to see.
 */
function valid(token, env = process.env, now = Date.now()) {
  if (unconfigured(env) || typeof token !== 'string') return false;

  const cut = token.indexOf('.');
  if (cut < 1) return false;

  const payload = token.slice(0, cut);
  const signature = token.slice(cut + 1);
  if (!signature) return false;

  let expected;
  try {
    expected = mac(payload, env);
  } catch {
    return false;
  }
  if (expected.length !== signature.length || !sameSecret(expected, signature)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(exp) && exp * 1000 > now;
  } catch {
    return false;
  }
}

/**
 * Cookies off a request.
 *
 * Split on ';' and then on the FIRST '=' only: a base64url payload cannot
 * contain '=' in the middle, but a future cookie value could, and a value
 * silently truncated at its second '=' is a bug that only shows up later.
 */
function cookies(req) {
  const header = req?.headers?.cookie;
  if (typeof header !== 'string') return {};
  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

const signedIn = (req, env = process.env, now = Date.now()) =>
  valid(cookies(req)[COOKIE], env, now);

/**
 * The Set-Cookie for a fresh session, and for ending one.
 *
 * Max-Age and Expires both, because a browser with a badly-set clock honours
 * Max-Age and one older than it honours Expires; the pair covers both without
 * either being wrong.
 */
function setCookie(env = process.env, now = Date.now()) {
  const token = issue(env, now);
  const expires = new Date(now + SESSION_SECONDS * 1000).toUTCString();
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}; Expires=${expires}`;
}

const clearCookie = () =>
  `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;

/**
 * The gate every admin route runs first.
 *
 * Returns a verdict rather than writing a response, so the route decides what a
 * refusal looks like — a redirect to the sign-in page for the HTML routes, JSON
 * for the one that saves.
 */
function adminGate(req, env = process.env) {
  if (unconfigured(env)) return { ok: false, reason: 'unconfigured' };
  if (!signedIn(req, env)) return { ok: false, reason: 'anonymous' };
  return { ok: true };
}

module.exports = {
  COOKIE,
  SESSION_SECONDS,
  unconfigured,
  checkPassword,
  issue,
  valid,
  cookies,
  signedIn,
  setCookie,
  clearCookie,
  adminGate,
};
