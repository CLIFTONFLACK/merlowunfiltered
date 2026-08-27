# MERLOW — website

> **Paths updated 2026-08-27.** `Assets/Songs` was reorganised song-first
> (`Songs/UNFILTERED/featuring <Artist>/{Audio,Lyrics,Artwork,Lyric_Video,Shorts}/`,
> shared material under `UNFILTERED/_Shared/`). Asset paths below — including those in
> completed entries — were rewritten to the new tree so they still resolve.
> See `.claude/skills/unfiltered-lyric-video/references/asset_map.md`.

Single static page for MERLOW and the debut collaborative album **UNFILTERED** —
one song, fifteen collaborations, one shared voice.

No build step and no framework. The pages themselves have no dependencies; the
`/api` functions have two (`stripe`, `sharp`) and Vercel installs them.

```
index.html        the home page
shop.html         /shop — the full catalog
product.html      /shop/:id — one product (rewritten to, see vercel.json)
css/styles.css    design system + layout
js/main.js        home page: tracklist, YouTube slots, hero, story, shop preview
js/shop.js        /shop
js/product.js     the product page
js/cart.js        cart, postage, checkout — shared by all three
js/reveal.js      scroll reveal, shared by all three
media/            web-optimised copies of the release assets
lib/, api/        the Printful and Stripe side — see "Shop" below
test/             unit tests, and a check to run against a deployment
```

`cart.js` and `reveal.js` load before every page script. Both are shared on
purpose: the cart must render the same on all three pages, and `.reveal` sits at
opacity 0 until the observer reaches it, so a page that carries the class
without running the observer shows nothing at all.

There is no site header or nav bar on the home page by design: it opens straight
into the hero video and is navigated by scrolling. `/shop` and `/shop/:id` do
carry one, because they are pages you can arrive at cold.

---

## Adding the YouTube videos

Open **`js/main.js`**. The `VIDEOS` object at the top is the only place to edit.

Take the 11-character ID out of the watch URL and paste it between the quotes:

```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
                                ^^^^^^^^^^^  this part
```

```js
const VIDEOS = {
  featured:   '-XMXp3gifag',   // the Marcus Whitefield cut
  'track-01': 'A3Bn3vJVUB8',   // Caldwell — Indie UK
  'track-02': '-XMXp3gifag',   // Marcus Whitefield — Indie UK
  ...
};
```

**Current state: all fifteen are live and wired.** Nothing is pending.

The empty-slot handling is still there and still works, because a video can be
pulled or replaced later: a slot left empty renders a **"Not yet released"** tile
naming the version that belongs there and pointing at the channel, and its
tracklist row is marked `Soon`. So the page stays correctly laid out, and a
visitor is told what they are looking at rather than shown an internal note.

The channel and playlist URLs live in `CHANNEL_URL` / `PLAYLIST_URL` directly above
`VIDEOS`:

```
channel   https://www.youtube.com/@MerlowHQ
playlist  https://www.youtube.com/playlist?list=PLEjCGD4tGVKQ
```

Once an ID is set the slot becomes a **click-to-load thumbnail** — the YouTube iframe
is only injected when someone clicks play, so YouTube loads nothing (and sets nothing)
on a normal page view. Embeds use `youtube-nocookie.com`.

## Changing the tracklist

The `TRACKS` array sits just below `VIDEOS` in the same file. Rows render in array
order and the numbering follows automatically. If you add or remove a track, add or
remove the matching `track-NN` key in `VIDEOS` too.

## Replacing media

Everything in `media/` is a resized copy — the originals are untouched in
`../Assets/`. Keep the filenames the same and the page picks the new files up.

| File | What it is | Source |
|---|---|---|
| `hero-loop.mp4` | hero background loop, audio stripped | `Assets/Songs/M logo animation 2.mp4 (MISSING - see asset_map.md)` |
| `hero-poster.jpg` | still shown before the video loads | frame from the same clip |
| `cover.jpg` | album cover | `UNFILTERED-cover art.png` |
| `merlow-wordmark.png` | the hero MERLOW mark — the cover's own wordmark, keyed to transparency, not type imitating it | `UNFILTERED-cover art.png` |
| `chips.png` | chipped-paint mask for the three slogan lines, built from the chips inside the cover wordmark's strokes | `UNFILTERED-cover art.png` |
| `chips-blue.png` | the same tile, alpha inverted and gamma-curved, painted deep navy — the worn-through undercoat on the H2/H3 headings | derived from `chips.png` |
| `story-01..02.mp4` + `.jpg` | the two story clips and their poster frames — silent loops, `preload="none"`, started only when the band scrolls into view | `_Shared/Clips/clips_Seedance/clip_01, 03` |
| `plate.jpg` | faint texture behind the chorus | `Design Mockups/UnUnUn_good.png` |
| `favicon.png` (256), `favicon-180.png`, `favicon-32.png` | tab icon and apple-touch icon: the M mark, studio background keyed out to transparency, cropped to the mark, with a bone rim so the near-black half still reads on a dark browser tab | `M Logo.png` |

The hero video must stay **silent** — browsers refuse to autoplay a clip with an audio
track, and the page would fall back to the poster image.

## Shop — Printful + Stripe

Nothing about the shop is written down in this repo. `js/main.js`, `js/shop.js` and
`js/product.js` all read `/api/products`, a serverless function that proxies Printful so
the API token never reaches the browser. The cart is `localStorage`. Checkout posts the
cart to `/api/create-checkout-session`, which re-prices everything against Printful
server-side, creates a Stripe Checkout Session and returns its hosted URL — the browser
is redirected there, so there is no Stripe.js on the page. `/api/webhook` listens for
`checkout.session.completed` and creates the matching order in Printful.

```
lib/printful.js                shared Printful API client
lib/shipping.js                where we ship to, and how a country becomes a rate
lib/mockup.js                  takes the backdrop off a product mockup
api/products.js                GET  — catalog for the frontend
api/product.js                 GET ?id= — one product, enriched
api/mockup.js                  GET ?src= — one mockup, backdrop removed
api/shipping-rates.js          GET  — the countries we ship to
                               POST — Printful's rates for a cart and a country
api/create-checkout-session.js POST — cart in, Stripe Checkout URL out
api/webhook.js                 POST — Stripe -> Printful order creation
```

**Adding products.** Nothing here needs editing — add the product in Printful and it appears
on the site within about a minute (the catalog is cached for 60s per warm lambda, and the
response carries `s-maxage=60`). It gets a card on `/shop`, a preview slot on the home page if
it is one of the first three, and its own page at `/shop/:id`. Colours, sizes, prices and the
gallery all follow the variants you sync. `lib/printful.js` walks every page of
`/store/products`, so the catalog is not capped at Printful's default page of 20.

**Where the product copy comes from.** A Printful *sync* product carries only a name, a
thumbnail and its variants — no description, no colour names, no brand. Those live on the
*catalog* product it was made from, so `shape()` follows `product_id` off the first variant
to `/products/:id` and merges the two. Those lookups are cached for half an hour and shared
between products, so a shop full of the same blank costs one of them. If the call fails the
page still prices and sells correctly; it just loses the blurb and the swatch colours.

**Product names.** Every product is called "… Official MERLOW …" in Printful, which is useful
inside a Printful account and says nothing on MERLOW's own shop. `cleanTitle()` drops that
phrase and tidies the separators it leaves behind, so the API returns both `name` (exactly as
Printful has it) and `title` (what the card shows). It is deliberately narrow — one known
phrase — and falls back to the original for anything it would otherwise leave blank.

### Mockups have no backdrop

Printful returns two kinds of image for the same store. The per-variant mockups come with an
alpha channel; the product-level `thumbnail_url` is the same garment flattened onto white. On
this page a white box is loud, and the two kinds were sitting side by side in the same grid.

Every mockup the site renders now goes through **`/api/mockup`**, which fetches it from
Printful, takes the backdrop off and serves WebP — or PNG, by `Accept` — cached at the edge
for a year. Images that are already cut out pass through untouched.

The cut is careful, because the white Adidas cap is the same white as the backdrop it stands
on. The backdrop is found by flooding inward from the border, so only backdrop *connected to
the edge* goes; and if the flood turns out to have emptied the middle of the frame it is
thrown away and retried hugging the backdrop's own sampled colour. If that leaks too, the
original is served unchanged. A mockup with a white box behind it is worse than one without;
a mockup with a hole through the product is worse than both.

If anything in there fails, the request redirects to the original Printful URL — the shop
keeps working, it just keeps its backdrop.

`CARD_IMAGE` in `lib/printful.js` chooses which mockup fronts a card: the variant one you
picked for the first colourway (default), or Printful's own main image for the product. Both
come out with no backdrop; it only changes the composition, and the variant mockups are
sometimes lifestyle shots. Changing which mockup one product uses is a Printful job, not a
code one.

### Shipping is quoted from Printful

Stripe's hosted Checkout can only offer shipping rates that were fixed when the session was
created — it cannot re-quote once the buyer types an address. Printful will not quote against
a bare country. So the cart asks for a destination country, `/api/shipping-rates` prices the
actual cart against Printful for it, and the Stripe session is then **locked to that one
country** with Printful's own rates as the only options. Nobody is quoted for London and
shipped to Sydney.

`SHIP_TO` in `lib/shipping.js` is the list of countries offered, each with a real address
inside it used only to obtain that country's rate — Printful prices apparel as a flat rate per
country, so the anchor's answer is the country's answer. Add a country by adding a row. Where
it isn't the country's answer — somewhere remote inside a large country — Printful can charge
a little more than the buyer paid. That gap is known and bounded.

The buyer's chosen rate rides through Stripe as `metadata.printfulRateId` and is read back in
the webhook, so the Printful order uses the service that was actually paid for.

Nothing in the request body decides what anyone is charged. The cart sends variant ids,
quantities and a country; prices and postage are fetched again from Printful inside the
checkout endpoint.

### Environment variables

| Variable | Where it comes from |
|---|---|
| `PRINTFUL_API_TOKEN` | Printful → Stores → your API-type store → Settings → API |
| `PRINTFUL_STORE_ID` | Only needed for an account-level token from developers.printful.com that can see more than one store |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Created with the webhook endpoint — see below |

**The Stripe webhook is wired up** — endpoint `we_1U70RiBsqra5qpROre8jJ97d`, live mode,
`https://merlow.space/api/webhook`, subscribed to `checkout.session.completed`. To rebuild it
after rolling a secret or moving the site:

1. Stripe dashboard → Developers → Webhooks → Add endpoint.
2. Endpoint URL: `https://merlow.space/api/webhook`.
3. Event to send: `checkout.session.completed`.
4. Copy the signing secret it gives you into `STRIPE_WEBHOOK_SECRET` in Vercel, then
   redeploy. **A webhook secret only takes effect on a new deployment** — setting the variable
   is not enough, and a stale deployment fails verification in a way that looks exactly like a
   wrong secret.

To check the secret a deployment is actually holding, without making a payment: hand-sign an
event and post it. Stripe's header is `t=<unix seconds>,v1=<HMAC-SHA256 of "<t>.<body>" with
the secret>`. Send a `checkout.session.completed` whose `payment_status` is *not* `paid` and
the handler will verify it, decline to order, and answer `200 {"received":true,"ordered":false}`
— proof the secret matches, with nothing sent to Printful. Repeat with a junk secret and expect
a 400, or the 200 means nothing.

### MERLOW shares a Stripe account with GetForged

A Stripe webhook endpoint subscribes to an *event type* for the whole account. It cannot be
scoped to one product, one app or one domain. So MERLOW's endpoint is delivered GetForged's
completed checkouts and GetForged's endpoint is delivered MERLOW's, and neither can be
configured out of it.

Every session this shop creates is therefore tagged `metadata.app = "merlow"`, repeated onto
the PaymentIntent so the charge is attributable in an export or a Sigma query. `api/webhook.js`
drops anything tagged for another app before it spends an API call on it — see
`lib/ownership.js`.

Untagged sessions need care in both directions, and get a structural test instead: a session
whose line items carry Printful sync variant ids is ours, and one whose don't isn't. That
matters because an order taken before tagging shipped has no tag, and dropping it would mean a
paid customer who never receives anything — while an untagged GetForged sale must still never
be ordered from Printful.

**GetForged's side is not done, and is not in this repo.** Until it filters too, it is
receiving MERLOW's completed checkouts. It needs the mirror image:

```js
// when it creates a session
metadata: { app: 'getforged' },
payment_intent_data: { metadata: { app: 'getforged' } },

// first thing inside checkout.session.completed
const tag = session.metadata?.app;
if (tag && tag !== 'getforged') return res.status(200).json({ received: true });
```

Answering **200** matters. A non-2xx tells Stripe to retry, so erroring on the other shop's
traffic means retrying every one of their sales until Stripe disables the endpoint for failing
too often — at which point your own orders stop arriving as well.

Branding is still shared: MERLOW's checkout page carries GetBrian's display name and logo, and
the card statement will too. That needs a separate Stripe account or a Connect connected
account — see the end of `../tasks/shop-checkout-2026-08-21.md`.

**Orders start as drafts.** `api/webhook.js` has `AUTO_CONFIRM_ORDERS = false` at the top —
paid orders land in Printful unconfirmed, so nothing gets produced or charged to your
Printful account automatically. Confirm them by hand in the Printful dashboard until you have
watched a few go through end to end, then flip that flag to `true`.

A Stripe webhook that does not get a 2xx is retried, and it will retry one whose order *was*
placed if the reply was lost coming back. The order carries the Stripe session id as its
`external_id`; Printful refuses a second order with the same one, and the handler treats that
refusal as "already done" rather than an error. So a retry cannot produce a second jacket.
A session that completes without the money having arrived — a delayed payment method — is
acknowledged and not ordered.

### Testing checkout end to end

Point the site at Stripe's test keys, run a purchase with a test card, and watch the order
arrive in Printful as a draft. Nothing real moves.

1. Set `STRIPE_SECRET_KEY` to the `sk_test_…` key from the Stripe dashboard.
2. Add a webhook endpoint in **test mode** for `https://merlow.space/api/webhook`, event
   `checkout.session.completed`, and put its `whsec_…` into `STRIPE_WEBHOOK_SECRET`.
3. Redeploy, then buy something with card `4242 4242 4242 4242`, any future expiry, any CVC.
4. Check Stripe → Developers → Webhooks shows a 200, and Printful → Orders shows a draft
   with the right variant, quantity, address and shipping method.
5. Swap both variables for their live values and redeploy.

## Editing the site's words — `/admin/edit`

Sign in at **merlow.space/admin**, open a page, and type on it. The page you type
on is the real page: same file, same stylesheet, same scripts, real products from
Printful. Nothing is a preview of anything.

**Saving is a commit.** There is no database. Every string lives in the file that
serves it, so a save rewrites those files, commits them to `main` as one commit,
and the push triggers the ordinary deploy — the change is live about a minute
later. That means every edit has a diff, an author and a revert, and it means
"undo" is `git revert`, not a button.

### What is editable, and where each string lives

88 strings, in three files:

| | |
|---|---|
| `index.html` | the hero, the chorus, the three story panels, the facts, every section heading and lede, the whole footer, and the page's title and share card |
| `shop.html` | the shop's title, meta description, share card, nav, eyebrow, heading, lede, footer |
| `product.html` | the product page's title, meta description, nav, crumb, footer |
| `js/copy.js` | everything a script prints — the button, the option labels, the made-to-order note, the empty and error states, the spec headings |

**Not** editable here, on purpose:

- **Product names, prices and photographs.** Printful's, not ours.
- **The tracklist.** Who is on the record and what genre they sang it in is a
  fact about the album, and it lives in `js/main.js` next to the YouTube id it
  has to change with — the same reason VANCE-HQ keeps its inventory in
  `lib/estate.js` and only its *wording* in the editor. What the record is
  called is copy; who is on it is not.

Each string has exactly **one** home. There is no defaults table and no second
copy anywhere, so nothing can drift out of step with the page. `lib/copy.js` is
the schema: it says which file holds each string and how long it may be, and it
holds no values.

In the markup a string is marked with `data-edit="<key>"`:

```html
<h1 class="section-title" data-edit="shop.heading">The collection</h1>
<meta name="description" content="…" data-edit="shop.metaDescription" data-edit-attr="content">
```

**A mark may only go on an element whose content is plain text** — no nested
elements, not even an `<em>`. That invariant is what lets the rewriter find the
closing tag without parsing HTML, and it is checked by the tests rather than
trusted. Where the page needs markup around an editable string, the mark goes on
a `<span>` inside it wrapping only the words — see the footer, whose year is
filled in by script.

`js/copy.js` is **generated**. Every save rewrites it whole, in one fixed shape,
which is what lets the server read it back. Editing it by hand is fine; changing
its shape is not.

### The strings you cannot point at

A page title, a search-result description, the message shown when the shop fails
to load. All copy, none of it on screen when things are going well. **More copy**
in the save bar opens a panel listing them, grouped by what they are for. A string
that is both on the page and in the panel stays in step in both directions.

### Environment variables it needs

| Variable | What it is |
|---|---|
| `MERLOW_ADMIN_PASSWORD` | what you type at `/admin/signin` |
| `MERLOW_SESSION_SECRET` | random, 32+ characters, signs the session cookie |
| `GITHUB_TOKEN` | fine-grained PAT on `CLIFTONFLACK/merlowunfiltered` with **Contents: read and write** |

Optional: `MERLOW_CONTENT_REPO` and `MERLOW_CONTENT_BRANCH` override the defaults
`CLIFTONFLACK/merlowunfiltered` and `main`.

Miss any of the three and the editor says so plainly rather than half-working —
`/admin` checks all of them, by using them, before you have typed anything.

**On the token, and a trap worth knowing about.** `merlowunfiltered` is a public
repository, so *reads succeed for any valid token at all* — including one
belonging to a different GitHub account. Everything therefore looks fine right up
to the first write, which comes back `403 Resource not accessible by personal
access token`. So `/admin` asks GitHub the only question that actually settles it
— `permissions.push` on the repository — and names the account the token belongs
to, because the usual cause is a token minted while signed in as the wrong one of
several accounts. Changing **Contents** from Read-only to **Read and write** on
an existing fine-grained token takes effect immediately; it does not need
reissuing or re-adding to Vercel.

### The one way this can lose work

The editor reads the files out of the running deployment. If that deployment was
built from something other than the head of `main` — a `vercel --prod` from a
dirty tree, say — then committing those files would carry the older ones forward
over the newer and undo them. So `/admin` and every save check the deployed
commit against the branch head, and refuse rather than guess. **Deploy from a
clean, pushed tree and this never arises.**

## Tests

```
npm test                              # keying, product names, and the content editor
node test/deploy-check.mjs <url>      # against a real deployment
```

`test/content-editor.test.js` covers the editor. Two of its cases are the ones that
matter: *every string the schema names is in one of the real files* goes red the
moment a `data-edit` mark is deleted from the markup, and *a commit is blobs, then
one tree, then one commit, then one move of the branch* goes red if the branch is
ever moved with `force` or the tree loses its `base_tree` — the two mistakes that
would quietly destroy work. Both were checked by breaking them on purpose.

`test/mockup.test.js` and `test/printful.test.js` use Node's own test runner — no framework.
`test/deploy-check.mjs` runs against a preview or production URL and asserts the two things
nothing else can: every mockup the shop renders comes back with no backdrop and with the
product still in it, and postage to every country on offer is a real number from Printful. It
keys three known flattened mockups on purpose, with a control that first checks those
originals really are on white — otherwise the assertion would be passing on images that never
needed keying.

The Stripe half is deliberately not in there. Creating a Checkout Session is a write to a live
payments account, so it is done by hand from the runbook above.

**npm cannot install into this folder.** It lives on a Google Drive mount and `npm i` fails
with `EBADF`. Vercel installs fine on its own machines, so this only affects running the tests
locally: install `sharp` into a scratch folder and point `NODE_PATH` at it.

```
NODE_PATH=/c/scratch/node_modules node --test test/mockup.test.js test/printful.test.js
```

## Still to wire up

- **Mailing list** — the footer form is a visual placeholder. It intercepts submit and
  says so on screen; nothing is sent anywhere. Point it at Mailchimp / Buttondown /
  ConvertKit when you have an account.
- **Tax** — nothing charges VAT or sales tax. Stripe Tax would do it (`automatic_tax` on the
  session, plus `tax_code` on the shipping rate), and it is a paid add-on, so it is a decision
  rather than an oversight.

## Previewing locally

The static page opens on its own, but the shop needs the `/api/*` functions, which only run
under Vercel — a plain file server 404s on `/api/products`. Deploy a preview instead; that is
what the deploy check is for.

```bash
npx vercel deploy --archive=tgz
```

```bash
node test/deploy-check.mjs https://the-preview-url.vercel.app
```

For the static pages alone:

```bash
python -m http.server 5599 --directory Website
```
