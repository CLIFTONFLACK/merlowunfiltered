'use strict';

/* POST /api/admin/content — save, which here means commit.
 *
 * ── CSRF ──────────────────────────────────────────────────────────────────
 *
 * Two layers. The session cookie is SameSite=Lax, so a browser withholds it
 * from a cross-site POST already. X-Merlow-Admin is the second: a plain
 * cross-origin <form> cannot set a custom header, and this origin permits no
 * preflight that would let one, so anything arriving with the header came from
 * this site.
 *
 * ── Validation is not here ────────────────────────────────────────────────
 *
 * Every field is sanitised by lib/copy.js, next to the schema that defines
 * what the fields ARE. Splitting "what a heading may contain" from "what a
 * heading is" across two files is how the two stop agreeing. This route's job
 * is who may call, and what to answer.
 *
 * ── Never claim a save that did not happen ────────────────────────────────
 *
 * The editor is the live page with the new words typed into it, so a save that
 * quietly failed looks exactly like one that worked — right up until somebody
 * reloads. Every failure below returns ok:false and a sentence a person can
 * act on, and the editor prints that sentence rather than "Save failed".
 */

const auth = require('../../lib/admin-auth.js');
const github = require('../../lib/github.js');
const { loadDocument, applyChanges, commitMessage } = require('../../lib/content.js');

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

async function jsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { ok: false, message: 'POST only.' });
  }

  if (req.headers['x-merlow-admin'] !== '1') {
    return send(res, 400, { ok: false, message: 'Missing the admin header.' });
  }

  const gate = auth.adminGate(req);
  if (!gate.ok) {
    return send(res, gate.reason === 'anonymous' ? 401 : 403, {
      ok: false,
      message: gate.reason === 'unconfigured'
        ? 'No admin password is set on this deployment.'
        : 'Your session has expired. Open /admin/signin in another tab, sign in, then save again — your changes are still on this page.',
    });
  }

  if (!github.configured()) {
    return send(res, 503, {
      ok: false,
      message: 'No GITHUB_TOKEN is set, so there is nowhere to save to. Nothing was written.',
    });
  }

  const body = await jsonBody(req);
  if (!body || typeof body.changes !== 'object' || !body.changes) {
    return send(res, 400, { ok: false, message: 'Nothing to save.' });
  }

  const doc = loadDocument();
  if (doc.broken.length) {
    return send(res, 500, {
      ok: false,
      message: `Cannot save: ${doc.broken.join(', ')} could not be read. Nothing was written.`,
    });
  }

  const { files, applied } = applyChanges(doc, body.changes);
  if (!files.length) {
    // Everything sent was either rejected by the sanitiser or already what the
    // file says. Reporting it as a save would be a lie, and reporting it as a
    // failure would be a different one.
    return send(res, 200, { ok: true, changed: 0, message: 'Nothing had actually changed. No commit was made.' });
  }

  /* The one way this design can lose work: the files just read are not the
     files at the head of the branch, so committing them would carry the older
     ones forward over the newer. Checked before writing, every time. */
  try {
    const { stale, head, deployed } = await github.freshness();
    if (stale) {
      return send(res, 409, {
        ok: false,
        message:
          `This page was built from ${String(deployed).slice(0, 7)} but the branch is at ${head.slice(0, 7)}. ` +
          'Saving now would undo whatever landed in between. Wait for the deploy to finish, reload, and retype. Nothing was written.',
      });
    }
  } catch (err) {
    return send(res, 502, { ok: false, message: `GitHub would not answer: ${err.message}. Nothing was written.` });
  }

  try {
    const commit = await github.commitFiles(files, commitMessage(applied));
    return send(res, 200, {
      ok: true,
      changed: Object.keys(applied).length,
      files: files.map((f) => f.path),
      sha: commit.sha,
      url: commit.url,
    });
  } catch (err) {
    // 409 from the ref update means somebody else moved the branch between the
    // freshness check and the commit. Small window, real one, and the answer is
    // the same as above: reload rather than force.
    const conflict = err.status === 409 || err.status === 422;
    return send(res, conflict ? 409 : 502, {
      ok: false,
      message: conflict
        ? 'The branch moved while this was saving. Reload the page and try again. Nothing was written.'
        : `Could not commit: ${err.message}. Nothing was written.`,
    });
  }
};
