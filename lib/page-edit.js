'use strict';

/* Reading and writing the strings that live in the markup.
   lib/page-edit.js

   ── Why the HTML file is the store ────────────────────────────────────────

   Every editable string on /shop and /shop/:id sits in shop.html or
   product.html, marked with data-edit="<key>". There is no second copy of it
   anywhere — no defaults table, no database row — so there is nothing for the
   page to drift away from. What the file says IS what the site serves, and a
   save rewrites the file.

   ── Two marks, because a <meta> has no text ───────────────────────────────

     <h1 data-edit="shop.heading">The collection</h1>
     <meta name="description" content="…" data-edit="shop.metaDescription"
           data-edit-attr="content">

   The first replaces what is between the tags. The second replaces one
   attribute, and exists because a page title and a search-result description
   are copy too, and neither is anywhere you can point at on screen.

   ── The invariant that makes this safe ────────────────────────────────────

   A text mark may only go on an element whose content is PLAIN TEXT. No
   nested elements, not even an <em>. That is what lets this find the closing
   tag by looking for it rather than by parsing HTML, and it is checked rather
   than trusted: markers() refuses a mark whose content contains '<', and
   test/page-edit.test.js runs that check over both real files.

   Where the page needs markup around an editable string — a footer whose year
   is filled in by script, a crumb with an arrow — the mark goes on a <span>
   INSIDE it, wrapping only the words.
*/

/* ── Entities ──────────────────────────────────────────────────────────────
   Only the ones the two pages actually use, plus the four that HTML cannot do
   without. The editor shows a person real characters, so what comes out of
   the file has to be decoded; what goes back in is escaped again, and only
   the characters that MUST be. A curly quote written as itself is valid UTF-8
   and reads better in the source than &rsquo;. */
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', copy: '©', hellip: '…', mdash: '—', ndash: '–',
  larr: '←', rarr: '→', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', times: '×', middot: '·',
};

function decode(value) {
  return String(value).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return Object.hasOwn(NAMED, body) ? NAMED[body] : whole;
  });
}

/* '<' and '&' always; '>' because a bare one after an unrelated '<' elsewhere
   is the kind of thing that only breaks in one browser. Quotes are escaped
   for attribute values only — inside text they are just characters, and
   escaping them there produces &quot; all over a paragraph for no reason. */
const escapeText = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (v) => escapeText(v).replace(/"/g, '&quot;');

/* ── Finding the marks ─────────────────────────────────────────────────────

   Deliberately not a parser. The whole job is "find the element carrying this
   attribute and replace one span of characters inside it", the shapes it has
   to cope with are the ones in two files in this repo, and every assumption it
   makes is asserted rather than assumed. A parser would be more general and
   would also be a dependency, a build step, and a much larger thing to be
   confident about. */

const NAME = /^<([a-zA-Z][\w:-]*)/;

/**
 * The end of an open tag, respecting quoted attribute values.
 *
 * A naive indexOf('>') finds the '>' inside content="a > b", truncates the
 * tag there, and produces a file that looks fine until the one product whose
 * description has an angle bracket in it.
 *
 * @returns {number} index of the '>' , or -1
 */
function endOfOpenTag(html, from) {
  let quote = null;
  for (let i = from; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '>') return i;
  }
  return -1;
}

/** One attribute's value span within an open tag. */
function attrSpan(html, tagStart, tagEnd, attr) {
  const re = new RegExp(`\\s${attr}\\s*=\\s*(["'])`, 'i');
  const slice = html.slice(tagStart, tagEnd);
  const m = re.exec(slice);
  if (!m) return null;
  const open = tagStart + m.index + m[0].length;
  const close = html.indexOf(m[1], open);
  if (close < 0 || close > tagEnd) return null;
  return { start: open, end: close };
}

/**
 * Every data-edit mark in a document, in source order.
 *
 * @returns {Array<{key: string, kind: 'text'|'attr', attr?: string,
 *                  start: number, end: number, raw: string, value: string}>}
 *   `start`/`end` bound the span a save replaces; `value` is it, decoded.
 * @throws when a mark breaks the plain-text invariant, or names an attribute
 *   the tag does not carry. Both are mistakes in the markup, both are caught
 *   by the test over the real files, and neither should ever reach a request.
 */
function markers(html) {
  const out = [];
  const re = /\sdata-edit\s*=\s*"([^"]+)"/g;
  let m;

  while ((m = re.exec(html)) !== null) {
    const key = m[1];
    const tagStart = html.lastIndexOf('<', m.index);
    if (tagStart < 0) throw new Error(`data-edit="${key}" is not inside a tag`);

    const name = NAME.exec(html.slice(tagStart, tagStart + 40));
    if (!name) throw new Error(`data-edit="${key}" is not on an element`);

    const tagEnd = endOfOpenTag(html, tagStart);
    if (tagEnd < 0) throw new Error(`data-edit="${key}" sits in an unterminated tag`);

    const wants = attrSpan(html, tagStart, tagEnd, 'data-edit-attr');
    if (wants) {
      const attr = html.slice(wants.start, wants.end);
      const span = attrSpan(html, tagStart, tagEnd, attr);
      if (!span) throw new Error(`data-edit="${key}" names attribute "${attr}", which the tag does not have`);
      const raw = html.slice(span.start, span.end);
      out.push({ key, kind: 'attr', attr, start: span.start, end: span.end, raw, value: decode(raw) });
      continue;
    }

    const close = html.indexOf(`</${name[1]}`, tagEnd);
    if (close < 0) throw new Error(`data-edit="${key}" is on a <${name[1]}> that is never closed`);

    const raw = html.slice(tagEnd + 1, close);
    if (raw.includes('<')) {
      throw new Error(
        `data-edit="${key}" is on a <${name[1]}> containing markup. ` +
        'Put the mark on a span around the words instead.'
      );
    }
    out.push({ key, kind: 'text', start: tagEnd + 1, end: close, raw, value: decode(raw) });
  }

  return out;
}

/** Every marked string in a document, decoded, as {key: value}. */
function readValues(html) {
  const out = {};
  for (const mark of markers(html)) out[mark.key] = mark.value;
  return out;
}

/**
 * Put edited strings back.
 *
 * Applied from the END of the document backwards, so that replacing one span
 * cannot move the offsets of a span not yet written. Doing it forwards works
 * right up until two edits differ in length, which is always.
 *
 * A key that is absent from `values`, or whose value is unchanged, is left
 * exactly as it was — including its entities. Only what somebody actually
 * changed is rewritten, so a save produces a diff you can read.
 */
function writeValues(html, values) {
  const marks = markers(html).filter((mark) => {
    const next = values?.[mark.key];
    return typeof next === 'string' && next !== mark.value;
  });

  let out = html;
  for (const mark of marks.sort((a, b) => b.start - a.start)) {
    const encoded = mark.kind === 'attr' ? escapeAttr(values[mark.key]) : escapeText(values[mark.key]);
    out = out.slice(0, mark.start) + encoded + out.slice(mark.end);
  }
  return out;
}

/**
 * The same document with the editing layer turned on.
 *
 * `body` gains a class the styles hang off, and the chrome and script go in
 * before </body> so they run after everything the page ships. Nothing else in
 * the document is touched — this is the page, with an attribute added.
 */
function withEditLayer(html, { styles, chrome, script }) {
  return html
    .replace(/<body([^>]*)class="([^"]*)"/, '<body$1class="$2 is-editing"')
    .replace(/<body(?![^>]*class=)([^>]*)>/, '<body$1 class="is-editing">')
    .replace('</head>', `<style>${styles}</style>\n</head>`)
    .replace('</body>', `${chrome}\n<script>${script}</script>\n</body>`);
}

module.exports = {
  NAMED,
  decode,
  escapeText,
  escapeAttr,
  endOfOpenTag,
  markers,
  readValues,
  writeValues,
  withEditLayer,
};
