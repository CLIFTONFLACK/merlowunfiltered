/* Google Analytics 4 for merlow.space, behind a cookie choice.
   js/analytics.js

   GA4 property "MerlowsMusic" (G-1GH0Q0920W). Basic Consent Mode: gtag.js is not
   requested at all until the visitor accepts, so nothing goes to Google before
   consent. The choice lives in localStorage (key gb_consent) on this device, with an
   in-memory fallback if storage is blocked. Declining or withdrawing switches the tag
   off and deletes the _ga cookies.

   Only merlow.space and its subdomains report. Preview URLs and the owner's
   /admin editor never load the tag; localhost shows the banner so it can be built
   against, but does not load the tag either.

   Loaded with `defer` on the public pages. Also requirable from node for tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.init(root);
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var GA_ID = 'G-1GH0Q0920W';
  var KEY = 'gb_consent';

  /** The only hosts that report to the MerlowsMusic property. */
  function isTrackedHost(hostname) {
    var h = String(hostname || '').toLowerCase();
    return h === 'merlow.space' || /\.merlow\.space$/.test(h);
  }

  /** The banner shows where it can take effect, plus localhost for development. */
  function showsBanner(hostname) {
    var h = String(hostname || '').toLowerCase();
    return isTrackedHost(h) || h === 'localhost' || h === '127.0.0.1';
  }

  /** The owner's editor serves the public pages with an edit layer: never track those. */
  function isExcludedPath(pathname) {
    var p = String(pathname || '');
    return p === '/admin' || p.indexOf('/admin/') === 0;
  }

  function parseConsent(raw) {
    return raw === 'granted' || raw === 'denied' ? raw : null;
  }

  /** gtag.js sets _ga, _ga_<container>, _gid and _gat*. */
  function isGaCookieName(name) {
    return name === '_ga' || name === '_gid' || name.indexOf('_ga_') === 0 || name.indexOf('_gat') === 0;
  }

  /** Expire GA cookies on this host and its parent domain, where gtag.js writes them. */
  function clearGaCookies(doc, hostname) {
    var parts = String(hostname).split('.');
    var domains = [hostname];
    if (parts.length > 2) domains.push(parts.slice(-2).join('.'));
    var gone = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    doc.cookie.split(';').forEach(function (pair) {
      var name = pair.split('=')[0].trim();
      if (!name || !isGaCookieName(name)) return;
      domains.forEach(function (d) {
        doc.cookie = name + '=; ' + gone + '; domain=.' + d;
        doc.cookie = name + '=; ' + gone + '; domain=' + d;
      });
      doc.cookie = name + '=; ' + gone;
    });
  }

  function init(win) {
    var doc = win.document;
    var loc = win.location;
    var host = loc.hostname;
    if (!showsBanner(host) || isExcludedPath(loc.pathname)) return;

    var memory = null;
    var loaded = false;
    var banner = null;
    var chip = null;

    function read() {
      try {
        return parseConsent(win.localStorage.getItem(KEY)) || memory;
      } catch (e) {
        return memory; // never consent unless the visitor chose it this page view
      }
    }

    function write(value) {
      memory = value;
      try {
        win.localStorage.setItem(KEY, value);
      } catch (e) {
        /* storage blocked: memory carries the choice for this page view */
      }
    }

    function gtagUpdate(value) {
      if (typeof win.gtag === 'function') win.gtag('consent', 'update', { analytics_storage: value });
    }

    function loadTag() {
      if (loaded || !isTrackedHost(host)) return;
      loaded = true;
      win.dataLayer = win.dataLayer || [];
      win.gtag = function () { win.dataLayer.push(arguments); };
      win.gtag('consent', 'default', {
        analytics_storage: 'granted',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
      win.gtag('js', new Date());
      win.gtag('config', GA_ID);
      var s = doc.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
      doc.head.appendChild(s);
    }

    function apply(consent) {
      win['ga-disable-' + GA_ID] = consent !== 'granted';
      if (consent === 'granted') {
        if (loaded) gtagUpdate('granted'); else loadTag();
      } else if (consent === 'denied') {
        gtagUpdate('denied');
        clearGaCookies(doc, host);
      }
    }

    function el(tag, className, text) {
      var n = doc.createElement(tag);
      if (className) n.className = className;
      if (text) n.textContent = text;
      return n;
    }

    function closeBanner() {
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      banner = null;
    }

    function choose(value) {
      write(value);
      closeBanner();
      apply(value);
      renderChip();
    }

    function openBanner() {
      if (banner) return;
      if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
      chip = null;
      doc.body.classList.remove('consent-chip-on');
      banner = el('section', 'consent');
      banner.setAttribute('aria-label', 'Cookie choice');
      banner.appendChild(el('h2', 'consent__title', 'Cookies'));
      banner.appendChild(el('p', 'consent__text',
        'Can we use Google Analytics cookies to see which pages people visit? No ads and nothing is sold. ' +
        'We remember your choice on this device, and you can change it any time with the “Cookie settings” button.'));
      var row = el('div', 'consent__row');
      var decline = el('button', 'btn btn--line consent__btn', 'Decline');
      var accept = el('button', 'btn btn--primary consent__btn', 'Accept');
      decline.type = accept.type = 'button';
      decline.addEventListener('click', function () { choose('denied'); });
      accept.addEventListener('click', function () { choose('granted'); });
      row.appendChild(decline);
      row.appendChild(accept);
      banner.appendChild(row);
      doc.body.appendChild(banner);
    }

    function renderChip() {
      if (chip || banner || read() === null) return;
      chip = el('button', 'consent__chip', 'Cookie settings');
      chip.type = 'button';
      chip.addEventListener('click', openBanner);
      doc.body.appendChild(chip);
      // Room under the footer so the button never sits on top of its last line.
      doc.body.classList.add('consent-chip-on');
    }

    // Another tab changed the choice.
    win.addEventListener('storage', function (e) {
      if (e.key !== KEY) return;
      var now = read();
      if (now) apply(now);
    });

    var current = read();
    win['ga-disable-' + GA_ID] = current !== 'granted';
    if (current === null) openBanner();
    else {
      apply(current);
      renderChip();
    }
  }

  return {
    GA_ID: GA_ID,
    isTrackedHost: isTrackedHost,
    showsBanner: showsBanner,
    isExcludedPath: isExcludedPath,
    parseConsent: parseConsent,
    isGaCookieName: isGaCookieName,
    clearGaCookies: clearGaCookies,
    init: init
  };
});
