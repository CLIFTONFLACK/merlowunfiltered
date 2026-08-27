# Content editor for merlow.space

Port of the VANCE-HQ editor (`slapharma/vnet`, `/admin/edit`) to merlow.space.

## Decisions taken (2026-08-27)

| | HQ | merlow.space | why the difference |
|---|---|---|---|
| Sign-in | Google SSO + email allowlist | one admin password → signed cookie | no Google Workspace behind merlow.space; one admin |
| Store | Upstash Redis, overrides only | a commit to `CLIFTONFLACK/merlowunfiltered` | no store on this project; the repo already deploys |
| Applied | at render, every request | by the deploy the commit triggers | the site stays 100% static |
| Scope | the whole gateway | `/shop` and `/shop/:id` copy | asked for |

The shape that carries over unchanged: **the editor IS the page.** Not a form
beside it. Same HTML, same CSS, same JS, rendered with one flag set.

The shape that did NOT carry over: HQ's defaults-in-code / overrides-in-a-store
split, and all the machinery in its `lib/content.js` that keeps the two from
forking. With no store there is nothing to fork against, so every string has
exactly one home and there is no defaults table at all.

## Build

- [x] `lib/admin-auth.js` — password check, HMAC session cookie, gate
- [x] `lib/copy.js` — the string schema; read/write `js/copy.js`; sanitisers
- [x] `lib/page-edit.js` — read defaults out of marked HTML; write edits back in
- [x] `lib/content.js` — the three files as one document; apply a save
- [x] `lib/site-files.js` — reading the site's own files from inside a function
- [x] `lib/github.js` — one atomic multi-file commit via the Git Data API
- [x] `lib/edit-mode.js` — the editing layer: styles, save bar, panel, client script
- [x] `lib/admin-page.js` — the shell for the two pages that are not the site
- [x] `api/admin/signin.js` — the sign-in page, the exchange and the sign-out
- [x] `api/admin/index.js` — `/admin`, the hub, and the health checks
- [x] `api/admin/edit.js` — `/admin/edit`, the page with editing on
- [x] `api/admin/content.js` — the save
- [x] `js/copy.js` — generated; the 17 strings the scripts print
- [x] marked up `shop.html` / `product.html`; pointed `shop.js` / `product.js` at the copy
- [x] `vercel.json` rewrites + `includeFiles`
- [x] 37 tests, three of them proved red by breaking the thing they check
- [x] README

## Two things found while building

**The home page needed the copy table too.** `priceLabel` in `cart.js` prints
`from` on every product card, and index.html renders the same cards for its shop
preview — so moving that string into `js/copy.js` without loading the file there
would have printed the literal key `product.priceFrom` on the home page. Fixed by
adding the script tag; no home-page copy was made editable.

**A string in both places was silently losing edits.** `product.loading` is on
the page *and* in the panel, and `collect()` read the page first and the panel
second, so the panel won and an edit typed on the page was thrown away on save.
The two now mirror each other in both directions.

## Still outstanding — for the user

1. **Three environment variables** on the `merlowunfiltered` Vercel project:
   `MERLOW_ADMIN_PASSWORD`, `MERLOW_SESSION_SECRET`, `GITHUB_TOKEN`. Until all
   three are set the editor says so plainly and saves nothing.
2. **`main` is behind the live site.** The last deploy went out from the CLI with
   a dirty tree (`index.html`, `css/styles.css`, `js/main.js`, `README.md`), so
   git does not have what is deployed. The editor commits to `main`, and the
   project is git-connected — a save before those changes are pushed would build
   from `main` and revert them on the live site. The save endpoint DETECTS this
   and refuses, so nothing can be lost silently, but the editor stays unusable
   until the tree is committed and pushed.

## Review

Every string on `/shop` and `/shop/:id` — 37 of them — is now editable in place
at `/admin/edit`, and a save is one commit. No new service, no database, no build
step, and the public pages are exactly as static as they were.
