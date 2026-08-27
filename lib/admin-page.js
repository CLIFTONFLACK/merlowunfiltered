'use strict';

/* The two pages the editor needs that are not the site.
   lib/admin-page.js

   /admin/edit is the shop with editing on, and deliberately looks like nothing
   else. But signing in and choosing what to edit have no page to borrow, so
   they get one — built out of the site's own stylesheet and its own typefaces,
   because an admin area that looks like a different product is how you end up
   unsure which site you are editing.
*/

const esc = (v) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLES = `
  body.admin {
    min-height: 100vh; min-height: 100dvh;
    display: grid; place-items: center;
    padding: max(24px, env(safe-area-inset-top, 0px)) 24px max(24px, env(safe-area-inset-bottom, 0px));
    background: var(--ink); color: var(--bone);
    font-family: var(--font-body);
  }
  .admin__card {
    width: 100%; max-width: 560px;
    padding: 34px 30px 30px;
    border: 1px solid var(--line); background: var(--ink-2);
  }
  .admin__mark {
    display: block; width: 168px; height: auto; margin: 0 0 22px;
  }
  .admin__h {
    margin: 0 0 6px;
    font-family: var(--font-display); font-size: clamp(26px, 5vw, 34px);
    font-weight: 800; letter-spacing: 0.02em; text-transform: uppercase;
  }
  .admin__sub { margin: 0 0 24px; color: var(--ash); font-size: 14px; line-height: 1.6; }
  .admin__label {
    display: block; margin-bottom: 6px;
    font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--ash);
  }
  .admin__input {
    display: block; width: 100%; padding: 12px 13px; margin-bottom: 16px;
    font-family: var(--font-body); font-size: 16px;
    color: var(--bone); background: var(--ink); border: 1px solid var(--line);
  }
  .admin__input:focus { outline: 2px solid var(--red-hot); outline-offset: -1px; }
  .admin__btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 100%; min-height: 48px; padding: 0 20px;
    border: 1px solid var(--red); background: var(--red); color: #fff;
    font-family: var(--font-display); font-size: 15px; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer;
    text-decoration: none;
  }
  .admin__btn:hover { background: var(--red-hot); border-color: var(--red-hot); }
  .admin__error {
    margin: 0 0 18px; padding: 11px 13px;
    border-left: 3px solid var(--red-hot); background: rgba(227, 58, 46, 0.10);
    color: var(--bone); font-size: 14px; line-height: 1.5;
  }
  .admin__note { margin: 18px 0 0; color: var(--ash); font-size: 12.5px; line-height: 1.6; }
  .admin__note code { font-family: var(--font-mono); font-size: 11.5px; color: var(--bone); }

  .admin__list { list-style: none; margin: 0; padding: 0; }
  .admin__list li + li { margin-top: 10px; }
  .admin__link {
    display: block; padding: 16px 18px;
    border: 1px solid var(--line); color: var(--bone); text-decoration: none;
    transition: border-color 0.18s var(--ease), background-color 0.18s var(--ease);
  }
  .admin__link:hover { border-color: var(--bone); background: var(--ink-3); }
  .admin__link b {
    display: block; font-family: var(--font-display); font-size: 18px;
    font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  }
  .admin__link span { display: block; margin-top: 3px; color: var(--ash); font-size: 13px; }
  .admin__out {
    display: inline-block; margin-top: 22px;
    color: var(--ash); font-size: 13px; text-decoration: underline;
  }`;

/**
 * The shell.
 *
 * noindex in the markup as well as in the header, because the two are read by
 * different things and this page has no business in a search result either way.
 */
const shell = ({ title, body }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<meta name="theme-color" content="#0A0B0D">
<link rel="icon" href="/media/favicon-32.png" sizes="32x32" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Barlow:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/styles.css">
<style>${STYLES}</style>
</head>
<body class="admin">
<main class="admin__card">
  <img class="admin__mark" src="/media/merlow-wordmark.png" alt="MERLOW" width="640" height="150">
${body}
</main>
</body>
</html>
`;

module.exports = { esc, shell };
