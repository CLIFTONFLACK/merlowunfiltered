# MERLOW — website

Single static page for MERLOW and the debut collaborative album **UNFILTERED** —
one song, fifteen collaborations, one shared voice.

No build step, no framework, no dependencies. Open `index.html` or upload the folder.
There is no site header or nav bar by design: the page opens straight into the hero
video and is navigated by scrolling.

```
index.html        the whole page
css/styles.css    design system + layout
js/main.js        tracklist, YouTube slots, nav, reveals
media/            web-optimised copies of the release assets
```

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
  featured:   '9Us7JsDWFEg',   // Story 03 — official lyric video (already set)
  'track-01': '',              // Caldwell — Indie UK
  ...
};
```

Any slot still empty shows a marked placeholder tile naming the video that belongs
there, so the page stays correctly laid out while you fill them in.

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
| `mark.png`, `favicon.png` | nav mark and tab icon | `M Logo.png` |

The hero video must stay **silent** — browsers refuse to autoplay a clip with an audio
track, and the page would fall back to the poster image.

## Still to wire up

- **Mailing list** — the footer form is a visual placeholder. It intercepts submit and
  says so on screen; nothing is sent anywhere. Point it at Mailchimp / Buttondown /
  ConvertKit when you have an account.
- **Social links**: the four icons in the footer are `href="#"`. Replace with the real
  Spotify / YouTube / Instagram / Apple Music URLs in `index.html`.
- **Shop links**: both product cards in the Shop section are `href="#"`, and the section
  says so on the page. Point the two `.shop__link` hrefs at the real store and delete the
  `.shop__pending` paragraph.

## Previewing locally

Opening `index.html` directly works. To serve it properly:

```bash
python -m http.server 5599 --directory Website
```

Then visit `http://localhost:5599`.
