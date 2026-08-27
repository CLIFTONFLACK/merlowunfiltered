'use strict';

/* The content editor: the schema, the markup marks, the file rewriting, and
   the session cookie.
 *
 * Every case here is one that can go red. The ones worth naming:
 *
 *   - "the real files hold every string the schema names" fails the moment a
 *     data-edit mark is deleted from shop.html or a key is added to the schema
 *     and nowhere else. That is the failure mode this design actually has.
 *   - the tamper and expiry cases mint a real token and then break it.
 *   - the rewrite cases assert on the WHOLE file, so an edit that also moved
 *     something else cannot pass.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const copy = require('../lib/copy.js');
const pageEdit = require('../lib/page-edit.js');
const auth = require('../lib/admin-auth.js');
const editMode = require('../lib/edit-mode.js');
const { loadDocument, applyChanges, commitMessage } = require('../lib/content.js');

/* ── The schema against the real files ───────────────────────────────────── */

test('every string the schema names is in one of the real files', () => {
  const doc = loadDocument();
  assert.deepEqual(doc.broken, [], 'a file could not be read in the shape it has to be in');
  assert.deepEqual(doc.missing, [], 'a data-edit mark is missing from the markup');
  assert.equal(Object.keys(doc.values).length, copy.SCHEMA.length);
});

test('every marked element in the real pages holds plain text only', () => {
  // markers() throws on a mark wrapping markup, which is the invariant that
  // lets the rewriter find a closing tag without parsing HTML.
  const siteFiles = require('../lib/site-files.js');
  for (const file of ['shop.html', 'product.html']) {
    assert.doesNotThrow(() => pageEdit.markers(siteFiles.read(file)), file);
  }
});

test('js/copy.js holds exactly the keys the schema puts there', () => {
  const siteFiles = require('../lib/site-files.js');
  const parsed = copy.readClientCopy(siteFiles.read('js/copy.js'));
  assert.ok(parsed, 'js/copy.js is not in the shape the server can read');
  assert.deepEqual(Object.keys(parsed).sort(), copy.jsKeys().sort());
});

test('every file the schema names is one site-files.js knows how to find', () => {
  const siteFiles = require('../lib/site-files.js');
  for (const file of copy.FILES) {
    assert.ok(
      Object.hasOwn(siteFiles.LITERAL, file),
      `${file} is in the schema but not in site-files.js's literal table`
    );
    assert.ok(require('node:fs').existsSync(siteFiles.LITERAL[file]()), `${file} is not where the table says`);
  }
});

test('vercel.json bundles every file the schema names, exactly', () => {
  /* THE one that matters, and the one that was missing.
   *
   * index.html was added to the schema and to the literal table above, and
   * neither of those puts a file in the deployed bundle -- only includeFiles
   * does. So it worked perfectly on a laptop and /admin said "index.html could
   * not be read" in production, which is a whole deploy cycle to find out.
   *
   * The literal table was written on the belief that Vercel's tracer would
   * follow `path.join(__dirname, '..', 'a-string')` inside those arrow
   * functions and include the files anyway. It does not, and a comment
   * asserting that it does is not a test. This is the test: it reads the real
   * vercel.json and demands the two lists match exactly -- so a file added to
   * one and not the other fails here rather than in production.
   */
  const fs = require('node:fs');
  const path = require('node:path');
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));

  const pattern = config.functions?.['api/admin/*.js']?.includeFiles;
  assert.ok(pattern, 'the admin functions have no includeFiles entry at all');

  const braces = /^\{([^{}]+)\}$/.exec(pattern);
  assert.ok(braces, `includeFiles is "${pattern}", which this test cannot read as a plain brace list`);

  assert.deepEqual(
    braces[1].split(',').map((s) => s.trim()).sort(),
    [...copy.FILES].sort(),
    'vercel.json and the schema disagree about which files the editor needs'
  );
});

test('no key is claimed by two files', () => {
  const seen = new Set();
  for (const entry of copy.SCHEMA) {
    assert.ok(!seen.has(entry.key), `${entry.key} appears twice in the schema`);
    seen.add(entry.key);
  }
});

/* ── Sanitising ──────────────────────────────────────────────────────────── */

test('the icon sprite is byte-identical in all three pages', () => {
  /* There is no build step to share a partial between static pages, so the
     sprite is duplicated on purpose. Duplication is fine; DRIFT is not, and
     one page quietly ending up with an older Instagram glyph than the other
     two is the failure this exists to make impossible to ship. */
  const siteFiles = require('../lib/site-files.js');
  const sprites = ['index.html', 'shop.html', 'product.html'].map((file) => {
    const found = /<svg class="sprite"[\s\S]*?<\/svg>/.exec(siteFiles.read(file));
    assert.ok(found, `${file} has no sprite`);
    return found[0];
  });
  assert.equal(sprites[1], sprites[0], 'shop.html has drifted from index.html');
  assert.equal(sprites[2], sprites[0], 'product.html has drifted from index.html');
  assert.equal((sprites[0].match(/<symbol /g) || []).length, 4);
});

test('every <use> in every page points at a symbol that page defines', () => {
  // A <use> whose target is missing renders nothing at all — the same as a
  // button with no icon, and just as silent.
  const siteFiles = require('../lib/site-files.js');
  for (const file of ['index.html', 'shop.html', 'product.html']) {
    const html = siteFiles.read(file);
    const defined = new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
    const used = [...html.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1]);
    assert.ok(used.length > 0, `${file} references no icons at all`);
    for (const id of used) assert.ok(defined.has(id), `${file}: <use href="#${id}"> has no symbol`);
  }
});

test('a key on more than one element points everywhere at the same thing', () => {
  /* social.* is deliberately on two elements each — the hero button and the
     footer button — so that one edit moves both. readValues takes the last one
     it sees, so if the two ever disagreed the editor would silently show one
     and the page would show the other. */
  const siteFiles = require('../lib/site-files.js');
  const across = new Map();                        // key -> "value (first file it was seen in)"

  for (const file of ['index.html', 'shop.html', 'product.html']) {
    for (const mark of pageEdit.markers(siteFiles.read(file))) {
      if (across.has(mark.key)) {
        const [value, seenIn] = across.get(mark.key);
        assert.equal(mark.value, value, `${mark.key} differs between ${seenIn} and ${file}`);
      } else {
        across.set(mark.key, [mark.value, file]);
      }
    }
  }

  // And the four destinations really are in all three files, or the check above
  // passed by never comparing anything.
  const social = ['social.spotify', 'social.youtube', 'social.instagram', 'social.tiktok'];
  for (const key of social) {
    const entry = copy.BY_KEY.get(key);
    assert.deepEqual(copy.filesOf(entry).sort(), ['index.html', 'product.html', 'shop.html']);
    const count = ['index.html', 'shop.html', 'product.html']
      .map((f) => (siteFiles.read(f).match(new RegExp(`data-edit="${key}"`, 'g')) || []).length)
      .reduce((a, b) => a + b, 0);
    assert.equal(count, 4, `${key} is marked ${count} times, expected 4`);
  }
});

test('a URL must be http or https, however it is spelled', () => {
  for (const hostile of [
    'javascript:alert(1)',
    '  javascript:alert(1)',
    'JavaScript:alert(1)',
    'java\nscript:alert(1)',
    'jav\tascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'mailto:someone@example.com',
    '/relative/path',
    'open.spotify.com/merlow',
    '',
  ]) {
    assert.equal(copy.url(hostile), null, `${JSON.stringify(hostile)} was accepted as a link`);
    assert.equal(copy.sanitise('social.spotify', hostile), null, `${JSON.stringify(hostile)} got through the schema`);
  }

  assert.equal(copy.url('https://open.spotify.com/x'), 'https://open.spotify.com/x');
  assert.equal(copy.url('http://example.com/a'), 'http://example.com/a');
  assert.equal(copy.url('  https://example.com/a  '), 'https://example.com/a');
});

test('a URL is PARSED, not pattern-matched on how it starts', () => {
  /* These are the cases that separate the two. Every one of them starts with a
     scheme we allow, so a `/^https?:/` test waves them through — and every one
     of them is not a URL, so it lands in the page as an href that goes nowhere.
     Only handing the string to the parser catches them. */
  for (const broken of ['https://', 'http://', 'https:///', 'http://[', 'https://%%', 'http:// example.com']) {
    assert.equal(copy.url(broken), null, `${JSON.stringify(broken)} was accepted as a link`);
  }
});

test('a URL the sanitiser rewrites is not mistaken for an edit', () => {
  // new URL().href normalises. Comparing a sanitised submission against the raw
  // text of the file would report every link as changed on the first save.
  const site = fakeSite();
  site.files['index.html'] = '<a href="https://example.com" data-edit="social.spotify" data-edit-attr="href">x</a>';
  const doc = loadDocument(site.read);
  assert.equal(doc.values['social.spotify'], 'https://example.com');

  // The same string back again, which the parser turns into ".../".
  assert.deepEqual(applyChanges(doc, { 'social.spotify': 'https://example.com' }).files, [],
    'an untouched link was written back as a change');
});

test('a value that survives nothing is null, and null means "leave it alone"', () => {
  assert.equal(copy.sanitise('shop.heading', '   '), null);
  assert.equal(copy.sanitise('shop.heading', '​​'), null);
  assert.equal(copy.sanitise('shop.heading', 42), null);
});

test('unknown keys are refused outright', () => {
  assert.equal(copy.sanitise('shop.somethingElse', 'x'), null);
  assert.deepEqual(copy.sanitiseAll({ 'shop.somethingElse': 'x' }), {});
});

test('control characters, zero-widths and the browser nbsp are removed', () => {
  assert.equal(copy.sanitise('shop.heading', 'a b'), 'ab');
  assert.equal(copy.sanitise('shop.heading', 'a​b'), 'ab');
  assert.equal(copy.sanitise('shop.heading', 'a b'), 'a b');
  assert.equal(copy.sanitise('shop.heading', 'a \n b'), 'a b');
});

test('a value is capped at the length its schema entry gives it', () => {
  const max = copy.BY_KEY.get('shop.navShop').max;
  assert.equal(copy.sanitise('shop.navShop', 'x'.repeat(max + 50)).length, max);
});

/* ── js/copy.js, read and written ────────────────────────────────────────── */

test('the generated file round-trips, and carries nothing it was not given', () => {
  const source = copy.renderClientCopy({ 'shop.empty': 'a', 'shop.error': 'b', 'not.a.key': 'c' });
  assert.deepEqual(copy.readClientCopy(source), { 'shop.empty': 'a', 'shop.error': 'b' });
});

test('a file in any other shape reads as null rather than as a guess', () => {
  assert.equal(copy.readClientCopy('window.SOMETHING = {}'), null);
  assert.equal(copy.readClientCopy('window.MERLOW_COPY = [1,2];'), null);
  assert.equal(copy.readClientCopy('window.MERLOW_COPY = {oops'), null);
  assert.equal(copy.readClientCopy(''), null);
});

/* ── The markup marks ────────────────────────────────────────────────────── */

const PAGE = [
  '<html><head>',
  '<title data-edit="t">Shop &mdash; MERLOW</title>',
  '<meta name="description" content="a &gt; b" data-edit="d" data-edit-attr="content">',
  '</head><body class="page">',
  '<h1 data-edit="h">The collection</h1>',
  '<p data-edit="l">It&rsquo;s here&hellip;</p>',
  '</body></html>',
].join('');

test('marked strings come back decoded', () => {
  assert.deepEqual(pageEdit.readValues(PAGE), {
    t: 'Shop — MERLOW',
    d: 'a > b',
    h: 'The collection',
    l: 'It’s here…',
  });
});

test('a mark on an element containing markup is refused', () => {
  assert.throws(() => pageEdit.markers('<p data-edit="x">a <b>b</b></p>'), /containing markup/);
});

test('a mark naming an attribute the tag does not carry is refused', () => {
  assert.throws(
    () => pageEdit.markers('<meta content="a" data-edit="x" data-edit-attr="nope">'),
    /does not have/
  );
});

test('an attribute value containing > does not truncate the tag', () => {
  const html = '<meta content="a > b" data-edit="d" data-edit-attr="content"><p data-edit="h">hi</p>';
  assert.deepEqual(pageEdit.readValues(html), { d: 'a > b', h: 'hi' });
});

test('only what changed is rewritten, and the rest keeps its entities', () => {
  const out = pageEdit.writeValues(PAGE, {
    h: 'A new heading',
    l: 'It’s here…',                       // identical once decoded — not a change
  });
  assert.ok(out.includes('<h1 data-edit="h">A new heading</h1>'));
  assert.ok(out.includes('It&rsquo;s here&hellip;'), 'an unchanged string was rewritten anyway');
});

test('several edits of different lengths all land in the right places', () => {
  const out = pageEdit.writeValues(PAGE, {
    t: 'A very much longer title than the one that was there',
    d: 'short',
    h: 'x',
    l: 'and a replacement lede of quite a different length again',
  });
  assert.deepEqual(pageEdit.readValues(out), {
    t: 'A very much longer title than the one that was there',
    d: 'short',
    h: 'x',
    l: 'and a replacement lede of quite a different length again',
  });
});

test('markup in a value is escaped on the way into the file', () => {
  const out = pageEdit.writeValues(PAGE, { h: '<script>alert(1)</script>', d: 'a "b" & c' });
  assert.ok(!out.includes('<script>'), 'a tag was written into the page');
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(out.includes('content="a &quot;b&quot; &amp; c"'));
  // …and it survives the round trip as the text it was.
  assert.equal(pageEdit.readValues(out).h, '<script>alert(1)</script>');
});

test('the edit layer marks the body and leaves the rest of the document alone', () => {
  const out = pageEdit.withEditLayer(PAGE, { styles: 'S', chrome: 'C', script: 'J' });
  assert.ok(out.includes('<body class="page is-editing">'));
  assert.ok(out.includes('<style>S</style>'));
  assert.ok(out.includes('C\n<script>J</script>'));
  assert.ok(out.includes('<h1 data-edit="h">The collection</h1>'), 'the page itself was altered');
});

test('relative assets still resolve when the page is served from /admin/edit', () => {
  /* The home page asks for its stylesheet as "css/styles.css". Served from
     /admin/edit that resolves to /admin/css/styles.css and 404s, and the
     result is a page with every string present, editable, and completely
     unstyled — which is how it got shipped. The <base> is what stops it, and
     it has to come BEFORE the first thing that depends on it. */
  const relative = '<html><head>\n<link rel="stylesheet" href="css/styles.css">\n</head><body><h1 data-edit="h">x</h1></body></html>';
  const out = pageEdit.withEditLayer(relative, { styles: '', chrome: '', script: '' });

  assert.ok(out.includes('<base href="/">'), 'no <base>, so every relative asset would 404');
  assert.ok(
    out.indexOf('<base href="/">') < out.indexOf('href="css/styles.css"'),
    'the <base> comes after the stylesheet it is supposed to govern, which does nothing'
  );
});

test('the real pages are all covered by that, whichever style of path they use', () => {
  const siteFiles = require('../lib/site-files.js');
  for (const file of ['index.html', 'shop.html', 'product.html']) {
    const out = pageEdit.withEditLayer(siteFiles.read(file), { styles: '', chrome: '', script: '' });
    const base = out.indexOf('<base href="/">');
    assert.ok(base > 0, `${file} got no <base>`);

    // Every asset the document asks for, relative or not, must resolve to the
    // same place it does when the page is served from where it lives.
    for (const [, url] of out.matchAll(/(?:src|href)="([^"#][^"]*)"/g)) {
      if (/^(https?:|data:|mailto:|\/)/.test(url)) continue;
      assert.ok(
        out.indexOf(`"${url}"`) > base,
        `${file}: "${url}" is relative and appears before the <base>`
      );
    }
  }
});

test('a value cannot break out of the script block it is embedded in', () => {
  const out = editMode.jsonScript({ 'shop.heading': '</script><script>alert(1)</script>' });
  assert.ok(!out.includes('</script>'));
  assert.deepEqual(JSON.parse(out), { 'shop.heading': '</script><script>alert(1)</script>' });
});

/* ── Applying a save ─────────────────────────────────────────────────────── */

/** A whole site, small enough to assert on in full. */
function fakeSite() {
  const files = {
    // The same destination on two elements, as the real page has it.
    'index.html':
      '<a href="https://spotify.example/merlow" data-edit="social.spotify" data-edit-attr="href">hero</a>' +
      '<h2 data-edit="home.footTitle">MERLOW</h2>' +
      '<a href="https://spotify.example/merlow" data-edit="social.spotify" data-edit-attr="href">footer</a>',
    'shop.html': '<h1 data-edit="shop.heading">The collection</h1><p data-edit="shop.lede">A lede.</p>',
    'product.html': '<p><span data-edit="product.crumb">All merchandise</span></p>',
    'js/copy.js': copy.renderClientCopy(
      Object.fromEntries(copy.jsKeys().map((key) => [key, `default ${key}`]))
    ),
  };
  // Throws on a file it does not have, the way the real reader does, so that a
  // missing file shows up as broken rather than as silently empty.
  const read = (name) => {
    if (!(name in files)) throw new Error(`no such file: ${name}`);
    return files[name];
  };
  return { files, read };
}

test('one edit moves every place the destination appears', () => {
  const site = fakeSite();
  const doc = loadDocument(site.read);
  const { files } = applyChanges(doc, { 'social.spotify': 'https://open.spotify.com/artist/merlow' });

  assert.deepEqual(files.map((f) => f.path), ['index.html']);
  const written = [...files[0].content.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(written, [
    'https://open.spotify.com/artist/merlow',
    'https://open.spotify.com/artist/merlow',
  ], 'the hero button and the footer button disagree after one edit');
});

test('a rejected link leaves both places exactly as they were', () => {
  const site = fakeSite();
  const doc = loadDocument(site.read);
  assert.deepEqual(applyChanges(doc, { 'social.spotify': 'javascript:alert(1)' }).files, []);
});

test('a change to one page rewrites that page and nothing else', () => {
  const site = fakeSite();
  const doc = loadDocument(site.read);
  const { files, applied } = applyChanges(doc, { 'shop.heading': 'The collection, renamed' });

  assert.deepEqual(Object.keys(applied), ['shop.heading']);
  assert.deepEqual(files.map((f) => f.path), ['shop.html']);
  assert.equal(
    files[0].content,
    '<h1 data-edit="shop.heading">The collection, renamed</h1><p data-edit="shop.lede">A lede.</p>'
  );
});

test('a change to a script string rewrites js/copy.js, keeping every other key', () => {
  const site = fakeSite();
  const doc = loadDocument(site.read);
  const { files } = applyChanges(doc, { 'product.add': 'Buy it' });

  assert.deepEqual(files.map((f) => f.path), ['js/copy.js']);
  const parsed = copy.readClientCopy(files[0].content);
  assert.equal(parsed['product.add'], 'Buy it');
  assert.deepEqual(Object.keys(parsed).sort(), copy.jsKeys().sort());
});

test('a save spanning both surfaces produces both files at once', () => {
  const site = fakeSite();
  const doc = loadDocument(site.read);
  const { files } = applyChanges(doc, { 'shop.heading': 'New', 'product.add': 'Buy it' });
  assert.deepEqual(files.map((f) => f.path).sort(), ['js/copy.js', 'shop.html']);
});

test('a change that changes nothing produces no commit', () => {
  const site = fakeSite();
  const doc = loadDocument(site.read);
  assert.deepEqual(applyChanges(doc, { 'shop.heading': 'The collection' }).files, []);
  assert.deepEqual(applyChanges(doc, { 'shop.heading': '   ' }).files, [], 'an emptied field wrote a file');
  assert.deepEqual(applyChanges(doc, { 'not.a.key': 'x' }).files, []);
});

test('a broken js/copy.js is reported rather than silently emptied', () => {
  const site = fakeSite();
  site.files['js/copy.js'] = 'window.MERLOW_COPY = not json;';
  const doc = loadDocument(site.read);
  assert.deepEqual(doc.broken, ['js/copy.js']);
});

test('the commit message names the count and lists the keys', () => {
  const message = commitMessage({ 'shop.heading': 'a', 'shop.lede': 'b' });
  assert.match(message, /^Reword 2 strings on the shop\n/);
  assert.ok(message.includes('- shop.heading'));
  assert.ok(message.includes('- shop.lede'));
});

test('the commit message says what kind of thing moved', () => {
  // "Reword 1 string on the social page" was wrong three ways: a destination is
  // not wording, there is no social page, and the one thing a copy commit gets
  // read for later is what moved.
  assert.match(commitMessage({ 'social.instagram': 'x' }), /^Repoint 1 social link\n/);
  assert.match(commitMessage({ 'social.instagram': 'x', 'social.tiktok': 'y' }), /^Repoint 2 social links\n/);
  assert.match(commitMessage({ 'home.heroCta': 'x' }), /^Reword 1 string on the home page\n/);
  assert.match(
    commitMessage({ 'home.heroCta': 'x', 'social.tiktok': 'y' }),
    /^Reword 1 string on the home page, and repoint 1 link\n/
  );
  assert.match(
    commitMessage({ 'home.heroCta': 'x', 'shop.heading': 'y' }),
    /^Reword 2 strings on the home page and the shop\n/
  );
});

/* ── The commit ──────────────────────────────────────────────────────────── */

const github = require('../lib/github.js');

/** Stand in for GitHub, recording what was asked of it. */
function fakeGitHub(replies) {
  const calls = [];
  const real = global.fetch;
  global.fetch = async (url, options = {}) => {
    const path = String(url).replace('https://api.github.com', '');
    calls.push({
      path,
      method: options.method ?? 'GET',
      body: options.body ? JSON.parse(options.body) : null,
      auth: options.headers?.authorization,
    });
    const reply = replies(path, options);
    return {
      ok: reply.status < 400,
      status: reply.status,
      json: async () => reply.body,
    };
  };
  return { calls, restore: () => { global.fetch = real; } };
}

const ENV_GH = { GITHUB_TOKEN: 'ghp_test', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40) };

test('a commit is blobs, then one tree, then one commit, then one move of the branch', async (t) => {
  const gh = fakeGitHub((path, options) => {
    if (path.endsWith('/git/ref/heads/main')) return { status: 200, body: { object: { sha: 'a'.repeat(40) } } };
    if (path.includes('/git/commits/')) return { status: 200, body: { tree: { sha: 'tree-base' } } };
    if (path.endsWith('/git/blobs')) return { status: 201, body: { sha: `blob-${JSON.parse(options.body).content.length}` } };
    if (path.endsWith('/git/trees')) return { status: 201, body: { sha: 'tree-new' } };
    if (path.endsWith('/git/commits')) return { status: 201, body: { sha: 'c'.repeat(40) } };
    if (path.endsWith('/git/refs/heads/main')) return { status: 200, body: {} };
    throw new Error(`unexpected call to ${path}`);
  });
  t.after(gh.restore);

  const out = await github.commitFiles(
    [{ path: 'shop.html', content: '<p>one</p>' }, { path: 'js/copy.js', content: 'two' }],
    'A message',
    ENV_GH
  );

  assert.equal(out.sha, 'c'.repeat(40));
  assert.match(out.url, /^https:\/\/github\.com\/CLIFTONFLACK\/merlowunfiltered\/commit\//);

  const steps = gh.calls.map((c) => `${c.method} ${c.path.split('/git/')[1] ?? c.path}`);
  assert.deepEqual(steps, [
    'GET ref/heads/main',
    `GET commits/${'a'.repeat(40)}`,
    'POST blobs',
    'POST blobs',
    'POST trees',
    'POST commits',
    'PATCH refs/heads/main',
  ]);

  const tree = gh.calls.find((c) => c.path.endsWith('/git/trees')).body;
  assert.equal(tree.base_tree, 'tree-base', 'without base_tree the commit deletes the rest of the repo');
  assert.deepEqual(tree.tree.map((e) => e.path), ['shop.html', 'js/copy.js']);

  const commit = gh.calls.find((c) => c.method === 'POST' && c.path.endsWith('/git/commits')).body;
  assert.deepEqual(commit.parents, ['a'.repeat(40)]);
  assert.equal(commit.message, 'A message');

  const move = gh.calls.at(-1);
  assert.equal(move.body.force, false, 'forcing here would silently drop a concurrent change');
  assert.equal(move.auth, 'Bearer ghp_test');
});

test('file contents are sent as base64 and survive it', async (t) => {
  const gh = fakeGitHub((path) => {
    if (path.endsWith('/git/ref/heads/main')) return { status: 200, body: { object: { sha: 'a'.repeat(40) } } };
    if (path.includes('/git/commits/')) return { status: 200, body: { tree: { sha: 't' } } };
    if (path.endsWith('/git/blobs')) return { status: 201, body: { sha: 'b' } };
    if (path.endsWith('/git/trees')) return { status: 201, body: { sha: 't2' } };
    if (path.endsWith('/git/commits')) return { status: 201, body: { sha: 'c' } };
    return { status: 200, body: {} };
  });
  t.after(gh.restore);

  await github.commitFiles([{ path: 'shop.html', content: 'It’s here — “quoted”' }], 'm', ENV_GH);
  const blob = gh.calls.find((c) => c.path.endsWith('/git/blobs')).body;
  assert.equal(blob.encoding, 'base64');
  assert.equal(Buffer.from(blob.content, 'base64').toString('utf8'), 'It’s here — “quoted”');
});

test('a deployment behind the branch is reported as stale', async (t) => {
  const gh = fakeGitHub(() => ({ status: 200, body: { object: { sha: 'b'.repeat(40) } } }));
  t.after(gh.restore);

  const behind = await github.freshness(ENV_GH);
  assert.equal(behind.stale, true, 'committing over a newer branch would undo it');

  const level = await github.freshness({ ...ENV_GH, VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40) });
  assert.equal(level.stale, false);

  // Locally there is no deployment to be behind, so nothing is stale.
  const local = await github.freshness({ GITHUB_TOKEN: 'x' });
  assert.equal(local.stale, false);
});

test('GitHub is quoted verbatim when it refuses', async (t) => {
  const gh = fakeGitHub(() => ({ status: 403, body: { message: 'Resource not accessible by personal access token' } }));
  t.after(gh.restore);

  await assert.rejects(
    () => github.headSha(ENV_GH),
    /GitHub 403: Resource not accessible by personal access token/
  );
});

test('a token that can only READ is caught before anything is typed', async (t) => {
  // The trap this exists for: merlowunfiltered is PUBLIC, so every read below
  // succeeds for a token belonging to an entirely different account. Only
  // permissions.push distinguishes one that can actually save.
  const readOnly = fakeGitHub((path) => {
    if (path === '/user') return { status: 200, body: { login: 'dominicmerlow' } };
    if (path === '/repos/CLIFTONFLACK/merlowunfiltered') {
      return { status: 200, body: { permissions: { admin: false, push: false, pull: true } } };
    }
    return { status: 200, body: { object: { sha: 'a'.repeat(40) } } };
  });
  t.after(readOnly.restore);

  const verdict = await github.writeAccess(ENV_GH);
  assert.equal(verdict.canWrite, false);
  assert.equal(verdict.login, 'dominicmerlow', 'the name is what tells you which account minted it');

  // …and reading the ref works perfectly well with that same token, which is
  // precisely why permissions.push has to be asked separately.
  assert.equal(await github.headSha(ENV_GH), 'a'.repeat(40));
});

test('a token that can write says so', async (t) => {
  const ok = fakeGitHub((path) => {
    if (path === '/user') return { status: 200, body: { login: 'CLIFTONFLACK' } };
    return { status: 200, body: { permissions: { push: true } } };
  });
  t.after(ok.restore);

  assert.deepEqual(await github.writeAccess(ENV_GH), {
    login: 'CLIFTONFLACK',
    canWrite: true,
    error: null,
  });
});

test('writeAccess never throws, whatever GitHub does', async (t) => {
  const broken = fakeGitHub(() => ({ status: 401, body: { message: 'Bad credentials' } }));
  t.after(broken.restore);

  const verdict = await github.writeAccess(ENV_GH);
  assert.equal(verdict.canWrite, false);
  assert.match(verdict.error, /Bad credentials/);

  assert.deepEqual(await github.writeAccess({}), {
    login: null, canWrite: false, error: 'No token is set.',
  });
});

test('no token means not configured, and no token is not an empty string either', () => {
  assert.equal(github.configured({}), false);
  assert.equal(github.configured({ GITHUB_TOKEN: '   ' }), false);
  assert.equal(github.configured({ GITHUB_TOKEN: 'x' }), true);
});

/* ── The session ─────────────────────────────────────────────────────────── */

const ENV = { MERLOW_ADMIN_PASSWORD: 'a long enough password', MERLOW_SESSION_SECRET: 's'.repeat(48) };

test('no password or no secret means nobody can sign in', () => {
  assert.equal(auth.unconfigured({}), true);
  assert.equal(auth.unconfigured({ MERLOW_ADMIN_PASSWORD: 'x' }), true);
  assert.equal(auth.unconfigured({ MERLOW_SESSION_SECRET: 'x' }), true);
  assert.equal(auth.unconfigured(ENV), false);
  assert.equal(auth.valid(auth.issue(ENV), {}), false, 'a token verified against no secret at all');
});

test('the right password passes and a near miss does not', () => {
  assert.equal(auth.checkPassword('a long enough password', ENV), true);
  assert.equal(auth.checkPassword('a long enough passwore', ENV), false);
  assert.equal(auth.checkPassword('', ENV), false);
  assert.equal(auth.checkPassword(undefined, ENV), false);
});

test('a token we issued verifies; a token with one character moved does not', () => {
  const token = auth.issue(ENV);
  assert.equal(auth.valid(token, ENV), true);

  const last = token.slice(-1);
  assert.equal(auth.valid(token.slice(0, -1) + (last === 'A' ? 'B' : 'A'), ENV), false);
  assert.equal(auth.valid(token.replace('.', '.x'), ENV), false);
  assert.equal(auth.valid(token, { ...ENV, MERLOW_SESSION_SECRET: 'z'.repeat(48) }), false);
});

test('a payload that was never signed is refused, however plausible', () => {
  const forged = Buffer.from(JSON.stringify({ exp: 2 ** 40 })).toString('base64url');
  assert.equal(auth.valid(`${forged}.anything`, ENV), false);
  assert.equal(auth.valid(forged, ENV), false);
});

test('a token expires', () => {
  const token = auth.issue(ENV, 0);
  assert.equal(auth.valid(token, ENV, 1000), true);
  assert.equal(auth.valid(token, ENV, (auth.SESSION_SECONDS + 1) * 1000), false);
});

test('the cookie is read back off a request, and the flags are set', () => {
  const header = auth.setCookie(ENV);
  const token = header.slice(`${auth.COOKIE}=`.length, header.indexOf(';'));
  assert.equal(auth.valid(token, ENV), true);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) {
    assert.ok(header.includes(flag), `the cookie is missing ${flag}`);
  }
  assert.equal(auth.signedIn({ headers: { cookie: `other=1; ${auth.COOKIE}=${token}` } }, ENV), true);
  assert.equal(auth.signedIn({ headers: { cookie: 'other=1' } }, ENV), false);
  assert.equal(auth.signedIn({ headers: {} }, ENV), false);
});

test('the gate distinguishes "not set up" from "not signed in"', () => {
  assert.equal(auth.adminGate({ headers: {} }, {}).reason, 'unconfigured');
  assert.equal(auth.adminGate({ headers: {} }, ENV).reason, 'anonymous');
  const header = auth.setCookie(ENV);
  const token = header.slice(`${auth.COOKIE}=`.length, header.indexOf(';'));
  assert.equal(auth.adminGate({ headers: { cookie: `${auth.COOKIE}=${token}` } }, ENV).ok, true);
});
