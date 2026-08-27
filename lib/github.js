'use strict';

/* Saving, which here means committing.
   lib/github.js

   ── Why a commit is the store ─────────────────────────────────────────────

   VANCE-HQ writes its edits to Redis and renders them on every request.
   merlow.space has no store, and it is a static site — no server renders
   /shop, the file IS the response — so the honest equivalent is to change the
   file. The project is connected to CLIFTONFLACK/merlowunfiltered and builds
   on a push, so a commit to `main` is a deploy.

   What that buys, beyond not standing up a database for a page of copy:
   every edit has an author, a message, a diff and a revert, for free and
   forever. What it costs is a minute. The editor says so rather than
   pretending otherwise.

   ── One commit, not one per file ──────────────────────────────────────────

   A save can touch shop.html, product.html and js/copy.js at once. The
   Contents API would make that three commits and three builds, with two
   half-saved states in between that a visitor could land on. So this uses the
   Git Data API — blobs, then a tree, then a commit, then one move of the
   branch — which lands all of it or none of it.

   ── The branch is moved without force, and that is the concurrency check ──

   PATCH on a ref with force=false fails if the branch has moved since the
   parent this commit names. Two editors saving at once, or a save landing on
   top of a push, therefore loses nothing: the second one is refused and told
   to reload. Forcing here would silently drop whichever change lost the race.
*/

const REPO = 'CLIFTONFLACK/merlowunfiltered';
const BRANCH = 'main';
const API = 'https://api.github.com';

/** Long enough for four sequential calls on a cold connection, short enough
 *  that a hung GitHub does not hold a function open to its own timeout. */
const TIMEOUT_MS = 10000;

const read = (v) => (typeof v === 'string' ? v.trim() : '') || null;

const token = (env = process.env) => read(env.GITHUB_TOKEN) ?? read(env.MERLOW_GITHUB_TOKEN);
const repo = (env = process.env) => read(env.MERLOW_CONTENT_REPO) ?? REPO;
const branch = (env = process.env) => read(env.MERLOW_CONTENT_BRANCH) ?? BRANCH;

const configured = (env = process.env) => Boolean(token(env));

/**
 * The commit this deployment was built from.
 *
 * Vercel sets it on every build. It is what lets a save notice that the files
 * it just read are not the files at the head of the branch — see stale() —
 * and it is absent in local development, where that check does not apply.
 */
const deployedSha = (env = process.env) => read(env.VERCEL_GIT_COMMIT_SHA);

/**
 * One GitHub call.
 *
 * Errors carry GitHub's own message where there is one. A save that fails
 * needs to say WHY on the screen — "Bad credentials" and "Resource not
 * accessible by personal access token" send you to two completely different
 * fixes, and "Save failed" sends you to neither.
 */
async function call(path, { method = 'GET', body, env = process.env } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token(env)}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'merlow-content-editor',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = payload?.message ? `: ${payload.message}` : '';
    const err = new Error(`GitHub ${res.status}${detail}`);
    err.status = res.status;
    throw err;
  }
  return payload;
}

/** Where the branch points right now. */
const headSha = async (env = process.env) =>
  (await call(`/repos/${repo(env)}/git/ref/heads/${branch(env)}`, { env })).object.sha;

/**
 * Is this deployment built from something other than the head of the branch?
 *
 * If it is, the files on disk are not the files a commit would be based on,
 * and committing them would quietly revert whatever is at the head. That is
 * the one way this design can lose somebody's work, so it is checked before
 * every save rather than hoped about.
 *
 * @returns {Promise<{stale: boolean, head: string, deployed: string|null}>}
 */
async function freshness(env = process.env) {
  const head = await headSha(env);
  const deployed = deployedSha(env);
  return { stale: Boolean(deployed) && deployed !== head, head, deployed: deployed ?? null };
}

/**
 * Commit a set of files.
 *
 * @param {Array<{path: string, content: string}>} files UTF-8 text, whole file
 * @param {string} message
 * @returns {Promise<{sha: string, url: string}>}
 */
async function commitFiles(files, message, env = process.env) {
  const slug = repo(env);
  const head = await headSha(env);
  const base = await call(`/repos/${slug}/git/commits/${head}`, { env });

  // Blobs first and in parallel: they are independent, they are the slow part,
  // and nothing downstream can start until all of them exist anyway.
  const blobs = await Promise.all(
    files.map(async (file) => ({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: (await call(`/repos/${slug}/git/blobs`, {
        method: 'POST',
        env,
        body: { content: Buffer.from(file.content, 'utf8').toString('base64'), encoding: 'base64' },
      })).sha,
    }))
  );

  const tree = await call(`/repos/${slug}/git/trees`, {
    method: 'POST',
    env,
    // base_tree, so the commit carries the whole repository forward and names
    // only what changed. Without it the tree would BE these three files and
    // the commit would delete everything else.
    body: { base_tree: base.tree.sha, tree: blobs },
  });

  const commit = await call(`/repos/${slug}/git/commits`, {
    method: 'POST',
    env,
    body: { message, tree: tree.sha, parents: [head] },
  });

  await call(`/repos/${slug}/git/refs/heads/${branch(env)}`, {
    method: 'PATCH',
    env,
    body: { sha: commit.sha, force: false },
  });

  return { sha: commit.sha, url: `https://github.com/${slug}/commit/${commit.sha}` };
}

module.exports = {
  REPO,
  BRANCH,
  configured,
  repo,
  branch,
  deployedSha,
  headSha,
  freshness,
  commitFiles,
  call,
};
