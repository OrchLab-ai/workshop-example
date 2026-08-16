#!/usr/bin/env node
//
// Generates the workshop how-to guide: guide/index.html, guide/links.html, and
// one page per activity. No dependencies, no build tooling — run
// `node guide/build-guide.js` and open the result with a double click.
//
// The generated files are committed so attendees never need to run this.
//
// Design constraint: the audience is on laptops. Nothing in this guide should
// ever need retyping off a slide — every command, prompt, and URL renders as a
// one-click copy block.

const fs = require("fs");
const path = require("path");
const { activities, LINKS } = require("./activities");

const OUT = __dirname;

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
function copyBlock(label, body, isPrompt) {
  return `  <div class="copyblock${isPrompt ? " is-prompt" : ""}">
    <div class="cb-head"><span>${esc(label)}</span><button type="button">Copy</button></div>
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

const siteHeader = (backLabel, backHref) =>
  `  <header class="site">
    <a href="${backHref}">${esc(backLabel)}</a>
    <a href="links.html">ALL LINKS</a>
    <span class="spacer"></span>
    ${THEME_TOGGLE}
  </header>`;

// ------------------------------------------------------------------- index

const cards = activities
  .map(
    (a, i) => `      <a class="card" href="${fileFor(a, i)}">
        <span class="num">${actNum(i)}</span>
        <span class="want">${esc(a.intent)}</span>
        <span class="meta">${esc(a.title)} &middot; ${esc(a.part)}${
      a.to ? ` &middot; <span class="tag">${esc(a.to)}</span>` : ""
    }</span>
      </a>`
  )
  .join("\n");

fs.writeFileSync(
  path.join(OUT, "index.html"),
  page({
    title: "Workshop Guide",
    body: `  <header class="site">
    <a href="index.html">ORCHLAB WORKSHOP</a>
    <a href="links.html">ALL LINKS</a>
    <span class="spacer"></span>
    ${THEME_TOGGLE}
  </header>
  <h1>What are you trying to do?</h1>
  <p class="lede">Every activity runs in this one container. Pick the thing you
  are trying to achieve — each page has the steps, every command and prompt as a
  one-click copy, and a way to catch up if you fall behind.</p>

  <div class="cards">
${cards}
  </div>

  <h2>The three commands</h2>
${copyBlock("Prove your environment works — run once, before we start", "./verify.sh")}
${copyBlock("See every checkpoint and where you are", "./checkpoint.sh --list")}
${copyBlock("Jump to checkpoint N — your work is parked first, never lost", "./checkpoint.sh 4")}

  <h2>If you fall behind</h2>
  <p>You are never locked out. Jumping to a checkpoint commits whatever you had
  in progress to a <code>wip/</code> branch before it moves you, so you can always
  get back to it:</p>
${copyBlock("Find work an earlier jump parked for you", "./checkpoint.sh --parked")}
  <p>Falling behind in one activity costs you that activity — nothing after it.</p>`,
  })
);

// ------------------------------------------------------------------- links

fs.writeFileSync(
  path.join(OUT, "links.html"),
  page({
    title: "All Links",
    body: `${siteHeader("← ALL ACTIVITIES", "index.html")}
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
  `git clone ${LINKS[0].url}.git\ncd workshop-example\ncp .env.example .env\n./verify.sh`
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

  const body = `${siteHeader("← ALL ACTIVITIES", "index.html")}
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
${section("Commands", (a.commands || []).map(c => copyBlock(c.label, c.code, false)))}${section(
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

  fs.writeFileSync(path.join(OUT, fileFor(a, i)), page({ title: a.title, body }));
});

console.log(`Guide written: index.html + links.html + ${activities.length} activity pages`);
