# Content editor for merlow.space

Port of the VANCE-HQ editor (`slapharma/vnet`, `/admin/edit`) to merlow.space.
**Live and in use.** See the README for how to work it; this is the build log.

## Decisions taken (2026-08-27)

| | HQ | merlow.space | why the difference |
|---|---|---|---|
| Sign-in | Google SSO + email allowlist | one admin password → signed cookie | no Google Workspace behind merlow.space; one admin |
| Store | Upstash Redis, overrides only | a commit to `CLIFTONFLACK/merlowunfiltered` | no store on this project; the repo already deploys |
| Applied | at render, every request | by the deploy the commit triggers | the site stays 100% static |
| Scope | the whole gateway | started at `/shop` and `/shop/:id`, now the home page too | asked for, then extended |

The shape that carries over unchanged: **the editor IS the page.** Not a form
beside it. Same HTML, same CSS, same JS, rendered with one flag set.

The shape that did NOT carry over: HQ's defaults-in-code / overrides-in-a-store
split, and all the machinery in its `lib/content.js` that keeps the two from
forking. With no store there is nothing to fork against, so every string has
exactly one home and there is no defaults table at all.

## What is editable

88 strings — 51 on the home page, 12 on the shop, 8 on the product template,
17 printed by scripts. Not the tracklist (a fact about the record, so it lives
in `js/main.js` next to the YouTube id it changes with) and not product
names or prices (Printful's).

## Four things that went wrong, and what each cost

Worth keeping, because three of the four were checks that could not fail.

1. **The home page needed the copy table too.** `priceLabel` in `cart.js`
   prints `from` on every product card and index.html renders the same cards,
   so moving that string into `js/copy.js` without loading the file there would
   have printed the literal key `product.priceFrom` on the front page. Caught
   before shipping.

2. **A string in both the page and the panel silently lost edits.**
   `collect()` read the page first and the panel second, so the panel won.
   They now mirror each other in both directions.

3. **`index.html` was not in `functions.includeFiles`.** Adding it to the
   schema and to the literal table in `lib/site-files.js` puts nothing in a
   deployed bundle. It worked locally and `/admin` said "index.html could not
   be read" in production. The test in place at the time asserted the file was
   in the literal table — true, and silent about the bundle. The test now reads
   the real `vercel.json` and demands the two lists match exactly.

4. **The home page opened in the editor completely unstyled.** Its assets are
   asked for by relative path, and served from `/admin/edit` they resolve to
   `/admin/css/styles.css` and 404. It was verified by asking the DOM whether
   the marks were present and armed — they were, so every check came back true
   while the page was unreadable. An unstyled page is invisible to a
   `querySelector`. One `<base href="/">` in the edit layer fixes every page.

## Review

Every string on the home page, the shop and the product template is editable in
place, and a save is one commit. No new service, no database, no build step,
and the public pages are exactly as static as they were.
