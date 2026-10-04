'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const a = require('../js/analytics.js');

test('tracks merlow.space and its subdomains, nothing that merely looks like it', () => {
  for (const h of ['merlow.space', 'www.merlow.space', 'WWW.Merlow.Space', 'shop.merlow.space']) {
    assert.equal(a.isTrackedHost(h), true, h);
  }
  for (const h of ['notmerlow.space', 'merlow.space.evil.com', 'merlow.spacex', 'merlows.com',
    'merlowunfiltered-git-x.vercel.app', 'localhost', '', undefined, null]) {
    assert.equal(a.isTrackedHost(h), false, String(h));
  }
});

test('the banner shows on tracked hosts and localhost only', () => {
  assert.equal(a.showsBanner('www.merlow.space'), true);
  assert.equal(a.showsBanner('localhost'), true);
  assert.equal(a.showsBanner('127.0.0.1'), true);
  assert.equal(a.showsBanner('merlowunfiltered.vercel.app'), false);
});

test('the owner editor and everything under /admin is excluded, lookalikes are not', () => {
  for (const p of ['/admin', '/admin/', '/admin/edit', '/admin/signin']) assert.equal(a.isExcludedPath(p), true, p);
  for (const p of ['/', '/shop', '/shop/abc', '/administrator', '/adminx', '/privacy']) assert.equal(a.isExcludedPath(p), false, p);
});

test('only an exact stored choice counts', () => {
  assert.equal(a.parseConsent('granted'), 'granted');
  assert.equal(a.parseConsent('denied'), 'denied');
  for (const v of [null, undefined, '', 'true', 'GRANTED', 'granted ', '1']) assert.equal(a.parseConsent(v), null, String(v));
});

test('recognises gtag cookie names and no others', () => {
  for (const n of ['_ga', '_ga_1GH0Q0920W', '_gid', '_gat', '_gat_gtag_G_1GH0Q0920W']) assert.equal(a.isGaCookieName(n), true, n);
  for (const n of ['gb_consent', 'session', '_gaps', 'ga', 'x_ga']) assert.equal(a.isGaCookieName(n), false, n);
});

test('clearGaCookies expires GA cookies on host and parent domain and leaves others alone', () => {
  const writes = [];
  const doc = {
    get cookie() { return '_ga=GA1.1.1; _ga_1GH0Q0920W=GS1; keep_me=1; gb_consent=granted'; },
    set cookie(v) { writes.push(v); }
  };
  a.clearGaCookies(doc, 'www.merlow.space');
  const names = [...new Set(writes.map((w) => w.split('=')[0]))].sort();
  assert.deepEqual(names, ['_ga', '_ga_1GH0Q0920W']);
  assert.ok(writes.every((w) => w.includes('expires=Thu, 01 Jan 1970')));
  assert.ok(writes.some((w) => w.includes('domain=.merlow.space')), 'parent domain covered');
});

// ---- init(): a minimal fake browser --------------------------------------

function fakeBrowser({ hostname, pathname = '/', stored = null, storageThrows = false }) {
  const scripts = [];
  const classes = new Set();
  const body = {
    children: [],
    classes,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    appendChild(n) { n.parentNode = body; body.children.push(n); return n; }
  };
  const mk = (tag) => {
    const n = { tag, className: '', textContent: '', children: [], listeners: {}, parentNode: null };
    n.appendChild = (c) => { c.parentNode = n; n.children.push(c); return c; };
    n.setAttribute = () => {};
    n.addEventListener = (ev, fn) => { n.listeners[ev] = fn; };
    n.click = () => n.listeners.click && n.listeners.click();
    return n;
  };
  const doc = {
    cookie: '',
    body,
    head: { appendChild(n) { scripts.push(n); return n; } },
    createElement: mk
  };
  body.removeChild = (n) => { body.children = body.children.filter((c) => c !== n); n.parentNode = null; };
  const store = new Map(stored ? [['gb_consent', stored]] : []);
  const blocked = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  };
  const working = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v)
  };
  const win = {
    document: doc,
    location: { hostname, pathname },
    localStorage: storageThrows ? blocked : working,
    handlers: {},
    addEventListener(ev, fn) { win.handlers[ev] = fn; }
  };
  const find = (cls) => {
    const out = [];
    const walk = (n) => {
      n.children.forEach((c) => {
        if (String(c.className).split(' ').includes(cls)) out.push(c);
        walk(c);
      });
    };
    walk(body);
    return out;
  };
  return { win, scripts, body, find, store };
}

const OFF = 'ga-disable-G-1GH0Q0920W';

test('first visit on the live host: banner shows, no tag is requested', () => {
  const b = fakeBrowser({ hostname: 'www.merlow.space' });
  a.init(b.win);
  assert.equal(b.find('consent').length, 1);
  assert.equal(b.scripts.length, 0);
  assert.equal(b.win.dataLayer, undefined);
  assert.equal(b.win[OFF], true);
});

test('Accept loads gtag.js once, with consent v2 signals; Decline afterwards switches it off', () => {
  const b = fakeBrowser({ hostname: 'www.merlow.space' });
  a.init(b.win);
  b.find('consent__btn')[1].click(); // Accept
  assert.equal(b.scripts.length, 1);
  assert.match(b.scripts[0].src, /googletagmanager\.com\/gtag\/js\?id=G-1GH0Q0920W$/);
  assert.equal(b.store.get('gb_consent'), 'granted');
  assert.equal(b.win[OFF], false);
  const calls = b.win.dataLayer.map((x) => Array.from(x));
  assert.deepEqual(calls[0].slice(0, 2), ['consent', 'default']);
  assert.equal(calls[0][2].ad_storage, 'denied');
  assert.equal(calls[0][2].analytics_storage, 'granted');
  assert.deepEqual(calls[2], ['config', 'G-1GH0Q0920W']);
  assert.equal(b.find('consent').length, 0, 'banner closed');
  assert.equal(b.find('consent__chip').length, 1, 'chip offered');
  assert.equal(b.body.classes.has('consent-chip-on'), true, 'room reserved under the footer');

  b.find('consent__chip')[0].click(); // reopen
  assert.equal(b.body.classes.has('consent-chip-on'), false, 'room released while the banner is open');
  b.win.document.cookie = '_ga=x';
  b.find('consent__btn')[0].click(); // Decline
  assert.equal(b.store.get('gb_consent'), 'denied');
  assert.equal(b.win[OFF], true);
  const last = Array.from(b.win.dataLayer[b.win.dataLayer.length - 1]);
  assert.deepEqual(last, ['consent', 'update', { analytics_storage: 'denied' }], 'Google told consent was withdrawn');
  assert.equal(b.scripts.length, 1, 'no second script');
});

test('a stored Accept loads the tag on the next visit without asking again', () => {
  const b = fakeBrowser({ hostname: 'merlow.space', stored: 'granted' });
  a.init(b.win);
  assert.equal(b.find('consent').length, 0);
  assert.equal(b.scripts.length, 1);
});

test('a stored Decline loads nothing and shows only the chip', () => {
  const b = fakeBrowser({ hostname: 'merlow.space', stored: 'denied' });
  a.init(b.win);
  assert.equal(b.scripts.length, 0);
  assert.equal(b.find('consent').length, 0);
  assert.equal(b.find('consent__chip').length, 1);
});

test('localhost shows the banner but never loads the tag, even after Accept', () => {
  const b = fakeBrowser({ hostname: 'localhost' });
  a.init(b.win);
  assert.equal(b.find('consent').length, 1);
  b.find('consent__btn')[1].click();
  assert.equal(b.scripts.length, 0);
});

test('preview hosts and /admin do nothing at all', () => {
  const preview = fakeBrowser({ hostname: 'merlowunfiltered-git-x.vercel.app', stored: 'granted' });
  a.init(preview.win);
  assert.equal(preview.scripts.length, 0);
  assert.equal(preview.body.children.length, 0);
  const admin = fakeBrowser({ hostname: 'www.merlow.space', pathname: '/admin/edit', stored: 'granted' });
  a.init(admin.win);
  assert.equal(admin.scripts.length, 0);
  assert.equal(admin.body.children.length, 0);
});

test('with storage blocked the banner is still dismissable and nothing is assumed before a choice', () => {
  const b = fakeBrowser({ hostname: 'www.merlow.space', storageThrows: true });
  a.init(b.win);
  assert.equal(b.scripts.length, 0);
  assert.equal(b.find('consent').length, 1);
  b.find('consent__btn')[1].click();
  assert.equal(b.find('consent').length, 0);
  assert.equal(b.scripts.length, 1);
});

test('a stored Decline sets the off flag and loads nothing', () => {
  const b = fakeBrowser({ hostname: 'www.merlow.space', stored: 'denied' });
  b.win.document.cookie = '_ga=leftover';
  a.init(b.win);
  assert.equal(b.win[OFF], true);
  assert.equal(b.scripts.length, 0);
});

test('the banner links to the privacy policy', () => {
  const b = fakeBrowser({ hostname: 'www.merlow.space' });
  a.init(b.win);
  const link = b.find('consent__link')[0];
  assert.equal(link.href, '/privacy');
});

test('storage cleared in another tab switches the tag off and asks again', () => {
  const b = fakeBrowser({ hostname: 'www.merlow.space', stored: 'granted' });
  a.init(b.win);
  assert.equal(b.win[OFF], false);
  assert.equal(b.find('consent').length, 0);
  b.store.clear(); // the other tab removed the choice
  b.win.handlers.storage({ key: null });
  assert.equal(b.win[OFF], true);
  assert.equal(b.find('consent').length, 1, 'banner is back');
  const last = Array.from(b.win.dataLayer[b.win.dataLayer.length - 1]);
  assert.deepEqual(last, ['consent', 'update', { analytics_storage: 'denied' }]);
});

test('another tab accepting loads the tag here too, and unrelated storage keys are ignored', () => {
  const b = fakeBrowser({ hostname: 'www.merlow.space' });
  a.init(b.win);
  assert.equal(b.find('consent').length, 1);
  b.win.handlers.storage({ key: 'something_else' });
  assert.equal(b.scripts.length, 0);
  b.store.set('gb_consent', 'granted');
  b.win.handlers.storage({ key: 'gb_consent' });
  assert.equal(b.scripts.length, 1);
  assert.equal(b.find('consent').length, 0, 'banner closed');
});
