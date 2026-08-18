# MERLOW — website

Single static page for MERLOW and the debut collaborative album **UNFILTERED** —
one song, fifteen collaborations, one shared voice.

No build step, no framework, no dependencies. Open `index.html` or upload the folder.
There is no site header or nav bar by design: the page opens straight into the hero
video and is navigated by scrolling.

```
index.html        the home page
shop.html         /shop — the full catalog
product.html      /shop/:id — one product (rewritten to, see vercel.json)
css/styles.css    design system + layout
js/main.js        home page: tracklist, YouTube slots, hero, story, shop preview
js/shop.js        /shop
js/product.js     the product page
js/cart.js        cart + checkout, shared by all three
js/reveal.js      scroll reveal, shared by all three
media/            web-optimised copies of the release assets
```

`cart.js` and `reveal.js` load before every page script. Both are shared on
purpose: the cart must render the same on all three pages, and `.reveal` sits at
opacity 0 until the observer reaches it, so a page that carries the class
without running the observer shows nothing at all.

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
  'track-01': '',              // Caldwell — Indie UK (not yet released)
  'track-02': '-XMXp3gifag',   // Marcus Whitefield — Indie UK
  ...
};
```

**Current state: 11 of the 15 are live.** Caldwell, Ashworth, Ben-D and Black Rosen
have not been published to the channel yet — those four are deliberately left empty.
Paste each ID in as it goes up; nothing else needs touching.

Any slot still empty renders a **"Not yet released"** tile naming the video that
belongs there and pointing at the channel, and its tracklist row is marked `Soon`.
So the page stays correctly laid out, and a visitor opening one of the four is told
what they are looking at rather than shown an internal note.

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
| `hero-loop.mp4` | hero background loop, audio stripped | `Assets/Songs/Un-Filtered_Video/M logo animation 2.mp4` |
| `hero-poster.jpg` | still shown before the video loads | frame from the same clip |
| `cover.jpg` | album cover | `UNFILTERED-cover art.png` |
| `merlow-wordmark.png` | the hero MERLOW mark — the cover's own wordmark, keyed to transparency, not type imitating it | `UNFILTERED-cover art.png` |
| `chips.png` | chipped-paint mask for the three slogan lines, built from the chips inside the cover wordmark's strokes | `UNFILTERED-cover art.png` |
| `chips-blue.png` | the same tile, alpha inverted and gamma-curved, painted deep navy — the worn-through undercoat on the H2/H3 headings | derived from `chips.png` |
| `story-01..02.mp4` + `.jpg` | the two story clips and their poster frames — silent loops, `preload="none"`, started only when the band scrolls into view | `Clips/clips_Seedance/clip_01, 03` |
| `merch-lion.jpg`, `merch-britain.jpg` | the two shop products | `T-Shirt Mockups/UnUnUn_Tshirt_Lion.png`, `..._Britain.png` |
| `plate.jpg` | faint texture behind the chorus | `Design Mockups/UnUnUn_good.png` |
| `favicon.png` (256), `favicon-180.png`, `favicon-32.png` | tab icon and apple-touch icon: the M mark, studio background keyed out to transparency, cropped to the mark, with a bone rim so the near-black half still reads on a dark browser tab | `M Logo.png` |

The hero video must stay **silent** — browsers refuse to autoplay a clip with an audio
track, and the page would fall back to the poster image.

## Still to wire up

- **Mailing list** — the footer form is a visual placeholder. It intercepts submit and
  says so on screen; nothing is sent anywhere. Point it at Mailchimp / Buttondown /
  ConvertKit when you have an account.
- **Social links**: the four icons in the footer are `href="#"`. Replace with the real
  Spotify / YouTube / Instagram / Apple Music URLs in `index.html`.

## Shop — Printful + Stripe

The Shop section is no longer static. `js/main.js` fetches the live catalog from
`/api/products` (a serverless function that proxies Printful, so the API token never
reaches the browser) and renders each synced product with a size/option picker and an
Add to cart button. The cart itself is `localStorage`. Checkout posts the cart to
`/api/create-checkout-session`, which re-prices everything against Printful server-side,
creates a Stripe Checkout Session, and returns its hosted URL — the browser is redirected
there directly, so there's no Stripe.js on this page. `/api/webhook` listens for
`checkout.session.completed` and creates the matching order in Printful.

```
lib/printful.js               shared Printful API client
api/products.js               GET  — catalog for the frontend
api/create-checkout-session.js POST — cart in, Stripe Checkout URL out
api/webhook.js                POST — Stripe -> Printful order creation
```

**Adding products.** Nothing here needs editing — add the product in Printful and it appears
on the site within about a minute (the catalog is cached for 60s per warm lambda, and the
response carries `s-maxage=60`). It gets a card on `/shop`, a preview slot on the home page if
it is one of the first three, and its own page at `/shop/:id`. Colours, sizes, prices and the
gallery all follow the variants you sync. `lib/printful.js` walks every page of
`/store/products`, so the catalog is not capped at Printful's default page of 20.

**Where the product page's copy comes from.** A Printful *sync* product carries only a name,
a thumbnail and its variants — no description, no colour names, no brand. Those live on the
*catalog* product it was made from, so `getProductDetail` follows `product_id` off the first
variant to `/products/:id` and merges the two. If that call fails the page still prices and
sells correctly; it just loses the blurb and the swatch colours.

```
api/product.js                GET ?id= — one product, enriched
```

**Required Vercel environment variables:**

| Variable | Where it comes from |
|---|---|
| `PRINTFUL_API_TOKEN` | Printful → Stores → your API-type store → Settings → API |
| `PRINTFUL_STORE_ID` | Only needed for an account-level token from developers.printful.com that can see more than one store |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Created after deploy — see below |

**Wiring up the Stripe webhook** (needs a live URL, so do this after the first deploy):

1. Stripe dashboard → Developers → Webhooks → Add endpoint.
2. Endpoint URL: `https://merlowunfiltered.vercel.app/api/webhook`.
3. Event to send: `checkout.session.completed`.
4. Copy the signing secret it gives you into the `STRIPE_WEBHOOK_SECRET` env var in Vercel,
   then redeploy.

**Orders start as drafts.** `api/webhook.js` has `AUTO_CONFIRM_ORDERS = false` at the top —
paid orders land in Printful unconfirmed, so nothing gets produced or charged to your
Printful account automatically. Confirm them by hand in the Printful dashboard until
you've watched a few go through end to end, then flip that flag to `true` to auto-confirm
on payment.

## Previewing locally

The static page opens fine on its own (`index.html` directly, or the Python server
below), but the Shop section needs the `/api/*` serverless functions, which only run
under Vercel — plain `http.server` will 404 on `/api/products`. Use `vercel dev` from
this folder to preview the full site including checkout, or deploy to a Vercel preview
branch.

```bash
python -m http.server 5599 --directory Website
```

Then visit `http://localhost:5599`.
