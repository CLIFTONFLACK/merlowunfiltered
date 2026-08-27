'use strict';

/* The document the editor edits.
   lib/content.js

   Three files hold the copy — shop.html, product.html and js/copy.js — and
   this is the one place that knows how to read all of them as a single flat
   map of key to string, and how to write a set of changes back out again.

   Nothing here holds a default. The files are the content; see lib/copy.js.
*/

const copy = require('./copy.js');
const pageEdit = require('./page-edit.js');
const siteFiles = require('./site-files.js');

const CLIENT = 'js/copy.js';

/**
 * Every editable string as it stands right now.
 *
 * @returns {{values: object, sources: object, missing: string[], broken: string[]}}
 *   `missing` is keys the schema knows that no file actually holds — a mark
 *   deleted from the markup, or a key added to the schema and nowhere else.
 *   `broken` is files that could not be read at all. Both are reported rather
 *   than thrown, so /admin can show what is wrong instead of a stack trace,
 *   and so one damaged file does not take the whole editor down.
 */
function loadDocument(read = siteFiles.read) {
  const values = {};
  const sources = {};
  const broken = [];

  for (const file of copy.FILES) {
    let text;
    try {
      text = read(file);
    } catch {
      broken.push(file);
      continue;
    }
    sources[file] = text;

    if (file === CLIENT) {
      const parsed = copy.readClientCopy(text);
      if (!parsed) {
        broken.push(file);
        continue;
      }
      for (const key of copy.jsKeys()) {
        if (typeof parsed[key] === 'string') values[key] = parsed[key];
      }
      continue;
    }

    let marked;
    try {
      marked = pageEdit.readValues(text);
    } catch {
      // A mark that breaks the plain-text invariant. The markup is wrong, and
      // the file is unsafe to write until it is fixed.
      broken.push(file);
      continue;
    }
    for (const key of copy.htmlKeys(file)) {
      if (typeof marked[key] === 'string') values[key] = marked[key];
    }
  }

  const missing = copy.SCHEMA.map((f) => f.key).filter((key) => !(key in values));
  return { values, sources, missing, broken };
}

/**
 * Apply a set of changes, returning only the files that actually changed.
 *
 * Changes are sanitised first, and a field the sanitiser rejects is simply
 * absent afterwards — so a hostile or empty value leaves no trace in any file
 * rather than blanking the string it was aimed at.
 *
 * js/copy.js is rewritten WHOLE, from the current values with the changes
 * folded in, because that is the shape lib/copy.js promises to be able to read
 * back. The HTML files are patched in place, one span at a time, so their diff
 * shows the words that changed and nothing else.
 *
 * @returns {{files: Array<{path: string, content: string}>, applied: object}}
 */
function applyChanges(doc, incoming) {
  const applied = copy.sanitiseAll(incoming);

  // A "change" that matches what is already there is not a change. Dropping it
  // here is what stops a save producing an empty commit.
  for (const key of Object.keys(applied)) {
    if (applied[key] === doc.values[key]) delete applied[key];
  }

  const files = [];
  if (!Object.keys(applied).length) return { files, applied };

  const touched = new Set(
    Object.keys(applied).map((key) => copy.BY_KEY.get(key).where)
  );

  for (const file of touched) {
    if (file === CLIENT) {
      const next = { ...doc.values, ...applied };
      const content = copy.renderClientCopy(next);
      if (content !== doc.sources[file]) files.push({ path: file, content });
      continue;
    }
    const content = pageEdit.writeValues(doc.sources[file], applied);
    if (content !== doc.sources[file]) files.push({ path: file, content });
  }

  return { files, applied };
}

/**
 * What the commit says it did.
 *
 * The subject names the count and the surface, the body lists the keys. A year
 * from now the useful question of a copy commit is "which string moved", and a
 * message that answers it saves opening the diff.
 */
function commitMessage(applied) {
  const keys = Object.keys(applied).sort();
  const what = keys.length === 1 ? '1 string' : `${keys.length} strings`;
  const where = [...new Set(keys.map((k) => k.split('.')[0]))].sort().join(' and ');
  return [
    `Reword ${what} on the ${where} page${where.includes(' and ') ? 's' : ''}`,
    '',
    ...keys.map((key) => `- ${key}`),
    '',
    'Edited at /admin/edit.',
  ].join('\n');
}

module.exports = { CLIENT, loadDocument, applyChanges, commitMessage };
