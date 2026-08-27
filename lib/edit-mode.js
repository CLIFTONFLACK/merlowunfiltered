'use strict';

/* The editing layer.
   lib/edit-mode.js

   ── Why there is no second page ───────────────────────────────────────────

   /admin/edit IS /shop. The same file, the same stylesheet, the same scripts,
   the same products fetched from the same API — served with a class on <body>
   and two extra tags before </body>.

   The usual shape for this is a form whose fields correspond to bits of a
   page, and it is worse in the way that matters: the two drift. A section
   gains a line, a heading moves, and the form still shows the old
   arrangement — so what you edit stops resembling what you get, and "how will
   this look?" needs a deploy to answer. Editing the page itself cannot drift
   from the page, because it IS the page.

   What it costs is dealt with below: editable text inside links and buttons
   that must not activate, a save bar that must not cover the footer, and copy
   that a script re-renders underneath you. What it buys is that a change is
   visible the instant it is typed, at the real width, in the real typeface,
   next to the real products.

   ── The strings you cannot point at ───────────────────────────────────────

   A page title, a search-result description, the message shown when the shop
   fails to load. All copy, none of it on screen when things are going well.
   They get a panel, listed by what they are for. It is the one part of this
   that IS a form, and only because there is nothing on the page to click.
*/

/**
 * JSON safe to sit inside a <script>.
 *
 * '<' becomes <, which is the same string to JSON.parse and cannot start
 * a </script> that ends the block early. A copy string containing markup is
 * not expected, and this is why it would not matter if one did.
 */
const jsonScript = (value) => JSON.stringify(value).replace(/</g, '\\u003C');

const esc = (v) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── Styles ────────────────────────────────────────────────────────────────

   Everything is scoped to .is-editing, which only /admin/edit sets, and the
   whole block is only served by /admin/edit — so none of it can reach a
   visitor even by accident. */

const editStyles = () => `
/* The affordance is a dotted outline on hover, solid on focus, drawn OUTSIDE
   the box. An inline border would reflow the text by a pixel the moment you
   hovered it, and the promise of this page is that what you see is the page. */
.is-editing [data-edit] {
  outline: 1px dashed transparent;
  outline-offset: 3px;
  transition: outline-color 0.18s var(--ease), background-color 0.18s var(--ease);
}
.is-editing [data-edit]:hover { outline-color: var(--ash); }
.is-editing [data-edit]:focus {
  outline: 2px solid var(--red-hot);
  background: rgba(227, 58, 46, 0.10);
}
/* An emptied field is a zero-width target you cannot click back into, and the
   server reads empty as "leave it alone" — so it says so rather than vanishing. */
.is-editing [data-edit]:empty::before {
  content: 'Empty — this will be left as it was';
  color: var(--ash);
  font-style: italic;
  font-size: 0.8em;
}

/* Nothing navigates or adds to the cart while editing. Cursor and script agree
   on this; without both, clicking into a button to fix its wording buys a
   t-shirt. */
.is-editing a, .is-editing button { cursor: default; }
.is-editing [data-edit] { cursor: text; }

/* ── The bar ─────────────────────────────────────────────────────────────
   Fixed to the bottom, with matching padding on the page so it can never
   cover the footer — a save bar that hides the last thing on the page being
   the classic version of this bug. */
.is-editing { padding-bottom: 84px; }

.edit-chrome * { box-sizing: border-box; }

.edit-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 9000;
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 10px 18px calc(10px + env(safe-area-inset-bottom, 0px));
  background: rgba(10, 11, 13, 0.94);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--line);
  font-family: var(--font-body);
  color: var(--bone);
}
.edit-bar__where {
  font-family: var(--font-mono); font-size: 11px; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--ash);
}
.edit-bar__where b { color: var(--bone); font-weight: 700; }
.edit-bar__spacer { flex: 1 1 auto; }

.edit-status { font-size: 13px; color: var(--ash); min-width: 0; }
.edit-status[data-state="dirty"] { color: var(--red-hot); }
.edit-status[data-state="saved"] { color: var(--bone); }
.edit-status[data-state="error"] { color: var(--red-hot); font-weight: 600; }
.edit-status a { color: inherit; }

.edit-btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 40px; padding: 0 16px;
  border: 1px solid var(--line); background: transparent; color: var(--ash);
  font-family: var(--font-display); font-size: 14px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  text-decoration: none; cursor: pointer;
  transition: color 0.18s var(--ease), border-color 0.18s var(--ease), background-color 0.18s var(--ease);
}
.edit-btn:hover:not(:disabled) { color: var(--bone); border-color: var(--bone); }
.edit-btn:disabled { opacity: 0.45; cursor: default; }
.edit-btn--go { background: var(--red); border-color: var(--red); color: #fff; }
.edit-btn--go:hover:not(:disabled) { background: var(--red-hot); border-color: var(--red-hot); color: #fff; }

/* ── The panel ───────────────────────────────────────────────────────────── */
.edit-panel {
  position: fixed; left: 0; right: 0; bottom: 62px; z-index: 8999;
  max-height: min(60vh, 520px); overflow-y: auto;
  padding: 20px 18px 26px;
  background: var(--ink-2); border-top: 1px solid var(--line);
  font-family: var(--font-body); color: var(--bone);
}
.edit-panel[hidden] { display: none !important; }
.edit-panel__intro {
  margin: 0 0 18px; max-width: 62ch; font-size: 13px; line-height: 1.6; color: var(--ash);
}
.edit-group { margin: 0 0 22px; }
.edit-group__name {
  margin: 0 0 10px; font-family: var(--font-display); font-size: 15px;
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--bone);
}
.edit-field { display: block; margin: 0 0 12px; max-width: 720px; }
.edit-field__label {
  display: block; margin-bottom: 5px;
  font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ash);
}
.edit-field__input {
  display: block; width: 100%; padding: 9px 11px;
  font-family: var(--font-body); font-size: 14px; line-height: 1.5;
  color: var(--bone); background: var(--ink); border: 1px solid var(--line);
}
.edit-field__input:focus { outline: 2px solid var(--red-hot); outline-offset: -1px; }
.edit-field__count { float: right; font-family: var(--font-mono); font-size: 10px; color: var(--ash); }

@media (max-width: 640px) {
  .edit-bar { gap: 8px; padding-left: 12px; padding-right: 12px; }
  .edit-bar__where { width: 100%; }
  .is-editing { padding-bottom: 128px; }
  .edit-panel { bottom: 104px; }
}`;

/* ── Markup ────────────────────────────────────────────────────────────────
   Rendered on the server, so the panel arrives built rather than being
   assembled by script that then has to be kept in step with the schema. */

const field = (entry, value) => `
      <label class="edit-field">
        <span class="edit-field__label">${esc(entry.label ?? entry.key)}</span>
        <input class="edit-field__input" type="text" maxlength="${entry.max}"
               data-key="${esc(entry.key)}" value="${esc(value ?? '')}" spellcheck="true">
      </label>`;

/**
 * The bar, and the panel of strings that are not on screen.
 *
 * @param {object} ctx
 * @param {string} ctx.pageLabel what is being edited, in words
 * @param {Array}  ctx.others    the other pages, as {url, label}
 * @param {Array}  ctx.fields    schema entries for the panel, in order
 * @param {object} ctx.values    every current string, by key
 */
function editChrome(ctx) {
  const groups = [];
  for (const entry of ctx.fields) {
    const last = groups[groups.length - 1];
    if (last && last.name === entry.group) last.entries.push(entry);
    else groups.push({ name: entry.group, entries: [entry] });
  }

  return `
<div class="edit-chrome">
  <div class="edit-panel" id="editPanel" hidden>
    <p class="edit-panel__intro">
      Copy that is not on the page as you are looking at it — what a search
      result says, what the shop shows when it has nothing to show, what the
      button says before a size is picked. Changed here, saved with everything else.
    </p>
    ${groups.map((group) => `
    <section class="edit-group">
      <h2 class="edit-group__name">${esc(group.name)}</h2>
      ${group.entries.map((entry) => field(entry, ctx.values[entry.key])).join('')}
    </section>`).join('')}
  </div>

  <div class="edit-bar" role="region" aria-label="Editing controls">
    <span class="edit-bar__where">Editing <b>${esc(ctx.pageLabel)}</b></span>
    ${ctx.others.map((page) => `<a class="edit-btn" href="${esc(page.url)}">${esc(page.label)}</a>`).join('\n    ')}
    <button class="edit-btn" id="editMore" type="button" aria-expanded="false" aria-controls="editPanel">More copy</button>
    <span class="edit-bar__spacer"></span>
    <span class="edit-status" id="editStatus" role="status" aria-live="polite">No changes yet</span>
    <button class="edit-btn" id="editDiscard" type="button" disabled>Discard</button>
    <button class="edit-btn edit-btn--go" id="editSave" type="button" disabled>Save</button>
  </div>
</div>`;
}

/**
 * The editor.
 *
 * @param {object} ctx
 * @param {object} ctx.values every current string, by key — the document the
 *   page was rendered from, sent back whole on save so the server never has to
 *   reason about which fields the browser chose to include.
 */
const editScript = (ctx) => `
(function () {
  'use strict';

  var ORIGINAL = ${jsonScript(ctx.values)};

  var statusEl  = document.getElementById('editStatus');
  var saveBtn   = document.getElementById('editSave');
  var discardBtn= document.getElementById('editDiscard');
  var moreBtn   = document.getElementById('editMore');
  var panel     = document.getElementById('editPanel');
  var chrome    = document.querySelector('.edit-chrome');

  var clean = JSON.stringify(ORIGINAL);
  var saving = false;

  /* ── Reading the page back ─────────────────────────────────────────────
     The page is the state. There is no second model to keep in step with it,
     which is the bug this design does not get to have.

     Only the BODY is read: <title> and the <meta> tags carry data-edit too,
     because that is how the server finds them in the file, but they have no
     text to collect and they are edited from the panel instead. */
  function collect() {
    var doc = {};
    for (var key in ORIGINAL) doc[key] = ORIGINAL[key];

    var nodes = document.body.querySelectorAll('[data-edit]');
    for (var i = 0; i < nodes.length; i++) {
      if (chrome.contains(nodes[i])) continue;
      var key = nodes[i].getAttribute('data-edit');
      if (key in doc) doc[key] = nodes[i].textContent.trim();
    }

    var inputs = panel.querySelectorAll('[data-key]');
    for (var j = 0; j < inputs.length; j++) {
      doc[inputs[j].getAttribute('data-key')] = inputs[j].value.trim();
    }
    return doc;
  }

  function setStatus(text, state) {
    statusEl.textContent = text;
    if (state) statusEl.setAttribute('data-state', state);
    else statusEl.removeAttribute('data-state');
  }

  function edited() {
    var doc = collect();
    var out = {};
    for (var key in doc) if (doc[key] !== ORIGINAL[key]) out[key] = doc[key];
    return out;
  }

  function touched() {
    if (saving) return;
    var count = Object.keys(edited()).length;
    saveBtn.disabled = !count;
    discardBtn.disabled = !count;
    setStatus(
      count ? (count === 1 ? '1 unsaved change' : count + ' unsaved changes') : 'No changes yet',
      count ? 'dirty' : null
    );
  }

  /* ── Two surfaces, one value ───────────────────────────────────────────
     A few strings are BOTH on the page and in the panel — "Loading…" is on
     screen until the product arrives, and in the panel because most of the
     time it is not. Without this, collect() reads the page first and the panel
     second, so the panel silently wins and an edit typed on the page is thrown
     away on save. Rather than make one of them read-only, they mirror. */
  function mirror(key, value, from) {
    var input = panel.querySelector('[data-key="' + key.replace(/"/g, '') + '"]');
    if (input && input !== from && input.value !== value) input.value = value;

    var nodes = document.body.querySelectorAll('[data-edit="' + key.replace(/"/g, '') + '"]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i] === from || chrome.contains(nodes[i])) continue;
      if (nodes[i].textContent.trim() !== value) nodes[i].textContent = value;
    }
  }

  document.addEventListener('input', function (e) {
    var target = e.target;
    if (target && target.hasAttribute) {
      if (target.hasAttribute('data-key')) mirror(target.getAttribute('data-key'), target.value.trim(), target);
      else if (target.hasAttribute('data-edit') && !chrome.contains(target)) {
        mirror(target.getAttribute('data-edit'), target.textContent.trim(), target);
      }
    }
    touched();
  });

  /* Enter would put a line break in a heading. Every editable string here is
     one line, so it commits instead — which is also what anything that looks
     like a field is expected to do. */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-edit')) {
      e.preventDefault();
      e.target.blur();
    }
  });

  /* Nothing on the page underneath may act while editing.

     Capture phase and stopPropagation, not just preventDefault: the add-to-cart
     button and the colour swatches have their own listeners bound directly to
     them, and preventDefault alone would leave those running — so clicking into
     "Add to cart" to reword it would add the shirt to the cart. Links are
     stopped outright; a button that carries no editable text is left alone, so
     you can still switch colour and see the copy in each state. */
  document.addEventListener('click', function (e) {
    if (chrome.contains(e.target)) return;
    var link = e.target.closest ? e.target.closest('a') : null;
    var editable = e.target.closest ? e.target.closest('[data-edit]') : null;
    if (!link && !editable) return;
    e.preventDefault();
    if (editable) e.stopPropagation();
  }, true);

  window.addEventListener('beforeunload', function (e) {
    if (saveBtn.disabled) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* ── Keeping edits through a re-render ─────────────────────────────────
     product.js rebuilds its whole body when a colour or size is chosen, which
     throws away any half-typed edit inside it. Rather than forbid that — being
     able to see the copy in each state is half the point — put the edits back
     onto whatever markup arrives. */
  var live = new MutationObserver(function () {
    var current = edited();
    if (!Object.keys(current).length) return;
    var nodes = document.body.querySelectorAll('[data-edit]');
    for (var i = 0; i < nodes.length; i++) {
      if (chrome.contains(nodes[i])) continue;
      var key = nodes[i].getAttribute('data-edit');
      if (key in current && nodes[i].textContent.trim() !== current[key]) {
        nodes[i].textContent = current[key];
      }
    }
  });

  /* ── Making the page editable ──────────────────────────────────────────
     Applied to whatever is in the document now and to whatever a script adds
     later, so the strings product.js prints are as editable as the ones that
     came in the file.

     plaintext-only rather than true: it is what stops a paste out of a
     document bringing a <span style> with it. The server would strip that
     anyway — this stops the editor ever SHOWING formatting the page will not
     keep. */
  function arm(root) {
    var nodes = root.querySelectorAll('[data-edit]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (chrome.contains(el) || el.isContentEditable) continue;
      el.setAttribute('contenteditable', 'plaintext-only');
      el.setAttribute('spellcheck', 'true');
    }
  }

  new MutationObserver(function () { arm(document.body); }).observe(document.body, {
    childList: true, subtree: true,
  });

  /* ── The panel ─────────────────────────────────────────────────────────── */
  moreBtn.addEventListener('click', function () {
    var open = panel.hasAttribute('hidden');
    if (open) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
    moreBtn.setAttribute('aria-expanded', String(open));
    moreBtn.textContent = open ? 'Hide copy' : 'More copy';
  });

  /* ── Saving ────────────────────────────────────────────────────────────── */
  saveBtn.addEventListener('click', function () {
    var changes = edited();
    if (!Object.keys(changes).length) return;

    saving = true;
    saveBtn.disabled = true;
    discardBtn.disabled = true;
    setStatus('Saving…', null);

    fetch('/api/admin/content', {
      method: 'POST',
      /* The second CSRF layer. The session cookie is SameSite=Lax and so is
         already withheld from a cross-site POST; a plain cross-origin <form>
         additionally cannot set a custom header, and this origin permits no
         preflight that would let one. The endpoint refuses without it. */
      headers: { 'content-type': 'application/json', 'x-merlow-admin': '1' },
      body: JSON.stringify({ changes: changes })
    })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (r) {
        saving = false;
        if (!r.ok || !r.body || r.body.ok !== true) {
          /* Never claims a success it did not have. The page in front of you
             already shows the change — it is the page with the words typed
             into it — so a save that quietly failed looks exactly like one
             that worked, right up until somebody reloads. */
          setStatus((r.body && r.body.message) || 'Save failed. Nothing was written.', 'error');
          saveBtn.disabled = false;
          discardBtn.disabled = false;
          return;
        }
        clean = JSON.stringify(collect());
        for (var key in changes) ORIGINAL[key] = changes[key];
        saveBtn.disabled = true;
        discardBtn.disabled = true;
        statusEl.setAttribute('data-state', 'saved');
        statusEl.innerHTML = '';
        statusEl.appendChild(document.createTextNode('Committed. Live in about a minute — '));
        var a = document.createElement('a');
        a.href = r.body.url || '#';
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'see the commit';
        statusEl.appendChild(a);
      })
      .catch(function () {
        saving = false;
        saveBtn.disabled = false;
        discardBtn.disabled = false;
        setStatus('Could not reach the server. Nothing was written.', 'error');
      });
  });

  discardBtn.addEventListener('click', function () {
    if (!window.confirm('Throw away every change since the last save?')) return;
    saveBtn.disabled = true;              // stops beforeunload asking twice
    location.reload();
  });

  arm(document.body);
  live.observe(document.body, { childList: true, subtree: true });
  touched();
})();`;

module.exports = { jsonScript, esc, editStyles, editChrome, editScript };
