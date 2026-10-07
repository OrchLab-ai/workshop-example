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
const { activities, GIT_BASH, SWITCH_TO_LINUX, LINKS, PLATFORMS, DETECT_COMMAND, CREDENTIALS, SETUP_STATES, TROUBLESHOOTING, HELP, FIRST_RUN_NOTE, TERMINALS, RECOVER, CATCH_UP } = require("./activities");

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
  daily: "pages/start-your-day.html",
  page: f => `pages/${f}`,
};
const FROM_PAGES = {
  home: "../start-here.html",
  links: "links.html",
  platform: "environment-setup.html",
  daily: "start-your-day.html",
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
// never has to reason about "unset". Light is the default whatever the OS says;
// dark is the toggle, and it is remembered.
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
  --blue:        #1f5fa8;  /* 6.4:1 on white */
  --danger:      #a02e1a;  /* red — 7.2:1 on white */
  --warn-bg:     #fff4c2;  /* .warning: a yellow you can see across a room */
  --warn-edge:   #e0a800;
}
/* NO prefers-color-scheme BLOCK HERE, on purpose. Light is the guide's default
   whatever the operating system says — this is read on projectors and over
   shoulders, and it is handed to a room rather than to one person's configured
   machine. A media query flipping it would also mean the same reader gets light with
   JavaScript on and dark with it off. Dark is the toggle below, and it persists. */
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
  --blue:        #6cb4ff;
  --danger:      #ff9580;
  --warn-bg:     #3d3415;
  --warn-edge:   #ffbd2e;
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

/* look-at-it checks: a copy block's header over a numbered list, not a dark well */
.checkblock { margin: 0 0 16px; }
.checkblock .cb-head {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 8px 12px; background: var(--surface);
  border: 1px solid var(--border); border-bottom: 0;
  border-radius: 6px 6px 0 0; font-size: 13px; color: var(--text);
}
.checkblock > ol {
  margin: 0; padding: 12px 18px 12px 38px;
  border: 1px solid var(--border); border-radius: 0 0 6px 6px;
}
.checkblock li .copyblock { margin: 8px 0 4px; }
/* Where a lettered checkpoint lands, between two steps: a rule with the tag on it. */
.checkblock .rung {
  display: flex; align-items: center; gap: 10px; margin: 14px 0;
  color: var(--muted); font-size: 13px;
}
.checkblock .rung::before, .checkblock .rung::after {
  content: ""; flex: 1; border-top: 1px dashed var(--border);
}
.checkblock .rung b { color: var(--accent); }

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

/* The three windows. A numbered rail rather than prose, because it is consulted
   ("which one again?") far more often than it is read. */
.terminals {
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); padding: 15px 18px; margin: 0 0 16px;
}
.terminals .tm-intro { margin: 0 0 14px; font-size: 15px; color: var(--strong); }
.terminals .tm { display: flex; gap: 13px; align-items: baseline; margin: 0 0 12px; }
.terminals .tm:last-child { margin-bottom: 0; }
.terminals .tm > div { flex: 1 1 auto; }
.terminals .tm p { margin: 4px 0 0; font-size: 14.5px; color: var(--text); }
.terminals .tm b { color: var(--strong); font-size: 15px; }
.terminals .tm-n {
  flex: none; width: 24px; height: 24px; border-radius: 50%;
  background: var(--brand); color: var(--on-brand);
  font: 700 13px/24px ui-monospace, Menlo, monospace; text-align: center;
}
/* The badge reuses .loc, so the colour here means the same thing it means on every
   command block — which is the entire point of repeating it. */
.terminals .tm-loc { margin-left: 6px; }

/* Each window now carries the command that opens it, rather than the commands being
   a second numbered list below with the mapping left to the reader. Tightened up: a
   full-size copy block inside a step made the step look like a section. */
.terminals .copyblock { margin: 9px 0 0; }
.terminals .tm > div > div[data-only] { margin: 0; }
/* Steps are separated by the gap, not by rules — except the last one, which is the
   "did it work" check and is a different KIND of thing. */
.terminals .tm-after {
  margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--border);
}
.terminals .tm-check { background: var(--accent); color: var(--bg); }
.terminals .note { margin: 12px 0 0; }

/* Three spellings of the same slot, one per pathway; the platform script hides the
   two that do not apply. Before anything is picked all three show, which reads as
   "Terminal / Git Bash / PowerShell" and is honest rather than wrong. */
/* Separator only between VISIBLE names. A plain `+` sibling rule also fired after a
   hidden one, which left a picked Windows pathway reading "A / Git Bash window". */
.shellname:not([hidden]) ~ .shellname:not([hidden])::before { content: " / "; font-weight: 400; color: var(--muted); }

/* Two exclusive sections, styled as a choice rather than as a disclosure: full
   width, equal weight, and the closed one clearly still clickable. The point is that
   only one set of instructions is ever on screen, so the reader cannot follow the
   half that is not theirs. */
details.cred {
  border: 1px solid var(--border); border-radius: 6px; background: var(--panel);
  margin: 0 0 10px;
}
details.cred[open] { background: var(--surface); border-color: var(--accent); }
details.cred > summary {
  cursor: pointer; padding: 13px 16px; list-style: none;
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px;
}
details.cred > summary::-webkit-details-marker { display: none; }
/* The affordance has to survive the section being closed — a flat row of two closed
   details with no marker reads as two dead headings. */
details.cred > summary::before {
  content: "▸"; color: var(--accent); font-size: 12px; flex: none;
}
details.cred[open] > summary::before { content: "▾"; }
details.cred > summary b { color: var(--strong); font-size: 15px; }
details.cred > summary .hint { color: var(--muted); font-size: 13.5px; }
details.cred .cred-body {
  padding: 0 16px 15px; border-top: 1px solid var(--border); margin-top: 2px;
}
details.cred .cred-body p { margin: 12px 0 0; font-size: 14.5px; }
details.cred .cred-body .copyblock { margin: 11px 0 0; }

/* One row, above the fold on nine pages: it has to read as chrome, not as content.
   Two variants, because only one is ever visible: the "set" bar is quiet and
   ignorable; the "ask" bar is amber and is the only thing on the page until it is
   answered. */
.pathbar, .statusbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px;
  margin: 0 0 20px; padding: 8px 12px;
  border: 1px solid var(--border); border-radius: 6px; font-size: 13px;
}
.pathbar.is-set, .statusbar { background: var(--panel); }
.pathbar.is-ask {
  background: color-mix(in srgb, var(--amber) 14%, var(--bg));
  border-color: var(--amber); padding: 12px 14px;
}
.pathbar .pb-lbl, .statusbar .pb-lbl { color: var(--muted); letter-spacing: .04em; }
.pathbar .pb-cta { color: var(--amber); font-weight: 700; letter-spacing: .02em; }
.pathbar .pb-pick { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pathbar b, .statusbar b { color: var(--strong); font-size: 13.5px; }
.pathbar button, .statusbar button {
  font: inherit; cursor: pointer; padding: 4px 10px; border-radius: 4px;
  background: var(--surface); color: var(--text); border: 1px solid var(--border);
}
.pathbar button:hover, .statusbar button:hover { background: var(--surface-alt); color: var(--strong); }
.pathbar.is-ask button { border-color: var(--amber); color: var(--strong); }
.pathbar.is-ask button:hover { background: var(--amber); color: var(--bg); }
/* A link, not a fourth option: it leaves for the page that can answer the question. */
.pathbar .pb-idk {
  color: var(--amber); text-decoration: underline; text-underline-offset: 3px;
  padding: 4px 2px;
}

/* The setup-page question, asked before anything else on the page. Sized to be the
   thing you answer, not a banner you scroll past — it decides whether three quarters
   of the page is relevant. */
/* A step that is blocking the rest of the page. Amber while unanswered, and plain
   once it is not — the highlight has to leave, or every page ends up shouting. */
.stepblock { padding: 2px 0; }
.stepblock.is-ask {
  border: 1px solid var(--amber); border-radius: 6px;
  background: color-mix(in srgb, var(--amber) 9%, var(--bg));
  padding: 4px 18px 18px; margin-bottom: 22px;
}
.stepblock.is-ask > h2 { color: var(--amber); }
.stepblock .sb-why { margin: 0 0 14px; font-size: 14px; color: var(--text); max-width: 62ch; }

.setupask {
  border: 1px solid var(--accent); border-radius: 6px;
  background: var(--panel); padding: 18px 20px; margin: 0 0 22px;
}
.setupask .sa-q { margin: 0; font-size: 17px; font-weight: 700; color: var(--strong); }
.setupask .sa-d { margin: 7px 0 0; font-size: 14px; color: var(--muted); }
.setupask .sa-opts {
  display: grid; gap: 10px; margin-top: 14px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}
.setupask button {
  font: inherit; text-align: left; cursor: pointer; padding: 11px 14px; border-radius: 5px;
  background: var(--surface); color: var(--strong); border: 1px solid var(--border);
}
.setupask button:hover { background: var(--surface-alt); border-color: var(--accent); }
.setupask button .sub {
  display: block; font-weight: 400; font-size: 13px; color: var(--muted); margin-top: 4px;
}

p.tinynote { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
p.tinynote a { color: var(--accent); }

/* A recovery, not a step: same red as the troubleshooting section, smaller. */
details.trouble.compact { margin: 0 0 10px; }
details.trouble.compact > summary { padding: 12px 16px; font-size: 15px; }
details.trouble.compact > summary .cta { font-size: 13.5px; margin-top: 4px; }

/* Command groups. Subordinate to the h2 they sit under, and quieter than it — the
   headings exist to make "see Start your day below" land somewhere real, not to
   compete with the section they divide. */
h3.cmdgroup {
  font-size: 13px; margin: 22px 0 12px; color: var(--muted);
  text-transform: uppercase; letter-spacing: 1.2px; font-weight: 700;
}
h3.cmdgroup:first-of-type { margin-top: 4px; }

/* troubleshooting — the whole section is one red, collapsed <details>.
   COLLAPSED because the people who need it are a minority of the room and the page
   ends on "ALL 6 CHECKS PASSED": a passing setup should not have to scroll past
   thirteen failures to reach the pager. RED because it is the one thing on this page
   somebody scans for while something is actually broken, and red is what the eye
   finds. --danger is used in one other place only - the unanswered linux/windows
   choice in setup (.mode-pick) - and nowhere else, which is what keeps it loud. */
details.trouble {
  margin: 34px 0 0; background: var(--panel);
  border: 1px solid var(--danger); border-left: 4px solid var(--danger);
  border-radius: 0 6px 6px 0;
}
details.trouble > summary {
  cursor: pointer; padding: 16px 18px; color: var(--danger);
  font: 700 16px/1.4 inherit; list-style: none; user-select: none;
}
details.trouble > summary::-webkit-details-marker { display: none; }
details.trouble > summary::before { content: "▸ "; }
details.trouble[open] > summary::before { content: "▾ "; }
details.trouble > summary:hover { background: var(--surface); }
/* The summary is a question, and a question does not look clickable. This is the
   line that says it is — underlined, so it reads as the control it is even to
   somebody who has not registered that the whole row is a target. It flips to
   "Hide" when open, so the row never tells you to click something already showing. */
details.trouble > summary .cta {
  display: block; margin-top: 6px;
  font: 600 14.5px/1.5 inherit; color: var(--danger);
  text-decoration: underline; text-underline-offset: 3px;
}
details.trouble[open] > summary .cta::after { content: " — click again to hide"; }
details.trouble > summary .sub {
  display: block; font: 400 14px/1.5 inherit; color: var(--muted); margin-top: 5px;
}
details.trouble .tr-body { padding: 0 18px 20px; }
/* The section headings inside are h3, not h2: they sit under the summary, and the
   accent-green h2 treatment would fight the red rail around them. */
details.trouble .tr-body h3 {
  font-size: 15px; margin: 24px 0 12px; color: var(--danger);
  text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;
}
details.trouble .tr-body > h3:first-child { margin-top: 4px; }

/* one <details> per failure the check can report.
   Collapsed, because nobody reads thirteen failures they do not have: the summary
   quotes the cause line VERBATIM from verify-setup.sh so someone can scan this list
   against what is on their screen and open exactly one. Distinguished from
   details.cheat by shape rather than colour — a bordered card, not a coloured rail —
   since the two never appear on the same page and amber already means "shortcut". */
details.fix {
  margin: 0 0 10px; background: var(--panel);
  border: 1px solid var(--border); border-radius: 6px;
}
details.fix[open] { background: var(--surface); }
details.fix > summary {
  cursor: pointer; padding: 13px 16px; color: var(--strong);
  list-style: none; user-select: none; font-size: 15px;
}
details.fix > summary::-webkit-details-marker { display: none; }
details.fix > summary::before { content: "▸ "; color: var(--muted); }
details.fix[open] > summary::before { content: "▾ "; }
details.fix > summary:hover { background: var(--surface-alt); border-radius: 6px; }
details.fix .fx-check {
  display: inline-block; background: var(--surface-alt); color: var(--muted);
  font: 700 11px/1 ui-monospace, Menlo, monospace; letter-spacing: .06em;
  text-transform: uppercase; padding: 5px 8px; border-radius: 3px;
  margin-right: 10px; vertical-align: 1px;
}
details.fix[open] .fx-check { background: var(--panel); }
details.fix .fx-body { padding: 4px 16px 14px; }
details.fix .fx-body p { margin: 0 0 14px; font-size: 15px; }

/* "when to stop and ask" — an ordered list, because the order is the advice */
ol.helpsteps { padding-left: 24px; margin: 0 0 18px; }
ol.helpsteps li { margin: 0 0 12px; font-size: 15.5px; }

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

/* The linux / windows answer. Feedback from a run: people ran the detect command,
   read the word, and scrolled on without clicking either button - and everything
   after it is gated on that click, so the rest of setup looked missing. Red while
   unanswered, because it is the one thing on the page that blocks the rest; back to
   a plain frame once a button is pressed, so it stops shouting at someone who has
   done what it asked. :has() where supported; without it the box simply stays red. */
/* The one instruction a Windows-containers attendee cannot miss: switch Docker to
   Linux containers before the day. Deliberately the loudest thing in the guide. */
.bigred {
  border: 4px solid var(--danger); border-radius: 10px;
  background: color-mix(in srgb, var(--danger) 9%, var(--bg));
  padding: 20px 24px; margin: 22px 0; color: var(--strong); font-size: 16px;
}
.bigred .bigred-title {
  margin: 0 0 10px; color: var(--danger);
  font-weight: 800; font-size: 30px; line-height: 1.2; letter-spacing: -.01em;
}
.bigred ol { margin: 10px 0 16px; padding-left: 22px; font-weight: 600; }
.bigred li { margin: 6px 0; }
.bigred .bigred-detail {
  border-top: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
  padding-top: 10px; margin-top: 10px; font-size: 14.5px; color: var(--text);
}
.bigred .bigred-detail b { color: var(--danger); display: block; margin-bottom: 2px; }
.bigred .bigred-detail p { margin: 0; }

/* A one-line red exception inside a paragraph: "On Windows, run this one in
   PowerShell or CMD, not Git Bash" for claude setup-token, the single host command
   that breaks the everything-is-Git-Bash rule. A block, so it cannot be read as the
   tail of the sentence before it. */
.rednote {
  display: block; margin: 10px 0 2px; padding: 8px 12px;
  border-left: 4px solid var(--danger); border-radius: 0 6px 6px 0;
  background: color-mix(in srgb, var(--danger) 9%, var(--bg));
}
.rednote strong { color: var(--danger); }
.rednote[hidden] { display: none; }

.mode-pick {
  border: 2px solid var(--danger); border-radius: 8px;
  padding: 14px 16px 6px; margin: 16px 0 12px;
}
.mode-pick .mode-pick-prompt {
  margin: 0 0 12px; color: var(--danger); font-weight: 700;
}
.mode-pick:has(button[aria-pressed="true"]) { border-color: var(--border); }
.mode-pick:has(button[aria-pressed="true"]) .mode-pick-prompt { display: none; }

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
/* A guard against the one mistake an activity invites - louder than a .note, which
   is information. Activity 05's: pasting the finished spec into Claude starts a
   build two activities early. */
.warning {
  border: 1px solid var(--warn-edge); border-left-width: 4px; border-radius: 0 6px 6px 0;
  background: var(--warn-bg);
  padding: 12px 16px; margin: 0 0 16px; color: var(--strong); font-size: 14.5px;
}
.warning strong { color: var(--strong); }

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
/* "Git Bash", wherever the guide tells a Windows attendee which shell to open. In
   the host terminal's amber because on Windows that is exactly what it is - the
   window 1 badge and the shell's name read as the same thing. Styled like .loc, but
   not a .loc: it has no tooltip and is not a window of its own. */
.shellbadge {
  display: inline-block; background: var(--amber); color: var(--bg);
  font: 700 11px/1 ui-monospace, Menlo, monospace; letter-spacing: .06em;
  text-transform: uppercase; padding: 4px 7px; border-radius: 3px;
  margin: 0 2px; vertical-align: 1px; white-space: nowrap;
}

/* WHICH OF THE THREE WINDOWS does this command belong in. Named after the terminals
   themselves rather than after host-vs-container, because host-vs-container is not
   the question anyone gets wrong: two of the three windows are container shells, and
   badging both "in the container" answered a question nobody was asking while
   staying silent on the one that costs something. Stated on every block rather than
   once at the top of the page — by the time someone has scrolled to the third
   command they have forgotten a heading. */
.loc {
  flex: none; margin-left: auto; margin-right: 10px; padding: 3px 8px; border-radius: 3px;
  font: 700 10.5px/1 ui-monospace, Menlo, monospace; letter-spacing: .06em;
  text-transform: uppercase; white-space: nowrap;
}
/* The badge's colour, as a variable, so a block can be framed in the colour of the
   window it belongs in: the badge says which window, the frame says how far the
   instruction reaches. */
.in-host      { --win: var(--amber); }
.in-container { --win: var(--accent); }
.in-claude    { --win: #d97757; }
.in-browser   { --win: var(--blue); }
.in-editor    { --win: var(--brand); }
.copyblock[class*=" in-"], .checkblock[class*=" in-"] {
  border: 2px solid var(--win); border-radius: 8px;
}
.copyblock[class*=" in-"] .cb-head, .checkblock[class*=" in-"] .cb-head { border: 0; }
.copyblock[class*=" in-"] pre { border-radius: 0 0 6px 6px; }
.checkblock[class*=" in-"] > ol { border: 0; }
.loc.host      { background: var(--amber);  color: var(--bg); }
.loc.container { background: var(--accent); color: var(--bg); }
/* Claude's own orange, so the window Claude lives in is the one badge nobody has to
   read. Constant in both themes, like --brand. Dark text, not white: white on this
   orange is about 3:1, too faint at 10.5px; #222 is about 6:1. */
.loc.claude    { background: #d97757; color: #222222; }
/* Not a terminal at all. A URL badged "host terminal" read as a command to type into
   one, so it gets a colour none of the three windows use. */
.loc.browser   { background: var(--blue);   color: var(--bg); }
/* Your own writing - a file to fill in, or a note: the light OrchLab green, frame and header both, so it
   cannot be mistaken for the orange-framed prompts around it. */
.loc.editor    { background: var(--brand);  color: var(--on-brand); }
.copyblock.in-editor .cb-head, .checkblock.in-editor .cb-head {
  background: color-mix(in srgb, var(--brand) 22%, var(--bg));
}
/* The same badge inside a sentence: "Back in the WORK TERMINAL, press Ctrl+C". Prose
   names a window with this rather than bold text, so the word on the page looks
   exactly like the label on the block it refers to. */
.loc.inline { margin: 0 2px; vertical-align: 1px; }

/* The badge's tooltip. CSS only, so it works with JavaScript off; :focus makes it
   reachable from the keyboard and opens it on a tap. Anchored to the badge's right
   edge, because block badges sit at the right of their header; inline ones sit
   anywhere in a sentence, so they open from the left instead. */
.loc { position: relative; cursor: help; }
.loc:focus { outline: 2px solid var(--win, var(--accent)); outline-offset: 2px; }
.loc .tip {
  display: none; position: absolute; z-index: 20; top: calc(100% + 8px); right: 0;
  width: max-content; max-width: min(300px, 80vw);
  padding: 10px 12px; border-radius: 6px;
  background: var(--panel); color: var(--text);
  border: 1px solid var(--border); box-shadow: 0 6px 18px rgba(0,0,0,.18);
  font: 400 13.5px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  letter-spacing: 0; text-transform: none; white-space: normal; text-align: left;
}
.loc .tip code { font-size: 12.5px; }
.loc.inline .tip { right: auto; left: 0; }
/* :focus-within, not :focus - clicking the tip's Copy button moves focus onto it,
   and the tip must stay open while it does. */
.loc:hover .tip, .loc:focus-within .tip { display: block; }
/* Bridges the gap between badge and tip, so the pointer can travel down into the tip
   to reach Copy without crossing empty space and closing it. */
.loc .tip::before { content: ""; position: absolute; left: 0; right: 0; top: -10px; height: 10px; }
.loc .tip-cmd { display: block; margin-top: 9px; }
.loc .tip-cmd-head {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  font-size: 12px; color: var(--muted); margin-bottom: 4px;
}
.loc .tip-copy {
  flex: none; cursor: pointer; border: 1px solid var(--accent); background: transparent;
  color: var(--accent); font: 600 11px/1 inherit; padding: 4px 9px; border-radius: 4px;
}
.loc .tip-copy:hover { background: var(--accent); color: var(--bg); }
.loc .tip-copy.copied { background: var(--accent); color: var(--bg); }
.loc .tip .tip-code {
  display: block; padding: 8px 10px; border: 0; border-radius: 4px;
  background: var(--well); color: var(--well-text);
  font: 12px/1.5 ui-monospace, "SF Mono", Menlo, monospace;
  white-space: pre-wrap; word-break: break-word;
}
.shellreq .not { color: var(--amber); font-weight: 700; }

/* nav */
p.dailylink {
  margin: 0 0 14px; font-size: 13px; color: var(--muted);
}
p.dailylink a { color: var(--accent); }

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
    // LIGHT IS THE DEFAULT, not the OS preference. This guide is read on a projector
    // and over a lot of shoulders, and it is handed to a room rather than to one
    // person's configured machine. Dark is one click away and is remembered, so
    // somebody who wants it pays for it once.
    var stored = localStorage.getItem('orchlab-guide-theme');
    document.documentElement.setAttribute('data-theme', stored || 'light');
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

// The second remembered answer, on the setup page only: have you done this before?
// Kept as its own tiny state machine rather than folded into the platform one - they
// are independent questions, and the platform state already carries a half-answered
// case that has nothing to do with this.
var SETUP_KEY = 'orchlab-guide-setup';

function applySetup(state) {
  // Elements list the states they belong to, so "shown in both" is data rather than
  // a special case, and nothing is visible until the question has been answered.
  document.querySelectorAll('[data-setup]').forEach(function (el) {
    el.hidden = !state || el.getAttribute('data-setup').split(' ').indexOf(state) < 0;
  });
  document.querySelectorAll('[data-setup-empty]').forEach(function (el) {
    el.hidden = !!state;
  });
  document.querySelectorAll('[data-setup-chosen]').forEach(function (el) {
    el.hidden = !state;
  });
  document.querySelectorAll('[data-setup-label]').forEach(function (el) {
    if (state) el.textContent = el.getAttribute('data-label-' + state) || state;
  });
}

function setSetup(state) {
  try {
    if (state) localStorage.setItem(SETUP_KEY, state);
    else localStorage.removeItem(SETUP_KEY);
  } catch (e) {}
  applySetup(state || '');
}

function applyPlatform(state) {
  var os = state ? state.split('-')[0] : '';
  var final = state && state !== 'windows';

  document.querySelectorAll('[data-step="mode"]').forEach(function (el) {
    el.hidden = os !== 'windows';
  });
  document.querySelectorAll('[data-pathway]').forEach(function (el) {
    el.hidden = el.getAttribute('data-pathway') !== state;
  });
  // Troubleshooting entries, and commands that are a different language in a
  // different shell. Two rules, and the second one matters more than it looks:
  //
  //   1. Nothing is chosen  ->  show EVERYTHING. Somebody who scrolled to
  //      "Something went wrong?" without answering the picker is the person most
  //      likely to be stuck, and hiding every fix from them would be perverse.
  //   2. Half-answered ('windows', OS known but container mode not) -> show both
  //      Windows pathways' entries, because either could still turn out to apply.
  //
  // Same show-by-default contract as the pathway panels: the attribute is inert
  // markup, and only this script ever hides anything.
  document.querySelectorAll('[data-only]').forEach(function (el) {
    var ids = el.getAttribute('data-only').split(' ').filter(Boolean);
    var show;
    if (!state) show = true;
    else if (ids.indexOf(state) >= 0) show = true;
    else if (final) show = false;
    else show = ids.some(function (id) { return id.split('-')[0] === os; });
    el.hidden = !show;
  });
  document.querySelectorAll('[data-pick-empty]').forEach(function (el) {
    el.hidden = !!final;
  });
  // Page content that only makes sense once a pathway is known. Held back rather than
  // shown three ways at once: with nothing chosen, every gated fix and command on the
  // page renders all of its variants, and the reader has no way to tell which is
  // theirs. The bar above says so in amber and is one click to resolve.
  document.querySelectorAll('[data-needs-pathway]').forEach(function (el) {
    el.hidden = !final;
  });
  // The section that ASKS stays visible and goes amber instead of being swapped for
  // another element: it is the one thing on the page that must not disappear, and a
  // page whose only remaining content is unmarked reads as broken rather than as
  // waiting for an answer.
  document.querySelectorAll('[data-pick-highlight]').forEach(function (el) {
    if (final) el.classList.remove('is-ask');
    else el.classList.add('is-ask');
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

  // WHICH DEFAULT depends on how you got here, because the same page serves two
  // arrivals. The SETUP link and the pre-workshop invite are people setting a machine
  // up, so the full guide is what they want and asking first is a wasted click. The
  // "I want to prove my setup works" card is opened ON the day by someone who may or
  // may not be set up — that one carries ?ask and gets the question.
  //
  // The default is NOT written to storage: it stays a default, so arriving later from
  // the card still asks rather than replaying a choice nobody made.
  var setup = '';
  try { setup = localStorage.getItem(SETUP_KEY) || ''; } catch (err) {}
  if (!setup && !/[?&]ask(=|&|$)/.test(location.search)) setup = 'fresh';
  // THE PRE-WORKSHOP LINK: ?setup=fresh. Sent out before the day, so it must show the
  // whole setup whatever this browser answered last time - a facilitator who clicked
  // "just run the check" while testing would otherwise see, and forward, the short
  // version. Like the default above it is NOT stored: it answers for this visit only.
  var forced = /[?&]setup=(fresh|done)(&|$)/.exec(location.search);
  if (forced) setup = forced[1];
  applySetup(setup);

  // "Windows — not sure which" on any pathway bar sends people here with the OS
  // half-answered, which is exactly the state that reveals the container-mode
  // question. Applied after the above so it wins, and scrolled to because the
  // question sits below the fold on the page it lands on.
  if (/[?&]os=windows(&|$)/.test(location.search)) {
    // FORCE THE FULL-SETUP BRANCH FIRST. The container-mode question lives inside
    // step 1, which the "already set up" branch does not render — so a reader who had
    // answered "just run the check" and then clicked "not sure which" landed on this
    // page, scrolled to an element that was hidden, and saw nothing happen. The link
    // exists precisely because they cannot answer the pathway question, and the only
    // place that answers it is step 1.
    setSetup('fresh');
    setPlatform('windows');
    var mode = document.getElementById('docker-mode');
    if (mode) setTimeout(function () { mode.scrollIntoView({ block: 'center' }); }, 0);
  }
})();

document.addEventListener('click', function (e) {
  var toggle = e.target.closest('[data-theme-toggle]');
  if (toggle) {
    var root = document.documentElement;
    // The boot script always stamps the attribute, so there is no unset case to
    // resolve here — and no second copy of the default rule to fall out of step.
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('orchlab-guide-theme', next); } catch (err) {}
    return;
  }

  // Exclusive accordions. Modern browsers do this natively via <details name>, and
  // on those this listener is a no-op because they have already closed the sibling.
  // Where the attribute is unsupported it would otherwise degrade to every section
  // open at once, which is the exact state these sections exist to prevent: the
  // reader seeing both credentials and following the wrong one.
  var toggled = e.target.closest('details[data-exclusive] > summary');
  if (toggled) {
    var d = toggled.parentNode;
    if (!d.open) {
      var group = d.getAttribute('data-exclusive');
      document.querySelectorAll('details[data-exclusive="' + group + '"]').forEach(function (other) {
        if (other !== d) other.open = false;
      });
    }
  }

  var pick = e.target.closest('[data-pick]');
  if (pick) {
    setPlatform(pick.getAttribute('data-pick'));
    return;
  }
  var setup = e.target.closest('[data-setup-pick]');
  if (setup) {
    setSetup(setup.getAttribute('data-setup-pick'));
    return;
  }
  if (e.target.closest('[data-setup-reset]')) {
    setSetup(null);
    return;
  }
  if (e.target.closest('[data-pick-reset]')) {
    setPlatform(null);
    return;
  }

  // A badge tooltip's Copy first: it sits INSIDE a copy block's header, so the
  // general selector below would match it too and copy the block's command instead.
  var btn = e.target.closest('.tip-copy') || e.target.closest('.copyblock button');
  if (!btn) return;
  var text = btn.classList.contains('tip-copy')
    ? btn.closest('.tip').querySelector('.tip-code').textContent
    : btn.closest('.copyblock').querySelector('pre').textContent;
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

// Quotes are escaped as well as angle brackets, because two call sites drop this
// straight into an attribute value (`data-only="..."`, `data-label-x="..."`) and a
// quote in the source text would end the attribute early and turn the rest of the
// string into markup. Escaping here rather than at those two sites means the next
// attribute written with esc() is safe without anyone having to notice that it is an
// attribute. In element text &quot; renders as a quote, so nothing else changes.
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// activities.js intentionally contains inline markup (<code>, <strong>) in prose
// fields, so those are trusted and passed through. Anything that lands inside a
// <pre> is escaped — prompts and commands are literal text, never markup.
// `where` marks which shell a command belongs in. It is the single most common
// thing a first-timer gets wrong once there is a container involved, and a label on
// the block itself is harder to miss than a sentence of prose above it.
//
// `tip` is what the badge says when you hover or tap it. It replaced a "Where" callout
// at the top of every activity: the badge is where the eye already is when the
// question comes up, and a paragraph at the top of the page had scrolled away by then.
// No per-pathway shell name in a tip: badges appear on pages with no pathway bar
// (start-here.html), where there is nothing to pick the variant.
const LOCATIONS = {
  host: {
    cls: "host",
    text: "host terminal",
    tip: "Window 1. A terminal on your own machine, in your <code>workshop-example</code> folder — <em>not</em> inside the container. Only <code>docker</code> and <code>./checkpoint.sh</code> run here.",
  },
  container: {
    cls: "container",
    text: "work terminal",
    tip: "Window 2. A shell inside the container: tests, <code>./scripts/ci-check.sh</code>, git, and anything else that needs to see the app's code.",
  },
  claude: {
    cls: "claude",
    text: "claude terminal",
    tip: "Window 3. Claude, already running inside the container. Paste prompts here — and do not exit it to run a command; use the work terminal for that.",
  },
  // Your own writing, not a command: Activity 04's note and Activity 05's spec
  // template. Badged "claude terminal" the template read as a prompt, and pasting it
  // starts a build two activities early.
  editor: {
    cls: "editor",
    text: "text editor",
    tip: "Not a terminal. Your own editor, on your machine — <code>app/</code> in your <code>workshop-example</code> folder is the same folder the container sees.",
  },
  browser: {
    cls: "browser",
    text: "your browser",
    tip: "Not a terminal. Open this in your web browser.",
  },
};

// The command that opens a window, for its tooltip - so somebody who closed the work
// or Claude terminal gets it back from the badge in front of them. Read from TERMINALS
// rather than written again here, so the tip cannot drift from start-your-day. Only
// windows 2 and 3: window 1 is a plain terminal, and its listed command (up.sh)
// starts the stack rather than opening the window.
const openCommand = where =>
  where === "host" ? null : ((TERMINALS.list.find(t => t.where === where) || {}).commands || [])[0];

// Every badge on every page comes from here, so every badge has its tooltip. It is
// focusable, so the tip also opens from the keyboard and on a tap on a phone.
const badge = (where, extra = "") => {
  const loc = LOCATIONS[where];
  if (!loc) throw new Error(`unknown window badge "${where}"`);
  const open = openCommand(where);
  const cmd = open
    ? `<span class="tip-cmd"><span class="tip-cmd-head">Closed it? Reopen it from the host terminal<button type="button" class="tip-copy">Copy</button></span><code class="tip-code">${esc(open.code)}</code></span>`
    : "";
  return `<span class="loc ${loc.cls}${extra ? ` ${extra}` : ""}" tabindex="0">${loc.text}<span class="tip" role="tooltip">${loc.tip}${cmd}</span></span>`;
};

function copyBlock(label, body, isPrompt, where) {
  const loc = where ? LOCATIONS[where] : null;
  return `  <div class="copyblock${isPrompt ? " is-prompt" : ""}${loc ? ` in-${loc.cls}` : ""}">
    <div class="cb-head"><span>${esc(label)}</span>${loc ? badge(where) : ""}<button type="button">Copy</button></div>
    <pre>${esc(body)}</pre>
  </div>`;
}

// A check that is something to LOOK at rather than something to run: numbered steps
// under the same badged header a copy block has. A step that needs a command carries
// it as { text, code }, and the command renders INSIDE that step - a list of steps
// with the commands collected underneath left the reader matching them up. A step
// with prompt: true frames its code as a prompt, so an activity whose prompts and
// commands alternate (build, run, look, restrict, run again) reads in one order.
function checkBlock(c, rungs) {
  rungs = Array.isArray(rungs) ? rungs : []; // also called from .map(), which passes an index
  const loc = c.where ? LOCATIONS[c.where] : null;
  const step = s =>
    typeof s === "string" || s.code === undefined // a step to read or think, with nothing to copy
      ? `      <li>${typeof s === "string" ? s : s.text}</li>`
      : `      <li>${s.text}\n${copyBlock(s.label || "", s.code, !!s.prompt, s.where || c.where)}\n      </li>`;
  return `  <div class="checkblock${loc ? ` in-${loc.cls}` : ""}">
    <div class="cb-head"><span>${esc(c.label)}</span>${loc ? badge(c.where) : ""}</div>
    <ol>
${c.steps
  .map((s, i) => {
    // A rung that starts at step N splits the list just before it, and the list
    // carries on numbering from N, so the steps keep their numbers. The tag only: the
    // command stays in the catch-up, where only someone who fell behind reaches for it.
    const r = rungs.find(m => m.step === i + 1);
    return r
      ? `    </ol>
    <div class="rung"><span>checkpoint <b>${esc(r.tag)}</b> starts here</span></div>
    <ol start="${i + 1}">
${step(s)}`
      : step(s);
  })
  .join("\n")}
    </ol>
  </div>`;
}

// {loc:host|container|claude|browser} in any prose becomes that window's badge,
// inline. Expanded once over the whole page, so a token works in every data field
// without each renderer having to know about it.
const inlineBadges = html =>
  html.replace(/\{loc:(\w+)\}/g, (m, k) => badge(k, "inline"));

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
${inlineBadges(body)}
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
// The team activity sits in the running order but takes no number - the deck calls it
// TEAM ACTIVITY, not ACTIVITY 03 - so numbers count the numbered activities only, and
// adding it moved nothing after it.
const numberOf = new Map(
  activities.filter(a => !a.team).map((a, n) => [a, String(n + 1).padStart(2, "0")])
);
const actNum = a => numberOf.get(a);
// What the reader SEES as the number, which is not always the file's. The environment
// check and the morning start are two halves of activity 01 in the deck - 01a once
// ever, 01b every day - so they are numbered as a pair, and the next activity is
// still 02. File names keep actNum: renaming files breaks every link already sent out.
const shownNum = a => (a.team ? "TEAM" : a.platformSetup ? `${actNum(a)}a` : actNum(a));
// start-your-day.html is not an activity, but it is card 01b and it says so.
const DAILY_NUM = "01b";

// Normally NN-slug.html. The environment check overrides it to environment-setup.html
// because that page is BOTH activity 1 and the pre-workshop setup instructions, and it
// was being generated twice: once as an activity page and once standalone, from the
// same PLATFORMS data, with a different half of the content on each. Attendees hit
// whichever one they happened to be linked to and got a different story. One file.
const fileFor = a => a.page || `${actNum(a)}-${a.slug}.html`;

// Both label spans are always in the markup; CSS shows the right one, so the
// button reads correctly on first paint and without JavaScript running at all.
const THEME_TOGGLE = `<button class="theme-toggle" type="button" data-theme-toggle
      aria-label="Switch between light and dark theme"
    ><span class="to-dark">☀ LIGHT</span><span class="to-light">☾ DARK</span></button>`;

const siteHeader = (backLabel, L) =>
  `  <header class="site">
    <a href="${L.home}">${esc(backLabel)}</a>
    <a href="${L.platform}">SETUP</a>
    <a href="${L.daily}">START YOUR DAY</a>
    <a href="${L.links}">ALL LINKS</a>
    <span class="spacer"></span>
    ${THEME_TOGGLE}
  </header>`;

// --------------------------------------------------------- platform picker

const pathwayFor = id => PLATFORMS.find(p => p.id === id);

// shellCallout — "run these HERE, from THIS folder". Takes a pathway (which knows
// its own shell) or any object with the same two fields, so the platform panels and
// the activity pages cannot disagree about the answer.
const shellCallout = p => `      <div class="shellreq"><span class="where">Where</span>${
  p.shell
    ? `Run these in ${shellLabel(p.shell)}${p.shellNote ? `, ${p.shellNote}` : "."}${
        p.cwd ? ` ${p.cwd.replace("{shell}", shellName())}` : ""
      }`
    : p.cwd.replace("{shell}", shellName())
}</div>`;

// Wrap a block so it is shown only on the given pathways. No `only` means always.
// data-only goes on a WRAPPER rather than on the block itself, so the gating stays
// one rule: applyPlatform only ever sets .hidden on [data-only], and never has to
// know what kind of element it is hiding.
const onlyWrap = (only, html) =>
  only ? `      <div data-only="${only.join(" ")}">\n${html}\n      </div>` : html;

// The terminal application, per pathway, rendered from PLATFORMS so the window
// somebody is told to open each morning is the one their setup pathway told them to
// use. With nothing picked yet all three are visible, which reads as
// "Terminal / Git Bash / PowerShell" — true, and better than naming one and being
// wrong for two thirds of the room.
// `day` picks the shell for the workshop itself rather than for setup - they differ
// only on windows-windows, which runs its check in PowerShell and its day in Git Bash.
const shellName = (day = false) =>
  PLATFORMS.map(
    p => `<span class="shellname" data-only="${p.id}">${shellLabel((day && p.dayShell) || p.shell)}</span>`
  ).join("");

// Git Bash gets the badge; the other shells stay bold text. It is the one name a
// Windows attendee must not substitute, so it is the one that has to stand out.
const shellLabel = name =>
  name === "Git Bash" ? GIT_BASH : `<strong>${esc(name)}</strong>`;

// The credential, as two sections of which at most one is open.
//
// <details name="..."> is the native exclusive accordion, so the "one at a time"
// behaviour survives JavaScript being off. A four-line fallback in JS covers
// browsers that predate the attribute, where it would otherwise degrade to both
// sections open at once - which is exactly the state this is meant to prevent.
const credentials = () => `  <p class="lede">${CREDENTIALS.intro}</p>
${CREDENTIALS.options
  .map(
    o => `  <details class="cred" name="credential" data-exclusive="credential"${o.open ? " open" : ""}>
    <summary>
      <b>${esc(o.summary)}</b>
      <span class="hint">${esc(o.hint)}</span>
    </summary>
    <div class="cred-body">
      <p>${o.body}</p>
${o.command ? copyBlock(o.command.label, o.command.code, false, o.command.where) : ""}
      <p>${o.after}</p>
    </div>
  </details>`
  )
  .join("\n")}
  <div class="note">${CREDENTIALS.warning}</div>`;

// The picker, in its compact form: enough to CHANGE the answer and to make the
// current one visible, without re-teaching the choice. Reads and writes the same
// localStorage key as the full switcher on the setup page, so answering it in either
// place answers it in both.
// The pathway bar: one compact row at the top of every page that has anything
// platform-specific on it.
//
// WHY IT IS NOT THE FULL PICKER. It sits above the fold on nine pages; it has to be
// a strip, not a section. And it is deliberately ABSENT from the setup page, where
// the full picker is the content — a "your pathway: macOS / Change" line directly
// above the buttons that set it is pure noise.
//
// THREE BUTTONS, NOT TWO. Answering "Windows" alone leaves the half-answered state,
// which is not a pathway — so the strip would have nothing to show and would look
// broken to the person who had just clicked it. The setup page can afford to ask the
// container-mode question properly; here the two Windows answers are just both
// offered, and one click always lands on a real pathway.
// Step 4, rendered separately from steps 1-2 so the credential section can sit
// between them. It used to be the last command inside each pathway panel, which put
// "Run the check" on screen above the section explaining what the check reads out of
// .env - so the obvious thing to do was run it, and the obvious result was check 4
// failing for want of a credential nobody had been told about yet.
// The big red "switch to Linux containers" box. See SWITCH_TO_LINUX in activities.js.
const switchToLinux = () => `      <div class="bigred" role="note">
        <p class="bigred-title">${esc(SWITCH_TO_LINUX.title)}</p>
        <p>${SWITCH_TO_LINUX.body}</p>
        <ol>
${SWITCH_TO_LINUX.steps.map(s => `          <li>${s}</li>`).join("\n")}
        </ol>
${SWITCH_TO_LINUX.details.map(d => `        <div class="bigred-detail"><b>${esc(d.h)}</b><p>${d.text}</p></div>`).join("\n")}
      </div>`;

const runTheCheck = () =>
  PLATFORMS.map(
    p => `    <div class="pathway" data-pathway="${p.id}">
${p.checkCommands.map(c => copyBlock(c.label, c.code, false, "host")).join("\n")}${
  p.afterCheck ? `\n${switchToLinux()}` : ""
}
    </div>`
  ).join("\n") +
  `\n  <p data-pick-empty class="tinynote">Pick your operating system above to see the
  exact command for your machine.</p>`;

// `L` is the caller's link set: the bar renders at two directory depths, and the
// escape hatch below is a real link to another page rather than a state change.
const platformStrip = (L = FROM_PAGES) => `  <div class="pathbar is-set" data-pick-chosen hidden>
    <span class="pb-lbl">Your pathway</span>
    <b data-pick-label
      data-label-macos="macOS"
      data-label-windows-linux="Windows &middot; Linux containers"
      data-label-windows-windows="Windows &middot; Windows containers"></b>
    <button type="button" data-pick-reset>Change</button>
  </div>
  <div class="pathbar is-ask" data-pick-empty>
    <span class="pb-cta">Pick your pathway to continue</span>
    <span class="pb-pick">
      <button type="button" data-pick="macos" aria-pressed="false">macOS</button>
      <button type="button" data-pick="windows-linux" aria-pressed="false">Windows &middot; Linux containers</button>
      <button type="button" data-pick="windows-windows" aria-pressed="false">Windows &middot; Windows containers</button>
      <!-- Not a third guess. Windows attendees genuinely do not know which container
           mode Docker is in — that is why the setup page has them RUN a command rather
           than choose. Guessing here would send them down a pathway whose every
           command is wrong for them; this sends them to the question. -->
      <a class="pb-idk" href="${L.platform}?os=windows#docker-mode">Windows &mdash; not sure which</a>
    </span>
  </div>`;

// The setup-page-only question. Rendered above everything, because the answer decides
// whether three quarters of the page is relevant at all.
const setupAsk = () => `  <div class="setupask" data-setup-empty>
    <p class="sa-q">${esc(SETUP_STATES.question)}</p>
    <p class="sa-d">${SETUP_STATES.detail}</p>
    <div class="sa-opts">
${SETUP_STATES.options
  .map(
    o => `      <button type="button" data-setup-pick="${o.id}">${esc(o.label)}
        <span class="sub">${o.sub}</span></button>`
  )
  .join("\n")}
    </div>
  </div>
  <div class="statusbar" data-setup-chosen hidden>
    <span class="pb-lbl">Showing</span>
    <b data-setup-label
${Object.entries(SETUP_STATES.labels)
  .map(([k, v]) => `      data-label-${k}="${esc(v)}"`)
  .join("\n")}></b>
    <button type="button" data-setup-reset>Change</button>
  </div>`;

// The two-step chooser plus every pathway panel. Rendered on both environment-setup.html and
// the environment-check activity page from the SAME data, so the commands cannot
// drift between the page that teaches the choice and the page that uses it.
// Split in two, because the two halves are two different STEPS. Kept as one function
// they rendered under one heading, so the page's numbered sequence began at "Step 3"
// with steps 1 and 2 present only as small labels on copy blocks inside it.
//
// platformPicker  - step 1: answer the question (and, on Windows, the second one).
// platformPanels  - step 2: the commands that answer produces.

function platformPicker() {
  return `  <div class="picker">
    <button type="button" data-pick="macos" aria-pressed="false">macOS
      <span class="sub">Docker Desktop on a Mac</span></button>
    <button type="button" data-pick="windows" aria-pressed="false">Windows
      <span class="sub">Docker Desktop on Windows 10 or 11</span></button>
  </div>

  <div data-step="mode" id="docker-mode">
    <h3>Which Docker installation do you have?</h3>
    <p>This is the question that catches people out. Docker Desktop on Windows runs
    <strong>either</strong> Linux containers <strong>or</strong> Windows containers —
    one daemon, one mode, never both — and the workshop uses a different check for
    each. Don't guess. Run this and read the one word it prints:</p>
${copyBlock("Tells you which mode Docker is in", DETECT_COMMAND)}
    <div class="mode-pick">
      <p class="mode-pick-prompt">Now pick the button that matches what it printed — <code>linux</code> or <code>windows</code>. The rest of setup stays hidden until you do.</p>
      <div class="picker">
        <button type="button" data-pick="windows-linux" aria-pressed="false">It printed <code>linux</code>
          <span class="sub">Linux containers — the usual setup</span></button>
        <button type="button" data-pick="windows-windows" aria-pressed="false">It printed <code>windows</code>
          <span class="sub">Windows containers — usually deliberate</span></button>
      </div>
    </div>
    <div class="note">If that command errors, Docker Desktop is not running. Start it,
    wait for the whale icon to stop animating, and run it again.</div>
  </div>`;
}

function platformPanels() {
  const pathwayPanel = p => `    <div class="pathway" data-pathway="${p.id}">
      <h3>${esc(p.label)}${p.os === "windows" ? " &middot; Windows" : ""}</h3>
      <p class="confirm">${p.confirm}</p>
${shellCallout(p)}
${p.commands.map(c => copyBlock(c.label, c.code, false)).join("\n")}
${(p.notes || []).map(n => `      <div class="note">${n}</div>`).join("\n")}
    </div>`;

  // No "pick one above" line here: this whole block is behind the pathway gate, so
  // that message was only ever rendered to people who had already answered. It lives
  // in the step-1 block now, where it can actually be seen.
  return PLATFORMS.map(pathwayPanel).join("\n");
}

// --------------------------------------------------------- troubleshooting

// Every failure, then the escalation path. Ordered by where it bites — a failure at
// check 1 is read by somebody who has not got as far as check 2.
function troubleshooting() {
  // `only` is rendered as an attribute rather than resolved here, because the choice
  // is made in the browser and remembered across pages — the generator cannot know
  // it. Absent attribute means "always", which is what keeps the no-JS case whole.
  const gate = o => (o ? ` data-only="${esc(o.join(" "))}"` : "");

  // A command that differs only by shell is wrapped rather than passed through
  // copyBlock, so copyBlock keeps one job and the markup it emits stays identical
  // everywhere it is used.
  const command = c =>
    c.only
      ? `  <div${gate(c.only)}>\n${copyBlock(c.label, c.code, false, "host")}\n  </div>`
      : copyBlock(c.label, c.code, false, "host");

  const entry = t => `    <details class="fix"${gate(t.only)}>
      <summary><span class="fx-check">${esc(t.check)}</span>${esc(t.symptom)}</summary>
      <div class="fx-body">
        <p>${t.fix}</p>${(t.commands || []).map(c => `\n${command(c)}`).join("")}
      </div>
    </details>`;

  return `  <details class="trouble">
    <summary>Something went wrong?
      <span class="cta">Click here to show the troubleshooting guide</span>
      <span class="sub">Every failure the check can report, what it means, and when to stop and ask.</span>
    </summary>
    <div class="tr-body">
      <h3 id="what-could-go-wrong">What could go wrong, and how to fix it</h3>
      <p>The check stops at the <strong>first</strong> failure and prints what went wrong
      and what to do about it, so you are never reading a stack trace. Every failure it can
      report is below, quoted the way it appears on your screen — find yours, open it, and
      do the one thing it says.</p>
      <div class="note">${HELP.logsNote}</div>

${TROUBLESHOOTING.map(entry).join("\n")}

      <h3 id="getting-help">When to stop and ask</h3>
      <p>There is a right moment to stop debugging this yourself, and it is earlier than
      most people think.</p>
      <ol class="helpsteps">
${HELP.steps.map(s => `        <li>${s}</li>`).join("\n")}
      </ol>
      <div class="note">${HELP.note}</div>

      <div class="success">${HELP.onTheDay}</div>
    </div>
  </details>
`;
}

// ------------------------------------------------------------------- index

// ONE LIST, NUMBERED LIKE THE DECK. Setup and the morning start used to sit above the
// cards as two unnumbered callouts, which gave the slides' "01a" and "01b" nothing to
// point at. They are now cards 01a and 01b, in the order they are done.
//
// 01a carries ?ask: somebody arriving from the index may or may not be set up, so the
// page asks before it shows anything. The SETUP link in the header is for people who
// are setting up, and goes straight to the full guide.
const dailyCard = `      <a class="card" href="${FROM_ROOT.daily}">
        <span class="num">${DAILY_NUM}</span>
        <span class="want">I want to start my day</span>
        <span class="meta">Start Your Day &middot; every morning, before any activity</span>
      </a>`;

const cards = activities
  .map(
    (a, i) => `      <a class="card" href="${FROM_ROOT.page(fileFor(a))}${a.platformSetup ? "?ask" : ""}">
        <span class="num">${shownNum(a)}</span>
        <span class="want">${esc(a.intent)}</span>
        <span class="meta">${esc(a.title)} &middot; ${esc(a.part)}${
      a.to && !a.noCode ? ` &middot; <span class="tag">${esc(a.to)}</span>` : ""
    }</span>
      </a>${a.platformSetup ? `\n${dailyCard}` : ""}`
  )
  .join("\n");

fs.writeFileSync(
  path.join(GUIDE, "start-here.html"),
  page({
    title: "Workshop Guide",
    body: `  <header class="site">
    <a href="start-here.html">ORCHLAB WORKSHOP</a>
    <a href="${FROM_ROOT.platform}">SETUP</a>
    <a href="${FROM_ROOT.daily}">START YOUR DAY</a>
    <a href="${FROM_ROOT.links}">ALL LINKS</a>
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

  <!-- NO COMMAND LIST HERE. The index answers "what am I trying to do"; every
       command belongs on the page for the thing it does — verify-setup.sh on the
       setup page, the morning three on start-your-day, checkpoint.sh on the activity
       that needs it. Reproducing them at the bottom of the index made this page the
       fourth place ./verify-setup.sh was written down, and the one place with no
       surrounding instructions to make it correct. It also dragged the whole platform
       picker onto a page that otherwise has nothing platform-specific on it. -->
  <h2>If you fall behind</h2>
  <p>You are never locked out. Jumping to a checkpoint commits whatever you had
  in progress to a <code>wip/</code> branch before it moves you, so you can always
  get back to it:</p>
${copyBlock("Find work an earlier jump parked for you", "./checkpoint.sh --parked", false, "host")}
  <p>Falling behind in one activity costs you that activity — nothing after it.</p>`,
  })
);

// "Which of my three windows does this go in?" — the question behind almost every
// wrong-terminal mistake. The badges on each command answer host vs container; this
// answers which CONTAINER shell, which the badges cannot.
const terminalsCallout = () => `  <div class="terminals">
  <p class="tm-intro">${TERMINALS.intro}</p>
${onlyWrap(TERMINALS.note.only, switchToLinux())}
${onlyWrap(TERMINALS.windowsShell.only, `    <div class="shellreq"><span class="where">Windows</span>${TERMINALS.windowsShell.body}</div>`)}
${TERMINALS.list
.map(
  t => `    <div class="tm">
    <span class="tm-n">${esc(t.n)}</span>
    <div>
      <b>${esc(t.title)}</b> ${badge(t.where, "tm-loc")}
      <p>${t.body.replace("{shell}", shellName(true))}</p>
${(t.commands || []).map(c => onlyWrap(c.only, copyBlock(c.label, c.code, false, c.where))).join("\n")}${
  // Terminal 3 carries the flag, so terminal 3 carries the explanation. Attached to
  // the terminal rather than dropped at the end of the list, so the command and the
  // reason for it are never separated by two other windows.
  t.where === "claude" ? `\n      <div class="note">${TERMINALS.flagNote}</div>` : ""
}
    </div>
  </div>`
)
.join("\n")}
  <div class="tm tm-after">
    <span class="tm-n tm-check">&#10003;</span>
    <div>
      <p>${TERMINALS.after.body}</p>
${copyBlock(TERMINALS.after.command.label, TERMINALS.after.command.code, false, TERMINALS.after.command.where)}
    </div>
  </div>
</div>`;

// cp-04 -> `./checkpoint.sh 4`. Derived rather than written down a second time: the
// activity already declares which checkpoint it starts from, and a hand-written
// command beside it is a second copy waiting to drift.
// The lettered rungs inside an activity (cp-08a, cp-08b, cp-08c), read from the manifest -
// the single source of truth checkpoint.sh also reads - so a rung added there shows
// up here with no second copy to keep in step. Each becomes "./checkpoint.sh 8a".
const MANIFEST_ROWS = fs
  .readFileSync(path.join(__dirname, "..", "..", "checkpoints", "manifest.txt"), "utf8")
  .split("\n")
  .filter(l => /^cp-/.test(l))
  .map(l => l.split("|").map(c => c.trim()))
  .map(([tag, title, , next]) => ({ tag, title, next }));
const midRungs = a =>
  MANIFEST_ROWS.filter(r => a.to && new RegExp(`^${a.to}[a-z]$`).test(r.tag)).map(r => ({
    ...r,
    jump: r.tag.replace(/^cp-0?/, ""),
    // "Activity 08, step 2 — Run it" -> "step 2 — Run it"
    where: r.next.replace(/^Activity \d+, /, ""),
    step: Number((r.next.match(/step (\d+)/) || [])[1]),
  }));

const catchUpBlock = a => {
  if (!a.from || a.noCode) return "";
  const rung = Number(a.from.replace("cp-", ""));
  if (!Number.isInteger(rung)) throw new Error(`${a.slug}: cannot read a rung out of from: "${a.from}"`);
  const mids = midRungs(a);
  return `  <details class="trouble compact">
  <summary>${esc(mids.length ? CATCH_UP.summaryWithRungs : CATCH_UP.summary)}
    <span class="cta">${esc(CATCH_UP.cta)}</span>
  </summary>
  <div class="tr-body">
    <p>${CATCH_UP.body}</p>
${copyBlock(CATCH_UP.label, `./checkpoint.sh ${rung}`, false, CATCH_UP.where)}${
    mids.length
      ? `
    <p>${CATCH_UP.rungsBody}</p>
${mids.map(m => copyBlock(`${m.title}: start at ${m.where}`, `./checkpoint.sh ${m.jump}`, false, CATCH_UP.where)).join("\n")}`
      : ""
  }
  </div>
</details>
`;
};

const recoverBlock = () => `  <details class="trouble compact">
  <summary>${esc(RECOVER.summary)}
    <span class="cta">${esc(RECOVER.cta)}</span>
  </summary>
  <div class="tr-body">
    <p>${RECOVER.body}</p>
${copyBlock(RECOVER.command.label, RECOVER.command.code, false, RECOVER.command.where)}
  </div>
</details>`;

// --------------------------------------------------------- start your day

fs.writeFileSync(
  path.join(PAGES, "start-your-day.html"),
  page({
    title: "Start Your Day",
    body: `${siteHeader("← ALL ACTIVITIES", FROM_PAGES)}
${platformStrip()}
  <div data-needs-pathway>
  <span class="actnum">ACTIVITY ${DAILY_NUM}</span>
  <h1>Start your day</h1>
  <p class="lede">Three windows, one command each. Do this once every morning and
  leave all three open — every activity assumes it.</p>

  <h2>Three terminals</h2>
${terminalsCallout()}

  <div class="note">${FIRST_RUN_NOTE}</div>

  <h2>If the app stops working</h2>
  <p>This is a recovery, not part of starting up — you should not need it on a normal
  morning, and running it on a healthy container just restarts the app for no reason.</p>
${recoverBlock()}

  <h2>Reading the badges</h2>
  <p>Every command block in this guide carries the badge of the window it belongs in:
  <span class="loc host">host terminal</span>, <span class="loc container">work terminal</span>
  or <span class="loc claude">claude terminal</span>. There is nothing to work out —
  match the badge to the window and run it there. A web address carries
  <span class="loc browser">your browser</span> instead: open it there, not in a terminal.</p>
  <p>The badges used to say <em>your machine</em> and <em>in the container</em>, which
  named the two container shells identically. That answered the question nobody gets
  wrong and stayed silent on the one that costs something: the Claude terminal is the
  one where exiting to run a quick command throws away the conversation.</p>

  <div class="success">You are ready when <code>http://localhost:5173</code> loads in
  your browser and you have a <code>claude</code> prompt waiting in terminal 3.</div>

  </div>

  <nav class="pager">
    <a href="environment-setup.html">&larr; Setup</a>
    <a href="02-coding-challenges.html">Coding Challenges &rarr;</a>
  </nav>`,
  })
);

// ------------------------------------------------------------------- links

fs.writeFileSync(
  path.join(PAGES, "links.html"),
  page({
    title: "All Links",
    body: `${siteHeader("← ALL ACTIVITIES", FROM_PAGES)}
${platformStrip()}
  <div data-needs-pathway>
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
${onlyWrap(
  ["macos", "windows-linux"],
  copyBlock(
    "Everything you need for the day",
    `git clone ${LINKS[0].url}.git\ncd workshop-example\ncp .env.example .env\n./verify-setup.sh`
  )
)}
${onlyWrap(
  ["windows-windows"],
  // cp and ./verify-setup.sh are both wrong in PowerShell, and the second one cannot
  // work in Windows-container mode at all.
  copyBlock(
    "Everything you need for the day",
    `git clone ${LINKS[0].url}.git\ncd workshop-example\ncopy .env.example .env\npowershell -ExecutionPolicy Bypass -File windows\\verify.ps1`
  )
)}
  </div>`,
  })
);

// --------------------------------------------------------- activity pages

activities.forEach((a, i) => {
  const prev = i > 0 ? activities[i - 1] : null;
  const next = i < activities.length - 1 ? activities[i + 1] : null;

  // noCode: an activity that changes nothing in app/ - Blog Engine is pen and paper,
  // the team activity is in the room. Telling the room it "produces cp-04" - or
  // offering a catch-up jump - describes code that does not exist.
  const cp = a.noCode
    ? [`<span>${esc(a.noCodeNote || "no code — pen and paper")}</span>`]
    : [
    a.from ? `<span>start from <b>${esc(a.from)}</b></span>` : `<span>start of the day</span>`,
    // A long activity produces its lettered rungs on the way: cp-08a → cp-08b → cp-08c → cp-08.
    a.to
      ? `<span>produces ${[...midRungs(a).map(m => m.tag), a.to].map(t => `<b>${esc(t)}</b>`).join(" &rarr; ")}</span>`
      : `<span>final activity</span>`,
    // The catch-up command is NOT repeated here. This strip is read by everybody, and
    // running it is right for one person in the room - see catchUpBlock, immediately
    // below, which says so in the one place the reader it is for will look.
  ]
    .filter(Boolean)
    .join("\n    ");

  const section = (heading, blocks) =>
    blocks && blocks.length ? `\n  <h2>${heading}</h2>\n${blocks.join("\n")}\n` : "";

  // Just this activity's commands. The morning start used to be spliced in above
  // them under a "Start your day" heading; it now lives once, on its own page, and
  // the header links there from every page in the guide. The assertion is the guard:
  // a `daily` command reaching an activity page means the splice came back.
  // Two groups, not one: what you run BEFORE pasting a prompt, and what you run to
  // check what the prompt did. `after: true` on a command puts it in the second.
  const commandBlocks = a => {
    const all = a.commands || [];
    const stray = all.find(c => c.daily);
    if (stray) {
      throw new Error(
        `${a.slug}: "${stray.label}" is a daily-start command. Those belong on ` +
          `start-your-day.html only — see the note above DAILY_START in activities.js.`
      );
    }
    const render = c => copyBlock(c.label, c.code, false, c.where);
    const before = all.filter(c => !c.after).map(render);
    const after = all.filter(c => c.after).map(render);
    // No "what the badges mean" line above them any more: each badge explains itself
    // on hover - see LOCATIONS.
    return { before, after };
  };

  const cmds = commandBlocks(a);

  // "See it before you change it": the same kind of look-at-it check as below the
  // prompts, but of the code as it stands, so it sits above them.
  const baseline = (a.baseline || []).map(checkBlock);

  // The bar is filled in at the end, once there is a page to ask about - see below.
  const body = `${siteHeader("← ALL ACTIVITIES", FROM_PAGES)}
${a.platformSetup ? "" : "<!--PATHBAR-->"}
  <span class="actnum">${a.team ? "TEAM ACTIVITY" : `ACTIVITY ${shownNum(a)}`}</span>
  <p class="eyebrow">${esc(a.part)}</p>
  <h1>${esc(a.title)}</h1>
  <p class="lede">${a.summary}</p>

  <div class="cp"${a.platformSetup ? ' data-setup="done fresh"' : ""}>
    ${cp}
  </div>

${a.platformSetup ? setupAsk() : ""}
${
  // NOTHING BELOW THE QUESTION UNTIL IT IS ANSWERED. Arriving from card 01a, the page
  // is the question and nothing else: the success line, the troubleshooting and the
  // help below it all assume an answer, and showing them first made the question look
  // like one section among many. Closed just above the pager.
  a.platformSetup ? '  <div data-setup="done fresh">' : ""
}
${a.platformSetup ? "" : '  <div data-needs-pathway>'}
${
  // WHAT TO DO IS NOT HERE, on purpose. Every page used to open with a numbered
  // summary of the activity, and it was noise twice over: the instructions are given
  // from the front of the room, and a reader who has worked through the activities in
  // order does not need to be told again what the sections below already say. What is
  // left is the one thing a numbered list was genuinely carrying - how somebody who
  // fell behind gets back to the same code as everybody else - and that is collapsed,
  // because it is for one reader and not for the room.
  a.platformSetup ? "" : catchUpBlock(a)
}${a.platformSetup ? `
  <div class="stepblock" data-pick-highlight data-setup="fresh">
  <h2>Step 1 &middot; Pick your machine</h2>
  <p class="sb-why" data-pick-empty>Everything below depends on this answer — the
  commands are different on each, and showing you all of them would be worse than
  showing you none. Pick one and the rest of the page appears.</p>
${platformPicker()}
  </div>
  <!-- Already set up: the full step-1 picker, with its Windows container-mode
       question, is teaching a choice this reader made weeks ago. The bar is the same
       answer in one line, and still required — the check command differs by pathway. -->
  <div data-setup="done">
${platformStrip()}
  </div>
  <div data-needs-pathway>
  <div data-setup="fresh">
  <h2>Step 2 &middot; Clone it and create your .env</h2>
${platformPanels()}

  <h2>Step 3 &middot; Your credential</h2>
${credentials()}
  </div>

  <h2 data-setup="fresh">Step 4 &middot; Run the check</h2>
  <h2 data-setup="done">Run the check</h2>
  <p data-setup="fresh">This reads <code>.env</code>, so do step 3 first — check 4 is
  the credential check, and it fails if that line is still empty.</p>
  <p data-setup="done">One command, and a straight answer. It is safe to run as often
  as you like.</p>
${runTheCheck()}
${
  a.why
    ? onlyWrap(
        a.whyOnly,
        `  <h2>${esc(a.whyHeading)}</h2>\n` + a.why.map(w => `  <p>${w}</p>`).join("\n")
      )
    : ""
}
` : ""}${section("Commands", cmds.before)}${a.exercise ? section("The exercise", [checkBlock(a.exercise, midRungs(a))]) : ""}${section("See it before you change it", baseline)}${a.note ? `  <div class="note">${a.note}</div>
` : ""}${section(
    a.promptsHeading || "Prompts — copy, don't retype",
    (a.prompts || []).length
      ? [
          ...(a.promptsNote ? [`  <p>${a.promptsNote}</p>`] : []),
          // A template is filled in by hand, so it is not framed as a prompt.
          ...a.prompts.map(p =>
            copyBlock(p.label, p.text, !p.template, p.template ? "editor" : "claude")
          ),
          ...(a.warning ? [`  <div class="warning" role="note">${a.warning}</div>`] : []),
        ]
      : []
  )}${section("Check your work", [...cmds.after, ...(a.checks || []).map(checkBlock)])}${section("Links", (a.links || []).map(l => copyBlock(l.label, l.url, false)))}
  <h2>You are done when</h2>
  <div class="success">${a.success}</div>
${a.troubleshooting ? `
${troubleshooting()}` : ""}
${(a.cheat || []).length ? `  <details class="cheat">
    <summary>Stuck? Open this</summary>
    <div class="body">
${a.cheat.map(c => `      <p>${c}</p>`).join("\n")}
    </div>
  </details>
` : ""}  </div>
${a.platformSetup ? "  </div>" : ""}

  <nav class="pager">
    ${
      // start-your-day.html sits between the setup page and the first activity: the
      // setup page's "next" goes there, so the page after setup must come back to it,
      // not skip past it to the environment check.
      prev && prev.platformSetup
        ? `<a href="${FROM_PAGES.daily}">&larr; Start your day</a>`
        : prev
        ? `<a href="${fileFor(prev)}">&larr; ${esc(prev.title)}</a>`
        // This page is also the pre-workshop setup instructions, reached directly from
        // a link in the invite rather than by paging through. A dead "Back" span is the
        // wrong end for it; the standalone page it replaced linked to the index.
        : a.platformSetup
          ? `<a href="${FROM_PAGES.home}">&larr; All activities</a>`
          : `<span>&larr; Back</span>`
    }
    ${
      a.platformSetup
        ? `<a href="${FROM_PAGES.daily}">Start your day &rarr;</a>`
        : next
          ? `<a href="${fileFor(next)}">${esc(next.title)} &rarr;</a>`
          : `<span>Next &rarr;</span>`
    }
  </nav>`;

  // A pathway bar on a page with nothing pathway-dependent asks a question the page
  // never uses - and now that the terminal-opening commands have left the activities,
  // some pages are prompts and nothing else. Derived from the rendered page rather
  // than from a property, so an activity that grows its first platform-specific
  // command gets the bar without anybody remembering to add it.
  //
  // The gate goes with the bar. Content held back until a pathway is chosen, on a page
  // with no bar to choose one, is a blank page for anybody who has not picked one yet.
  const gated = /data-only="|data-pathway="/.test(body);
  const out = gated
    ? body.replace("<!--PATHBAR-->", platformStrip())
    : body.replace("<!--PATHBAR-->", "").replace("<div data-needs-pathway>", "<div>");
  fs.writeFileSync(path.join(PAGES, fileFor(a)), page({ title: a.title, body: out }));
});

console.log(
  `Guide written: start-here.html + pages/{start-your-day,links}.html + ${activities.length} activity pages`
);
