#!/usr/bin/env node
//
// Generates the workshop how-to guide: guide/start-here.html plus guide/pages/.
// No dependencies, no build tooling — run `node guide/src/build-guide.js` and open
// guide/start-here.html with a double click.
//
// The generated files are committed so attendees never need to run this.
//
// Design constraint: the audience is on laptops. Nothing in this guide should
// ever need retyping off a slide — every command, prompt, and URL renders as a
// one-click copy block.

const fs = require("fs");
const path = require("path");
const { activities, LINKS, PLATFORMS, DETECT_COMMAND } = require("./activities");

// This file lives in guide/src/. The guide itself is one directory up, and is laid
// out so that opening the guide folder presents exactly ONE thing to double-click:
//
//   guide/start-here.html   the entry point
//   guide/pages/            every other page
//   guide/src/              this generator and its data
//
// Before this split, guide/ held fourteen HTML files and two .js files with no
// indication which one to open first.
const GUIDE = path.join(__dirname, "..");
const PAGES = path.join(GUIDE, "pages");
fs.mkdirSync(PAGES, { recursive: true });

// How a page reaches the others depends on which directory it sits in. Keeping the
// two link sets explicit is what stops a relative path being guessed wrong — and a
// broken link in a guide is worse than no guide, because it is found mid-workshop.
const FROM_ROOT = {
  home: "start-here.html",
  links: "pages/links.html",
  platform: "pages/environment-setup.html",
  page: f => `pages/${f}`,
};
const FROM_PAGES = {
  home: "../start-here.html",
  links: "links.html",
  platform: "environment-setup.html",
  page: f => f,
};

// Palette taken from the live site, orchlab.ai — the same neutral grey ramp and
// single green accent as src/branding.js in the slide-deck repo. Keep the two in
// sync; the site is the source of truth for both.
//
// Surfaces ascend the grey ramp so each layer reads without needing a border:
//   page #222222  →  panel #2A2A2A  →  raised #383838  →  hover #444444
// and code wells drop to #050505 so they read as inset rather than raised.
//
// Measured contrast on these surfaces (all AA or better for their type size):
//   text on page 15.0:1   white on panel 14.4:1   accent on page 8.3:1
//   text on well 17.6:1   accent on well 9.8:1    muted on page 6.5:1
// Three-state theming. The head script always resolves a theme and stamps
// data-theme on <html> before first paint, so there is no flash and the CSS
// never has to reason about "unset". The media query below is the no-JS
// fallback, and is written so an explicit light choice still wins.
//
// Constants (--brand, --well*) are identical in both themes on purpose: the
// code wells stay dark whatever the page does, which keeps the terminal voice
// of the brand and means a copy block looks the same in a screenshot either way.
const CSS = `
:root {
  color-scheme: light;
  /* Light theme */
  --bg:          #ffffff;
  --panel:       #f4f4f4;
  --surface:     #ebebeb;
  --surface-alt: #dedede;
  --border:      #d4d4d4;
  --text:        #2a2a2a;
  --muted:       #5a5a5a;
  --strong:      #111111;
  --accent:      #3f6b2b;  /* deep green — 6.3:1 on white */
  --amber:       #7a5200;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg:          #222222;
    --panel:       #2a2a2a;
    --surface:     #383838;
    --surface-alt: #444444;
    --border:      #383838;
    --text:        #eeeeee;
    --muted:       #9e9e9e;
    --strong:      #ffffff;
    --accent:      #8cc26c;
    --amber:       #ffbd2e;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg:          #222222;
  --panel:       #2a2a2a;
  --surface:     #383838;
  --surface-alt: #444444;
  --border:      #383838;
  --text:        #eeeeee;
  --muted:       #9e9e9e;
  --strong:      #ffffff;
  --accent:      #8cc26c;
  --amber:       #ffbd2e;
}
:root {
  /* Constant in both themes */
  --brand:      #8cc26c;  /* the OrchLab green — decorative only */
  --on-brand:   #222222;  /* text sitting on --brand, 7.6:1 */
  --well:       #050505;  /* code + prompt wells stay dark in both themes */
  --well-text:  #eeeeee;
  --well-accent:#8cc26c;
}
* { box-sizing: border-box; }
/* Needed because several things toggled with el.hidden also carry a class that
   sets display (.chosen is a flex row). A class rule beats the UA sheet's
   [hidden]{display:none}, so without this the element stays visible. */
[hidden] { display: none !important; }
body {
  margin: 0;
  padding: 0 20px 80px;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.wrap { max-width: 820px; margin: 0 auto; }
header.site {
  padding: 32px 0 24px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 32px;
  display: flex; gap: 24px; align-items: center; flex-wrap: wrap;
}
header.site a { color: var(--accent); text-decoration: none; font-weight: 700; letter-spacing: 2px; font-size: 13px; }
header.site a:hover { text-decoration: underline; }
header.site .spacer { flex: 1 1 auto; }

/* theme toggle — the label is driven by CSS, so it is correct on first paint */
.theme-toggle {
  flex: none; cursor: pointer; font: 600 12px/1 inherit; letter-spacing: 1px;
  padding: 8px 14px; border-radius: 4px;
  border: 1px solid var(--border); background: var(--panel); color: var(--text);
}
.theme-toggle:hover { background: var(--surface); border-color: var(--accent); color: var(--accent); }
.theme-toggle .to-dark { display: none; }
:root[data-theme="dark"] .theme-toggle .to-dark { display: inline; }
:root[data-theme="dark"] .theme-toggle .to-light { display: none; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .theme-toggle .to-dark { display: inline; }
  :root:not([data-theme="light"]) .theme-toggle .to-light { display: none; }
}

h1 { font-size: 31px; line-height: 1.2; margin: 18px 0 10px; color: var(--strong); }
h2 {
  font-size: 15px; margin: 38px 0 14px; color: var(--accent);
  text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;
}
p.lede { color: var(--text); font-size: 17.5px; margin: 0 0 28px; }
p.eyebrow { color: var(--muted); font-size: 13px; letter-spacing: 1.5px; text-transform: uppercase; margin: 0 0 4px; }

/* Inline code is theme-aware — a near-black chip on a white page reads as
   damage. The dark wells are for block-level code only. */
code {
  background: var(--panel); color: var(--accent);
  border: 1px solid var(--border);
  padding: 1px 6px; border-radius: 4px;
  font: 14px/1.4 ui-monospace, "SF Mono", Menlo, monospace;
}
a { color: var(--accent); }

/* index cards */
.cards { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
.card {
  position: relative;
  display: block; padding: 18px 20px; text-decoration: none;
  background: var(--surface); border: 1px solid var(--border);
  border-left: 4px solid var(--brand);
  border-radius: 6px; color: inherit; transition: background .15s, transform .1s;
}
.card:hover { background: var(--surface-alt); transform: translateY(-1px); }
/* The activity number is what the facilitator says out loud ("we're on
   activity four"), so it has to be findable at a glance from across a room. */
.card .num {
  position: absolute; top: 14px; right: 16px;
  font: 700 13px/1 ui-monospace, "SF Mono", Menlo, monospace;
  letter-spacing: 1px; color: var(--accent);
}
.card .want { display: block; font-size: 17.5px; font-weight: 600; color: var(--strong); margin-bottom: 6px; line-height: 1.35; padding-right: 46px; }
.card .meta { display: block; font-size: 13px; color: var(--text); opacity: .82; }
.card .tag { color: var(--strong); font-family: ui-monospace, Menlo, monospace; font-weight: 700; }

/* activity number on a page header */
.actnum {
  display: inline-block; margin: 0 0 10px;
  background: var(--brand); color: var(--on-brand);
  font: 700 12px/1 ui-monospace, "SF Mono", Menlo, monospace;
  letter-spacing: 1.5px; padding: 7px 11px; border-radius: 4px;
}

/* checkpoint strip */
.cp {
  display: flex; flex-wrap: wrap; gap: 10px 24px; align-items: baseline;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 13px 18px; margin: 0 0 26px;
  font-size: 14px; color: var(--text);
}
.cp b { color: var(--strong); font-family: ui-monospace, Menlo, monospace; font-size: 15px; }

ol, ul { padding-left: 22px; }
li { margin: 8px 0; }

.success {
  border-left: 4px solid var(--brand); background: var(--surface);
  padding: 15px 18px; border-radius: 0 6px 6px 0; margin: 10px 0 0;
  color: var(--strong);
}

/* copy blocks — the point of this guide on a laptop */
.copyblock { margin: 0 0 16px; }
.copyblock .cb-head {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 8px 12px; background: var(--surface);
  border: 1px solid var(--border); border-bottom: 0;
  border-radius: 6px 6px 0 0; font-size: 13px; color: var(--text);
}
.copyblock button {
  flex: none; cursor: pointer; border: 1px solid var(--accent);
  background: transparent; color: var(--accent);
  font: 600 12px/1 inherit; padding: 6px 12px; border-radius: 4px;
}
.copyblock button:hover { background: var(--accent); color: var(--bg); }
.copyblock button.copied { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.copyblock pre {
  margin: 0; padding: 14px; background: var(--well);
  border-radius: 0 0 6px 6px; overflow-x: auto;
  font: 13.5px/1.6 ui-monospace, "SF Mono", Menlo, monospace;
  color: var(--well-text); white-space: pre-wrap; word-break: break-word;
}
.copyblock pre code { background: none; border: 0; color: var(--well-accent); padding: 0; }
.copyblock.is-prompt .cb-head { background: var(--brand); color: var(--on-brand); font-weight: 700; border-color: var(--brand); }
.copyblock.is-prompt button { border-color: var(--on-brand); color: var(--on-brand); }
.copyblock.is-prompt button:hover { background: var(--on-brand); color: var(--brand); }

/* link list */
.links { list-style: none; padding: 0; margin: 0; }
.links li { margin: 0 0 12px; }
.links .lbl { display: block; font-size: 14px; color: var(--muted); margin-bottom: 4px; }

/* cheat — collapsed by default, deliberately understated */
details.cheat {
  margin: 34px 0 0; background: var(--panel);
  border-left: 4px solid var(--amber); border-radius: 0 6px 6px 0;
}
details.cheat > summary {
  cursor: pointer; padding: 14px 18px; font-weight: 600; color: var(--amber);
  list-style: none; user-select: none;
}
details.cheat > summary::-webkit-details-marker { display: none; }
details.cheat > summary::before { content: "▸ "; }
details.cheat[open] > summary::before { content: "▾ "; }
details.cheat .body { padding: 0 18px 16px; }
details.cheat .body p { margin: 0 0 10px; color: var(--text); font-size: 15px; }

/* platform picker
   Choices are real <button>s so they are keyboard-reachable and announce their
   pressed state. The panels are VISIBLE by default and hidden by script — that way
   a browser with JavaScript off, or a page opened before the script runs, shows
   every pathway rather than an empty page with nothing to click. */
.picker { display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 10px; }
.picker button {
  flex: 1 1 200px; cursor: pointer; text-align: left;
  padding: 16px 18px; border-radius: 6px;
  border: 1px solid var(--border); border-left: 4px solid var(--brand);
  background: var(--surface); color: var(--text);
  font: 600 17px/1.3 inherit;
  transition: background .15s, transform .1s;
}
.picker button:hover { background: var(--surface-alt); transform: translateY(-1px); }
.picker button .sub { display: block; font: 400 13.5px/1.5 inherit; color: var(--muted); margin-top: 5px; }
.picker button[aria-pressed="true"] {
  background: var(--brand); color: var(--on-brand); border-color: var(--brand);
}
.picker button[aria-pressed="true"] .sub { color: var(--on-brand); opacity: .8; }

/* the "you chose X" strip, with a way back out */
.chosen {
  display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: baseline;
  background: var(--surface); border: 1px solid var(--border);
  border-left: 4px solid var(--brand);
  border-radius: 6px; padding: 13px 18px; margin: 0 0 22px; font-size: 14.5px;
}
.chosen b { color: var(--strong); }
.chosen .spacer { flex: 1 1 auto; }
.chosen button {
  cursor: pointer; border: 1px solid var(--border); background: var(--panel);
  color: var(--accent); font: 600 12px/1 inherit; padding: 7px 12px; border-radius: 4px;
}
.chosen button:hover { border-color: var(--accent); }

.pathway { margin: 0 0 10px; }
.pathway h3 {
  font-size: 17px; margin: 26px 0 6px; color: var(--strong);
}
.pathway .confirm { margin: 0 0 18px; color: var(--text); }
.note {
  border-left: 4px solid var(--amber); background: var(--panel);
  padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 0 0 12px;
  font-size: 14.5px;
}

/* "Which window do I type this into, and from where?" is the most common thing a
   first-timer gets wrong, and a list of copyable commands answers neither half of
   it. So it is a callout rather than a sentence of prose above the commands, and it
   names the wrong shells explicitly - "not PowerShell" is the part people need. The
   badge takes its text colour from --bg so it stays readable when --accent flips to
   the light green in dark mode. */
.shellreq {
  border-left: 4px solid var(--accent); background: var(--surface);
  padding: 13px 16px; border-radius: 0 6px 6px 0; margin: 0 0 14px;
  color: var(--strong); font-size: 15px;
}
.shellreq .where {
  display: inline-block; background: var(--accent); color: var(--bg);
  font: 700 11px/1 ui-monospace, Menlo, monospace; letter-spacing: .08em;
  text-transform: uppercase; padding: 5px 8px; border-radius: 3px;
  margin-right: 10px; vertical-align: 1px;
}
.shellreq strong { color: var(--strong); }

/* Which shell does this command belong in. Two places, two colours, stated on every
   block rather than once at the top of the page — by the time someone has scrolled
   to the third command they have forgotten a heading. */
.loc {
  flex: none; margin-left: auto; margin-right: 10px; padding: 3px 8px; border-radius: 3px;
  font: 700 10.5px/1 ui-monospace, Menlo, monospace; letter-spacing: .06em;
  text-transform: uppercase; white-space: nowrap;
}
.loc.host      { background: var(--amber);  color: var(--bg); }
.loc.container { background: var(--accent); color: var(--bg); }
.shellreq .not { color: var(--amber); font-weight: 700; }

/* nav */
nav.pager {
  display: flex; justify-content: space-between; gap: 14px;
  margin-top: 46px; padding-top: 22px; border-top: 1px solid var(--border);
}
nav.pager a, nav.pager span {
  padding: 11px 18px; border-radius: 6px; text-decoration: none; font-size: 14.5px;
  background: var(--panel); color: var(--accent); border: 1px solid var(--border);
}
nav.pager span { color: var(--muted); opacity: .5; border-color: transparent; background: none; }
nav.pager a:hover { background: var(--surface); }
`;

// Runs in <head>, before first paint: resolve the theme from storage, else from
// the OS preference, and stamp it on <html>. Doing this here rather than in the
// body script is what prevents a flash of the wrong theme. localStorage can
// throw on file:// in some browsers, so every access is guarded.
const HEAD_JS = `
(function () {
  try {
    var stored = localStorage.getItem('orchlab-guide-theme');
    var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    document.documentElement.setAttribute('data-theme', stored || (prefersLight ? 'light' : 'dark'));
  } catch (e) {}
})();
`;

// Copy-to-clipboard without any external dependency. navigator.clipboard is
// unavailable on file:// in some browsers, so execCommand is tried first and the
// async API is only the fallback — the reverse of the usual order, on purpose.
const JS = `
// Platform choice. Remembered across pages so the environment-check activity shows
// the same pathway the picker page did, and so nobody has to re-answer it.
//
// State is ONE string: '', 'macos', 'windows', 'windows-linux' or 'windows-windows'.
// 'windows' is the half-answered state — the OS is known but the container mode is
// not — which is exactly the moment the guide needs to ask the second question.
var PLATFORM_KEY = 'orchlab-guide-platform';

function applyPlatform(state) {
  var os = state ? state.split('-')[0] : '';
  var final = state && state !== 'windows';

  document.querySelectorAll('[data-step="mode"]').forEach(function (el) {
    el.hidden = os !== 'windows';
  });
  document.querySelectorAll('[data-pathway]').forEach(function (el) {
    el.hidden = el.getAttribute('data-pathway') !== state;
  });
  document.querySelectorAll('[data-pick-empty]').forEach(function (el) {
    el.hidden = !!final;
  });
  document.querySelectorAll('[data-pick-chosen]').forEach(function (el) {
    el.hidden = !final;
  });
  document.querySelectorAll('[data-pick-label]').forEach(function (el) {
    if (final) el.textContent = el.getAttribute('data-label-' + state) || state;
  });
  document.querySelectorAll('[data-pick]').forEach(function (b) {
    var v = b.getAttribute('data-pick');
    b.setAttribute('aria-pressed', String(v === state || v === os));
  });
}

function setPlatform(state) {
  try {
    if (state) localStorage.setItem(PLATFORM_KEY, state);
    else localStorage.removeItem(PLATFORM_KEY);
  } catch (err) {}
  applyPlatform(state || '');
}

(function () {
  var stored = '';
  try { stored = localStorage.getItem(PLATFORM_KEY) || ''; } catch (err) {}
  applyPlatform(stored);
})();

document.addEventListener('click', function (e) {
  var toggle = e.target.closest('[data-theme-toggle]');
  if (toggle) {
    var root = document.documentElement;
    var current = root.getAttribute('data-theme');
    if (!current) {
      var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      current = prefersLight ? 'light' : 'dark';
    }
    var next = current === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('orchlab-guide-theme', next); } catch (err) {}
    return;
  }

  var pick = e.target.closest('[data-pick]');
  if (pick) {
    setPlatform(pick.getAttribute('data-pick'));
    return;
  }
  if (e.target.closest('[data-pick-reset]')) {
    setPlatform(null);
    return;
  }

  var btn = e.target.closest('.copyblock button');
  if (!btn) return;
  var text = btn.closest('.copyblock').querySelector('pre').textContent;
  var flash = function () {
    var was = btn.textContent;
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(function () { btn.textContent = was; btn.classList.remove('copied'); }, 1400);
  };
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
  document.body.removeChild(ta);
  if (ok) { flash(); return; }
  if (navigator.clipboard) { navigator.clipboard.writeText(text).then(flash); }
});
`;

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// activities.js intentionally contains inline markup (<code>, <strong>) in prose
// fields, so those are trusted and passed through. Anything that lands inside a
// <pre> is escaped — prompts and commands are literal text, never markup.
// `where` marks which shell a command belongs in. It is the single most common
// thing a first-timer gets wrong once there is a container involved, and a label on
// the block itself is harder to miss than a sentence of prose above it.
const LOCATIONS = {
  host: { cls: "host", text: "your machine" },
  container: { cls: "container", text: "in the container" },
};

function copyBlock(label, body, isPrompt, where) {
  const loc = where ? LOCATIONS[where] : null;
  const badge = loc ? `<span class="loc ${loc.cls}">${loc.text}</span>` : "";
  return `  <div class="copyblock${isPrompt ? " is-prompt" : ""}">
    <div class="cb-head"><span>${esc(label)}</span>${badge}<button type="button">Copy</button></div>
    <pre>${esc(body)}</pre>
  </div>`;
}

function page({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — OrchLab Workshop Guide</title>
<script>${HEAD_JS}</script>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
${body}
</div>
<script>${JS}</script>
</body>
</html>
`;
}

// Activity numbers are 1-based and follow the workshop's running order, which is
// the order of the array in activities.js. The same number is printed on the
// deck's ACTIVITY eyebrow, so "we're on activity four" resolves to exactly one
// card here. Keep the two in step if the running order ever changes.
const actNum = i => String(i + 1).padStart(2, "0");

const fileFor = (a, i) => `${actNum(i)}-${a.slug}.html`;

// Both label spans are always in the markup; CSS shows the right one, so the
// button reads correctly on first paint and without JavaScript running at all.
const THEME_TOGGLE = `<button class="theme-toggle" type="button" data-theme-toggle
      aria-label="Switch between light and dark theme"
    ><span class="to-dark">☀ LIGHT</span><span class="to-light">☾ DARK</span></button>`;

const siteHeader = (backLabel, L) =>
  `  <header class="site">
    <a href="${L.home}">${esc(backLabel)}</a>
    <a href="${L.platform}">SETUP</a>
    <a href="${L.links}">ALL LINKS</a>
    <span class="spacer"></span>
    ${THEME_TOGGLE}
  </header>`;

// --------------------------------------------------------- platform picker

const pathwayFor = id => PLATFORMS.find(p => p.id === id);

// shellCallout — "run these HERE, from THIS folder". Takes a pathway (which knows
// its own shell) or any object with the same two fields, so the platform panels and
// the activity pages cannot disagree about the answer.
const shellCallout = p => `      <div class="shellreq"><span class="where">Where</span>Run these in ${
  p.shell ? `<strong>${esc(p.shell)}</strong>` : "your terminal"
}${p.shellNote ? `, ${p.shellNote}` : "."}${p.cwd ? ` ${p.cwd}` : ""}</div>`;

// The two-step chooser plus every pathway panel. Rendered on both environment-setup.html and
// the environment-check activity page from the SAME data, so the commands cannot
// drift between the page that teaches the choice and the page that uses it.
function platformSwitcher() {
  const mac = pathwayFor("macos");
  const winLinux = pathwayFor("windows-linux");
  const winWindows = pathwayFor("windows-windows");

  const pathwayPanel = p => `    <div class="pathway" data-pathway="${p.id}">
      <h3>${esc(p.label)}${p.os === "windows" ? " &middot; Windows" : ""}</h3>
      <p class="confirm">${p.confirm}</p>
${shellCallout(p)}
${p.commands.map(c => copyBlock(c.label, c.code, false)).join("\n")}
${(p.notes || []).map(n => `      <div class="note">${n}</div>`).join("\n")}
    </div>`;

  return `  <div class="picker">
    <button type="button" data-pick="macos" aria-pressed="false">macOS
      <span class="sub">Docker Desktop on a Mac</span></button>
    <button type="button" data-pick="windows" aria-pressed="false">Windows
      <span class="sub">Docker Desktop on Windows 10 or 11</span></button>
  </div>

  <div data-step="mode">
    <h2>Which Docker installation do you have?</h2>
    <p>This is the question that catches people out. Docker Desktop on Windows runs
    <strong>either</strong> Linux containers <strong>or</strong> Windows containers —
    one daemon, one mode, never both — and the workshop uses a different check for
    each. Don't guess. Run this and read the one word it prints:</p>
${copyBlock("Tells you which mode Docker is in", DETECT_COMMAND)}
    <div class="picker">
      <button type="button" data-pick="windows-linux" aria-pressed="false">It printed <code>linux</code>
        <span class="sub">Linux containers — the usual setup</span></button>
      <button type="button" data-pick="windows-windows" aria-pressed="false">It printed <code>windows</code>
        <span class="sub">Windows containers — usually deliberate</span></button>
    </div>
    <div class="note">If that command errors, Docker Desktop is not running. Start it,
    wait for the whale icon to stop animating, and run it again.</div>
  </div>

  <div class="chosen" data-pick-chosen hidden>
    <span>Your pathway: <b data-pick-label
      data-label-macos="macOS"
      data-label-windows-linux="Windows, Linux containers"
      data-label-windows-windows="Windows, Windows containers"></b></span>
    <span class="spacer"></span>
    <button type="button" data-pick-reset>Change</button>
  </div>

  <p data-pick-empty>Pick your operating system above and the exact commands for your
  machine will appear here.</p>

${pathwayPanel(mac)}
${pathwayPanel(winLinux)}
${pathwayPanel(winWindows)}`;
}

fs.writeFileSync(
  path.join(PAGES, "environment-setup.html"),
  page({
    title: "Environment Setup",
    body: `${siteHeader("← ALL ACTIVITIES", FROM_PAGES)}
  <h1>Pick your operating system</h1>
  <p class="lede">The environment check is one command, but which command depends on
  your machine. Answer this once and the guide remembers it.</p>

${platformSwitcher()}

  <h2>Why this page exists</h2>
  <p>On Windows, "do you have Docker?" is not enough of a question. Docker Desktop
  runs either Linux containers or Windows containers, and it cannot do both at once.
  Every image the standard check uses is a Linux image, so running it in
  Windows-container mode fails at the build step — and it used to blame your network
  while doing it.</p>
  <p>Both checks now notice when you have run the wrong one and point you at the
  other, so a wrong guess costs you one command. But it is faster to just ask.</p>

  <div class="success">Whichever pathway you take, you are looking for the same last
  line: <strong>ALL 6 CHECKS PASSED</strong>.</div>

  <nav class="pager">
    <a href="../start-here.html">&larr; All activities</a>
    <a href="02-coding-challenges.html">Coding Challenges &rarr;</a>
  </nav>`,
  })
);

// ------------------------------------------------------------------- index

const cards = activities
  .map(
    (a, i) => `      <a class="card" href="${FROM_ROOT.page(fileFor(a, i))}">
        <span class="num">${actNum(i)}</span>
        <span class="want">${esc(a.intent)}</span>
        <span class="meta">${esc(a.title)} &middot; ${esc(a.part)}${
      a.to ? ` &middot; <span class="tag">${esc(a.to)}</span>` : ""
    }</span>
      </a>`
  )
  .join("\n");

fs.writeFileSync(
  path.join(GUIDE, "start-here.html"),
  page({
    title: "Workshop Guide",
    body: `  <header class="site">
    <a href="start-here.html">ORCHLAB WORKSHOP</a>
    <a href="pages/environment-setup.html">SETUP</a>
    <a href="pages/links.html">ALL LINKS</a>
    <span class="spacer"></span>
    ${THEME_TOGGLE}
  </header>
  <h1>What are you trying to do?</h1>
  <p class="lede">Every activity runs in this one container. Pick the thing you
  are trying to achieve — each page has the steps, every command and prompt as a
  one-click copy, and a way to catch up if you fall behind.</p>

  <div class="chosen">
    <span><strong>First time here?</strong> The setup command depends on your
    machine — and on Windows, on which Docker you have.</span>
    <span class="spacer"></span>
    <a href="pages/environment-setup.html">Pick your operating system &rarr;</a>
  </div>

  <div class="cards">
${cards}
  </div>

  <h2>The three commands</h2>
  <div class="shellreq"><span class="where">Where</span>All three run <strong>on your own
  machine</strong> — not inside a container — from the root of the
  <code>workshop-example</code> folder you cloned. That is the folder holding
  <code>verify-setup.sh</code> and <code>checkpoint.sh</code>. On Windows use
  <strong>Git Bash</strong>; on macOS, Terminal.</div>
${copyBlock("Prove your environment works — run once, before we start", "./verify-setup.sh", false, "host")}
${copyBlock("See every checkpoint and where you are", "./checkpoint.sh --list", false, "host")}
${copyBlock("Jump to checkpoint N — your work is parked first, never lost", "./checkpoint.sh 4", false, "host")}

  <h2>If you fall behind</h2>
  <p>You are never locked out. Jumping to a checkpoint commits whatever you had
  in progress to a <code>wip/</code> branch before it moves you, so you can always
  get back to it:</p>
${copyBlock("Find work an earlier jump parked for you", "./checkpoint.sh --parked", false, "host")}
  <p>Falling behind in one activity costs you that activity — nothing after it.</p>`,
  })
);

// ------------------------------------------------------------------- links

fs.writeFileSync(
  path.join(PAGES, "links.html"),
  page({
    title: "All Links",
    body: `${siteHeader("← ALL ACTIVITIES", FROM_PAGES)}
  <h1>All links</h1>
  <p class="lede">Everything the deck points at, in one place — so nothing has to
  be retyped off a slide.</p>

  <ul class="links">
${LINKS.map(
  l => `    <li>
      <span class="lbl">${esc(l.label)}</span>
${copyBlock(l.url, l.url)}
    </li>`
).join("\n")}
  </ul>

  <h2>Clone the container</h2>
${copyBlock(
  "Everything you need for the day",
  `git clone ${LINKS[0].url}.git\ncd workshop-example\ncp .env.example .env\n./verify-setup.sh`
)}`,
  })
);

// --------------------------------------------------------- activity pages

activities.forEach((a, i) => {
  const prev = i > 0 ? activities[i - 1] : null;
  const next = i < activities.length - 1 ? activities[i + 1] : null;

  const cp = [
    a.from ? `<span>start from <b>${esc(a.from)}</b></span>` : `<span>start of the day</span>`,
    a.to ? `<span>produces <b>${esc(a.to)}</b></span>` : `<span>final activity</span>`,
    // Number(...) rather than stripping "cp-0", so this keeps working past cp-09.
    a.from ? `<span>behind? <code>./checkpoint.sh ${Number(a.from.slice(3))}</code></span>` : "",
  ]
    .filter(Boolean)
    .join("\n    ");

  const section = (heading, blocks) =>
    blocks && blocks.length ? `\n  <h2>${heading}</h2>\n${blocks.join("\n")}\n` : "";

  const body = `${siteHeader("← ALL ACTIVITIES", FROM_PAGES)}
  <span class="actnum">ACTIVITY ${actNum(i)}</span>
  <p class="eyebrow">${esc(a.part)}</p>
  <h1>${esc(a.title)}</h1>
  <p class="lede">${a.summary}</p>

  <div class="cp">
    ${cp}
  </div>

  <h2>What to do</h2>
  <ol>
${a.steps.map(s => `    <li>${s}</li>`).join("\n")}
  </ol>
${a.platformSetup ? `
  <h2>Your setup, step by step</h2>
${platformSwitcher()}
` : ""}${section("Commands", [
    ...(a.where ? [shellCallout(a.where)] : []),
    ...(a.commands || []).map(c => copyBlock(c.label, c.code, false, c.where)),
  ])}${a.note ? `  <div class="note">${a.note}</div>
` : ""}${section(
    "Prompts — copy, don't retype",
    (a.prompts || []).map(p => copyBlock(p.label, p.text, true))
  )}${section("Links", (a.links || []).map(l => copyBlock(l.label, l.url, false)))}
  <h2>You are done when</h2>
  <div class="success">${a.success}</div>

  <details class="cheat">
    <summary>Stuck? Open this</summary>
    <div class="body">
${a.cheat.map(c => `      <p>${c}</p>`).join("\n")}
    </div>
  </details>

  <nav class="pager">
    ${prev ? `<a href="${fileFor(prev, i - 1)}">&larr; ${esc(prev.title)}</a>` : `<span>&larr; Back</span>`}
    ${next ? `<a href="${fileFor(next, i + 1)}">${esc(next.title)} &rarr;</a>` : `<span>Next &rarr;</span>`}
  </nav>`;

  fs.writeFileSync(path.join(PAGES, fileFor(a, i)), page({ title: a.title, body }));
});

console.log(
  `Guide written: start-here.html + pages/{environment-setup,links}.html + ${activities.length} activity pages`
);
