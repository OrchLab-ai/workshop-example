#!/usr/bin/env node
//
// Workshop repo test suite.
//
//   node tests/run-tests.mjs
//
// DESIGN CONSTRAINTS, each of them deliberate:
//
//   * No dependencies. `npm install` is one more thing to go wrong before a
//     workshop, and this must run on a machine that has only just been set up.
//   * No Docker. These tests must run on a laptop in either container mode, in CI,
//     and on a host that cannot build either image. The things Docker WOULD prove
//     are covered by verify-setup.sh / verify.ps1 themselves.
//   * Node, not bash and not PowerShell. bash is awkward on a Windows host and
//     PowerShell is awkward everywhere else; Node runs identically on all three and
//     the repo already assumes it (guide/src/build-guide.js).
//
// WHAT THIS SUITE IS FOR: most checks below are REGRESSION GUARDS for bugs that
// actually happened, and each names the finding in .claude/context/findings.yaml
// that records it. The value is not that the assertion is clever — it is that the
// bug cost hours once and must not cost them twice.
//
// WHAT IT DOES NOT COVER, and no green run here should be read as covering:
//   * that either image builds (needs Docker, and the right daemon mode)
//   * that a browser actually renders (that IS check 5; run verify-setup.sh / verify.ps1)
//   * anything about credentials or the network
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";

// fileURLToPath, NOT new URL(...).pathname — the latter yields "/C:/..." on Windows
// and path.join then builds "C:\C:\...". A real cross-platform bug that POSIX hides.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const read = (p) => readFileSync(join(ROOT, p), "utf8");
const exists = (p) => existsSync(join(ROOT, p));

// Content with full-line comments removed.
//
// Load-bearing. These files are heavily commented, and the comments naturally quote
// the very commands the tests look for — so a regex over the raw text can pass by
// matching an explanation of a line that is no longer there. Caught by mutation
// testing: deleting the `ln -s ... /work/node_modules` command left a test green
// because a comment above it mentioned the path.
const codeOf = (p) =>
  read(p)
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

// ----------------------------------------------------------------- harness

const tests = [];
const test = (name, guards, fn) => tests.push({ name, guards, fn });

class Failure extends Error {}
function ok(condition, message) {
  if (!condition) throw new Failure(message);
}

// ------------------------------------------------------------- repo hygiene

test("gitattributes forces LF for shell scripts but leaves .ps1 alone", "WIN-011", () => {
  ok(exists(".gitattributes"), ".gitattributes is missing — a Windows checkout will be CRLF");
  const ga = read(".gitattributes");
  ok(/^\*\.sh\s+text\s+eol=lf/m.test(ga), "*.sh must be forced to LF (a CRLF shebang breaks a Linux container)");
  ok(/^verify-setup\.sh\s+text\s+eol=lf/m.test(ga), "verify-setup.sh is named explicitly as well as covered by *.sh — belt and braces on the file a CRLF shebang breaks hardest");
  ok(/^\.env\s+text\s+eol=lf/m.test(ga), ".env must be LF — a stray CR ends up inside the credential");
  // The asymmetry is the point: forcing .ps1 to LF would be wrong.
  ok(!/^\*\.ps1\s+text\s+eol=lf/m.test(ga), "*.ps1 must NOT be forced to LF — CRLF is correct for PowerShell");
});

test("verify.ps1 is saved with a UTF-8 BOM", "WIN-011", () => {
  const buf = readFileSync(join(ROOT, "windows/verify.ps1"));
  ok(
    buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    "windows/verify.ps1 lost its UTF-8 BOM — powershell.exe 5.1 will decode it as Windows-1252 and mojibake every non-ASCII character"
  );
});

// -------------------------------------------------- regression guards, Linux

// Found on a real first boot: http://localhost:5173 never answered, and the logs
// looked healthy. Docker creates a named volume owned by ROOT when the image has
// nothing at the path it shadows, the container runs as `agent`, npm install died
// with EACCES, and both servers then failed on ERR_MODULE_NOT_FOUND — while the
// script printed "Workshop app is up" regardless. Four guards, one per link.
test("start-app.sh can write its dependency volumes, and says so if it cannot", null, () => {
  const start = codeOf("workshop/start-app.sh");

  ok(
    /sudo chown/.test(start),
    "start-app.sh must take ownership of the node_modules volumes. Docker creates them owned by root because the image has nothing at those paths, and this container runs as `agent` — so the first npm install dies with EACCES and nothing starts"
  );
  ok(
    /packages\/shared\/node_modules/.test(start),
    "all four volume paths must be covered — the compose file shadows root plus client, server and shared"
  );
  ok(
    !/npm install\s+2>&1\s*\|\s*tail/.test(start),
    "npm install must not be piped to tail: a pipe reports tail's exit status, so a failed install is indistinguishable from a successful one and the script starts servers that have nothing to run"
  );
  ok(
    /if npm install >"\$LOGS\/install\.log"/.test(start),
    "the install's exit status must be tested directly, and its output kept for the failure report"
  );
  ok(
    /WORKSHOP APP DID NOT START/.test(start),
    "the banner must be able to report failure. Printing 'Workshop app is up' unconditionally is how a container with two dead servers looked healthy — a start script that lies about starting is worse than one that fails loudly"
  );
  // The container must survive a failed start, or the attendee loses the shell they
  // need to read the logs the failure banner just pointed them at.
  const tail = start.slice(start.lastIndexOf("BANNER"));
  ok(
    /exec sleep infinity/.test(tail),
    "PID 1 must stay alive even when the app failed to start — otherwise the container exits and takes the shell, the Claude session and any uncommitted work with it"
  );
});

// The recovery command read as step 4 of starting your day, so people ran it every
// morning on a healthy container. It is conditional, so it is presented as one.
test("the restart is a collapsed recovery, not a step in the daily sequence", null, () => {
  const acts = read("guide/src/activities.js");
  // The morning commands now live inside TERMINALS, one per window. The restart must
  // not be among them: as a fourth numbered command it reads as the next thing to
  // run, and restarting a working container is at best pointless and at worst looks
  // like a hang. (This guard used to slice on `const DAILY_START`, which no longer
  // exists — indexOf returned -1 and the test passed on an empty string.)
  const terminals = acts.slice(acts.indexOf("const TERMINALS"), acts.indexOf("const RECOVER"));
  ok(terminals.length > 200, "could not find the TERMINALS block — this guard is slicing on nothing");
  ok(
    !/start-app\.sh --restart/.test(terminals),
    "the restart must not be one of the morning commands — it is a recovery, and a numbered command reads as the next thing to run"
  );
  ok(/const RECOVER/.test(acts), "RECOVER must exist and carry the restart command");

  const page = read("guide/pages/start-your-day.html");
  const block = page.slice(page.indexOf('details class="trouble compact"'));
  ok(
    block.length > 0,
    "the restart must render inside a collapsed red details, so it cannot be mistaken for a step"
  );
  ok(
    /start-app\.sh --restart/.test(block.slice(0, 1200)),
    "the restart command must be inside that collapsed block"
  );
});

// "Which window does this go in?" is the question behind most wrong-terminal
// mistakes, and the host/container badge cannot answer it once two of the three
// windows are container shells. It is explained once, on its own page — repeated
// above every activity it was longer than the activity.
test("the guide names the three terminals before the first command", null, () => {
  const page = read("guide/pages/start-your-day.html");
  const callout = page.indexOf('class="terminals"');
  const firstCmd = page.indexOf('class="copyblock"');
  ok(callout >= 0, "the three-terminal callout is missing from start-your-day.html");
  ok(
    callout < firstCmd,
    "the callout must come BEFORE the first command — the very first thing anyone runs is one of the two that must not run inside the container"
  );
  for (const n of ["1", "2", "3"]) {
    ok(page.includes(`tm-n">${n}</span>`), `terminal ${n} is missing from the callout`);
  }
  // Terminal 3 has its own BADGE, not just its own paragraph. Two container shells
  // both badged "in the container" answered the question nobody gets wrong and stayed
  // silent on the one that costs something.
  ok(
    /class="loc claude"/.test(page),
    "the Claude terminal must carry its own badge — sharing the container badge with terminal 2 makes the badge useless on exactly the distinction this section exists to draw"
  );
  ok(
    /throws the context away/.test(page),
    "the third terminal must say why it stays separate — exiting it to run a command throws away the conversation context"
  );
});

// The daily start lived on all ten activity pages, block and explanation both, and
// was longer than most of the activities it sat above. It is done once a day by a
// room that has just been walked through it, so it lives on one page now. Two things
// have to hold for that to be an improvement rather than a hiding place: the page has
// to carry the whole story, and every page has to be one click from it.
test("the daily start lives on exactly one page, reachable from every page", null, () => {
  const explainer = read("guide/pages/start-your-day.html");
  ok(
    /first start of the day takes/.test(explainer),
    "start-your-day.html must carry the first-run warning — a container quietly installing dependencies reads as a hang, and this note is the only thing that says otherwise"
  );
  ok(/workshop\/up\.sh/.test(explainer), "start-your-day.html must carry the command that starts the stack");
  ok(/class="terminals"/.test(explainer), "start-your-day.html must carry the three-terminal callout");

  // The index is where somebody lands, and it is the one page that has to say the
  // morning routine exists at all — nothing above it points here.
  const home = read("guide/start-here.html");
  ok(
    /href="pages\/start-your-day\.html"/.test(home),
    "start-here.html must link to start-your-day.html — it is the entry page, and the morning routine is no longer repeated on the activities to be discovered by accident"
  );

  // Every page under guide/pages, not just the NN-prefixed ones: the environment
  // check renders as environment-setup.html, and a filter on the numbered names
  // silently stopped checking it.
  const pages = readdirSync(join(ROOT, "guide/pages")).filter(
    (f) => f.endsWith(".html") && f !== "start-your-day.html"
  );
  ok(pages.length >= 10, `expected the activity pages, found ${pages.length}`);
  for (const f of pages) {
    const html = read(`guide/pages/${f}`);
    ok(
      !/workshop\/up\.sh/.test(html),
      `guide/pages/${f} still carries the daily-start command — it belongs on start-your-day.html only, or it is back to being repeated ten times`
    );
    ok(
      /href="start-your-day\.html"/.test(html),
      `guide/pages/${f} has no link to start-your-day.html — the terminals, the first-run wait and the restart are explained there and nowhere else`
    );
  }
});

// `docker compose up -d` answers the wrong question: it reports the CONTAINER
// started, which is true within seconds, while the app inside is minutes from
// serving. Attendees opened :5173 on that signal and found nothing.
test("starting the stack waits for the app, not just the container", null, () => {
  ok(exists("workshop/up.sh"), "workshop/up.sh is missing — step 1 of every activity points at it");
  const up = codeOf("workshop/up.sh");
  ok(/compose up -d/.test(up), "up.sh must actually start the stack");
  ok(
    /READY/.test(up) && /curl -fsS/.test(up),
    "up.sh must poll the site and announce READY only when it genuinely answers — that is the whole reason it exists"
  );
  ok(
    /WORKSHOP APP DID NOT START/.test(up),
    "up.sh must recognise start-app.sh's failure banner and surface it, rather than waiting out its timeout on a container that has already given up"
  );
  ok(
    /WORKSHOP_UP_TIMEOUT/.test(up) && /GAVE UP/.test(up),
    "up.sh must bound the wait and say so — an unbounded wait is indistinguishable from the hang it exists to explain"
  );
  // Same class of bug as the verify-setup.sh progress line, avoided by construction.
  ok(
    !/\\r/.test(up),
    "up.sh must not redraw with \\r. This is an open-ended wait whose output is routinely piped to a file, and in-place redrawing there produces the truncation and residue artefacts that already cost time in verify-setup.sh"
  );

  // The guide must send people at it, or the wrapper is dead code.
  const acts = read("guide/src/activities.js");
  ok(
    /\.\/workshop\/up\.sh/.test(acts),
    "the guide's daily-start step must call ./workshop/up.sh, not a bare `docker compose up -d`"
  );

  // And `docker compose ps` should not claim health the app does not have.
  const workshop = read("docker-compose.workshop.yml");
  const svc = workshop.slice(workshop.indexOf("claude-container:"), workshop.indexOf("autonomous-agent:"));
  ok(
    /healthcheck:/.test(svc) && /localhost:\$\{WORKSHOP_PORT:-5173\}/.test(svc),
    "claude-container must have a healthcheck that probes the SITE. Without it `docker compose ps` reports Up seconds after start — the same lie `up -d` tells — and `up -d --wait` returns early"
  );
  ok(
    /start_period:/.test(svc),
    "the healthcheck needs a long start_period, or the first run's dependency install burns the retries and the container is marked unhealthy while it is merely slow"
  );
});

// The check earns its keep only if it warms what the morning uses. It did not: the
// check image was pinned to playwright v1.49.1 and both workshop images to v1.58.2,
// so an attendee downloaded the ~2 GB base TWICE — once the night before for a check
// that predicted nothing, and again at 09:05 when `up -d` pulled the real one. The
// tag is the whole mechanism, so it is what gets guarded.
test("the check image and the workshop images share a base, so one download serves both", null, () => {
  const baseOf = (p) => (codeOf(p).match(/^FROM\s+(\S+)/m) || [])[1];
  const check = baseOf("verify/Dockerfile");
  const workshop = baseOf("app/autonomous/Dockerfile");
  const demo = baseOf("app/autonomous-demo/Dockerfile");

  ok(check, "verify/Dockerfile has no FROM");
  // app/ is a separate clone and is gitignored here, so on a machine that has not
  // run the check yet there is nothing to compare against. Skip rather than fail:
  // this suite must run with no Docker and no app/ present.
  if (!workshop) return;

  ok(
    check === workshop,
    `verify/Dockerfile builds on ${check} but the workshop container builds on ${workshop}. That is a ~2 GB base layer downloaded twice — the environment check would warm an image the workshop never uses, and "no network surprise mid-exercise" stops being true`
  );
  if (demo) {
    ok(
      demo === workshop,
      `app/autonomous-demo/Dockerfile builds on ${demo} but app/autonomous/Dockerfile on ${workshop} — the Part 3 image would pull a fresh 2 GB base mid-afternoon`
    );
  }
  // Pinned Playwright must match the base it is pinned to, or the npm package looks
  // for a browser revision the preinstalled /ms-playwright never shipped.
  const df = codeOf("verify/Dockerfile");
  const argVer = (df.match(/ARG PLAYWRIGHT_VERSION=(\S+)/) || [])[1];
  if (argVer) {
    ok(
      check.includes(argVer),
      `verify/Dockerfile pins PLAYWRIGHT_VERSION=${argVer} against base ${check} — bumping the FROM without the ARG is the classic "browser not found at runtime"`
    );
  }
});

// Reported from a real run of the multi-build check 3: the row showed "running",
// "starting", "working", a step counter from nowhere, and an elapsed time that reset
// to 0s partway through. Three causes, all from one check running several commands.
test("a check that runs several commands still shows one clock and one story", null, () => {
  const sh = codeOf("verify-setup.sh");
  const runLogged = sh.slice(sh.indexOf("run_logged()"), sh.indexOf("cleanup()"));

  ok(
    /PROGRESS_EPOCH/.test(runLogged),
    "run_logged must time the CHECK, not the individual command. Otherwise a check that runs four builds restarts its clock at each one and the row counts up, snaps back to 0s and counts up again — which reads as a crash and restart"
  );
  ok(
    /PROGRESS_EPOCH=\$\(date \+%s\)/.test(sh.slice(sh.indexOf("start_check()"), sh.indexOf("pass_check()"))),
    "start_check must reset PROGRESS_EPOCH, or every check after the first reports the elapsed time of the whole run"
  );
  ok(
    /STEP_NOTE_PREFIX/.test(runLogged),
    "the progress note must be able to say WHICH sub-step it belongs to. Bare phase words — 'starting', 'working', 'step 12/12' — read as noise from nowhere when one check builds several images"
  );

  // The collision that produced the flickering: run_logged truncates its log on
  // entry, so two sub-steps sharing a log wipe each other's output while the note
  // reader is mid-read.
  const check3 = sh.slice(sh.indexOf('start_check "Workshop image builds"'), sh.indexOf('start_check "Claude Code CLI'));
  const logs = [...check3.matchAll(/run_logged "\$LOG_DIR\/([a-z0-9.-]+\.log)"/g)].map((m) => m[1]);
  ok(logs.length > 1, "check 3 should run more than one logged command");
  ok(
    new Set(logs).size === logs.length,
    `check 3 reuses a log file across sub-steps (${logs.join(", ")}). run_logged truncates on entry, so the second build empties the file the progress reader is reading and the row flips between phases at random`
  );
});

// The screenshot stamps the container's hostname onto the image, and the container
// is destroyed the moment the check ends (--rm, then compose down). So "it should
// read ENVIRONMENT OK with your container name" asked people to verify a name they
// had no way of learning. Both stacks must now print it back.
test("the check prints the container name it stamped, since the container is gone", null, () => {
  for (const shot of ["verify/screenshot.mjs", "windows/src/screenshot.mjs"]) {
    const js = codeOf(shot);
    ok(
      /VERIFY_HOST=\$\{HOST\}/.test(js),
      `${shot} must print VERIFY_HOST. The hostname is stamped into the image and the container carrying it is destroyed straight after, so it has to be reported out or it is lost`
    );
    ok(/VERIFY_STAMP=\$\{STAMP\}/.test(js), `${shot} must print VERIFY_STAMP`);
    ok(
      /const HOST =/.test(js) && /const STAMP =/.test(js),
      `${shot} must name the host and stamp values — computing them inline inside evaluate() is what made them unreportable`
    );
  }
  const sh = codeOf("verify-setup.sh");
  ok(/VERIFY_HOST=/.test(sh) && /SHOT_HOST/.test(sh), "verify-setup.sh must read VERIFY_HOST back out of the screenshot log");
  ok(/Container:/.test(sh), "verify-setup.sh must print the container name in its verdict");
  const ps = codeOf("windows/verify.ps1");
  ok(/VERIFY_HOST=/.test(ps) && /ShotHost/.test(ps), "windows/verify.ps1 must read VERIFY_HOST back too — the two checks stay in step");
  ok(/Container:/.test(ps), "windows/verify.ps1 must print the container name in its verdict");
  // The instruction it replaced must be gone from both, or one of them still tells
  // people to check a name it never shows them.
  for (const [f, body] of [["verify-setup.sh", sh], ["windows/verify.ps1", ps]]) {
    ok(
      !/with your container name/.test(body),
      `${f} still says "with your container name" — that is the uncheckable instruction this replaced`
    );
  }
});

// Reported as "30ss" on screen. \r moves the cursor to column 0 but erases nothing,
// so a redraw one character shorter than the line before it leaves that character
// standing. Byte counters change width every second ("9.9MB / 1.9GB" -> "10MB /
// 1.9GB"), so this was continuous, not an edge case.
test("the progress line erases what it redraws over", null, () => {
  const sh = codeOf("verify-setup.sh");
  const fn = sh.slice(sh.indexOf("progress_draw()"), sh.indexOf("progress_clear()"));
  ok(
    /pad=\$\(\( cols - \$\{#line\} \)\)/.test(fn),
    "progress_draw must pad its output to the terminal width. Without it a shorter redraw leaves the tail of the previous line on screen — the reported 'ss' was the old row's trailing 's' surviving a one-character-shorter repaint"
  );
  ok(
    /%\*s/.test(fn),
    "the padding must actually reach the printf — computing it and not emitting it fixes nothing"
  );
  // Spaces, not ANSI: NO_COLOR blanks every other escape this script emits, so an
  // erase sequence would be the one piece of ANSI left in deliberately plain output.
  ok(
    !/\\033\[K|\\e\[K/.test(fn),
    "use space padding rather than erase-to-end-of-line, so NO_COLOR output stays free of escapes"
  );
});

// Check 3 has to actually build the workshop's images, not only the check's own.
test("check 3 warms the images the workshop morning needs", null, () => {
  const sh = codeOf("verify-setup.sh");
  ok(
    /workshop_compose\s+build\s+claude-container/.test(sh),
    "check 3 must build claude-container from docker-compose.workshop.yml — that is the container every attendee lives in all day, and if the check does not build it, `docker compose up -d` downloads it while the room waits"
  );
  ok(
    /workshop_compose\s+pull\s+.*\bdb\b/.test(sh),
    "check 3 must pull the postgres image too"
  );
  ok(
    /--profile l4 build autonomous-agent/.test(sh),
    "check 3 must build the Part 3 agent image. It is not needed until the afternoon, which is exactly why it is fetched the night before: a 2 GB pull is worst when it lands mid-exercise"
  );
});

// The check earns its keep only if the port it proves free is the port the workshop
// actually needs. Before this, the check claimed 8080 and the workshop ran on 5173 —
// so a green run predicted nothing about the port most likely to collide, 5173 being
// Vite's default. One variable now governs both, which is also what lets an attendee
// who has to move the port set it ONCE and leave every command in the guide alone.
test("the check and the workshop claim the same port, from the same variable", null, () => {
  const verify = read("docker-compose.verify.yml");
  const workshop = read("docker-compose.workshop.yml");
  const windows = read("windows/docker-compose.windows.yml");
  const PORT = /\$\{WORKSHOP_PORT:-5173\}/;
  ok(PORT.test(verify), "docker-compose.verify.yml must publish ${WORKSHOP_PORT:-5173} — the check must claim the port the workshop needs, not a stand-in");
  ok(PORT.test(workshop), "docker-compose.workshop.yml must publish ${WORKSHOP_PORT:-5173}");
  ok(PORT.test(windows), "windows/docker-compose.windows.yml must publish ${WORKSHOP_PORT:-5173} — the two checks must stay in step");
  ok(
    /"\$\{WORKSHOP_PORT:-5173\}:\$\{WORKSHOP_PORT:-5173\}"/.test(workshop),
    "the workshop stack must map the SAME value on both sides of the colon. Vite's HMR websocket infers its port from the page URL, so 5174:5173 serves a page whose live reload silently never connects"
  );
  ok(
    !/\bVERIFY_PORT\b/.test(verify + workshop + windows),
    "VERIFY_PORT is gone — two names for one port is how the check and the workshop drifted apart in the first place"
  );
  for (const [f, sh] of [["verify-setup.sh", codeOf("verify-setup.sh")], ["windows/verify.ps1", codeOf("windows/verify.ps1")]]) {
    ok(/WORKSHOP_PORT/.test(sh), `${f} must read WORKSHOP_PORT`);
    ok(!/VERIFY_PORT/.test(sh), `${f} must not still read VERIFY_PORT`);
  }
});

// The workshop container has to come up serving the app. It previously ran
// `sleep infinity`, so nothing started Vite, the API or the migrations — while the
// guide told attendees to open http://localhost:5173 and wonder.
test("the workshop container starts the app, and survives the app dying", null, () => {
  const workshop = read("docker-compose.workshop.yml");
  ok(
    /entrypoint:\s*\['\/usr\/local\/bin\/start-app\.sh'\]/.test(workshop),
    "the workshop container must boot start-app.sh. With `sleep infinity` nothing serves the app, and every activity that says 'open http://localhost:5173' is a dead end"
  );
  ok(
    /\.\/workshop\/start-app\.sh:\/usr\/local\/bin\/start-app\.sh:ro/.test(workshop),
    "start-app.sh must be mounted from THIS repo. ./checkpoint.sh rewinds app/, so a boot script living in app/ would be rewound with it"
  );
  ok(exists("workshop/start-app.sh"), "workshop/start-app.sh is missing");
  const start = codeOf("workshop/start-app.sh");
  ok(
    /--host\s+0\.0\.0\.0/.test(start),
    "vite must bind 0.0.0.0. It binds loopback by default, and a loopback bind inside a container cannot be reached through a published port however the ports are mapped"
  );
  ok(
    /--strictPort/.test(start),
    "vite must use --strictPort. Without it, a taken port INSIDE the container makes Vite move to the next one silently, and the published mapping then points at nothing — a page that will not load with no error anywhere"
  );
  ok(
    /exec sleep infinity/.test(start),
    "PID 1 must be something that cannot fail. Attendees break this app on purpose; if the dev server were PID 1 the first bad edit would take down the container, the shell and the Claude session with it"
  );
});

// Two guards on the same bug, reported from a real run: during check 3's image pull
// the progress note was truncated to a stub, so the one moving thing on screen
// stopped saying anything. Deliberately NOT executed — running bash from here would
// fail on a Windows host, which this suite must survive — so they assert the two
// decisions the fix rests on.
test("the progress width is measured from the terminal, not from terminfo", null, () => {
  const sh = codeOf("verify-setup.sh");
  const fn = sh.slice(sh.indexOf("term_cols()"), sh.indexOf("progress_note()"));
  ok(fn.length > 0, "term_cols() must exist in verify-setup.sh");
  ok(
    /\/dev\/tty/.test(fn),
    "term_cols must measure the real terminal via /dev/tty. It is always called inside $( ), where stdout is a pipe, so a bare `tput cols` reports the terminfo DEFAULT for $TERM rather than the window — which is how check 3's pull progress got truncated on a narrow terminal and how a wide one still laid out against 80 columns"
  );
  ok(
    /stty size/.test(fn),
    "stty size must be tried first — it reports the CURRENT size, so the layout survives the window being resized during a long pull"
  );
});

test("a narrow terminal drops the static label, never the progress note", null, () => {
  const sh = codeOf("verify-setup.sh");
  const fn = sh.slice(sh.indexOf("progress_draw()"), sh.indexOf("progress_clear()"));
  ok(fn.length > 0, "progress_draw() must exist in verify-setup.sh");
  ok(
    /CURRENT_PREFIX_SHORT/.test(fn),
    "progress_draw must fall back to the short prefix when the line will not fit. The note is the ONLY part of the row that moves, and during a ~2 GB pull it is the only evidence on screen that the download is progressing rather than hung — so the static label beside it is what gives up its columns, not the note"
  );
  ok(
    /CURRENT_PREFIX_SHORT=/.test(sh),
    "CURRENT_PREFIX_SHORT must be set in start_check, or the fallback silently draws an empty prefix"
  );
});

test("verify-setup.sh disables MSYS path conversion", "WIN-025", () => {
  const sh = codeOf("verify-setup.sh");
  ok(
    /export\s+MSYS_NO_PATHCONV=1/.test(sh),
    "verify-setup.sh must export MSYS_NO_PATHCONV=1, or Git Bash rewrites the CONTAINER path /work/screenshot.mjs into a Windows host path and check 5 fails with a MODULE_NOT_FOUND naming a path nobody wrote"
  );
  ok(/export\s+MSYS2_ARG_CONV_EXCL=/.test(sh), "verify-setup.sh must also set MSYS2_ARG_CONV_EXCL for MSYS2 shells");
});

test("the Linux image puts playwright on the ESM resolution path", "WIN-012", () => {
  const df = codeOf("verify/Dockerfile");
  ok(
    /ln\s+-s\s+\/usr\/lib\/node_modules\s+\/work\/node_modules/.test(df),
    "verify/Dockerfile must symlink the global node_modules into /work. NODE_PATH alone does NOT work: the ESM resolver ignores it, so screenshot.mjs fails with ERR_MODULE_NOT_FOUND on EVERY platform"
  );
});

test("the Linux screenshot script is reachable from its own image", "WIN-012", () => {
  // Guard the pairing rather than either half: the script is ESM (bare import) and
  // the image must therefore provide a real node_modules. If someone converts the
  // script to CommonJS the symlink stops being load-bearing, and that is fine — but
  // it must not be possible to have ESM WITHOUT the resolution fix.
  const script = read("verify/screenshot.mjs");
  const isEsm = /^\s*import\s+.*\bfrom\s+["']playwright["']/m.test(script);
  if (isEsm) {
    ok(
      /\/work\/node_modules/.test(codeOf("verify/Dockerfile")),
      "verify/screenshot.mjs imports playwright as ESM, so verify/Dockerfile must provide /work/node_modules"
    );
  }
});

// ------------------------------------------------ regression guards, Windows

test("the Windows Dockerfile obeys the no-double-quote house rule", "WIN-005", () => {
  const lines = read("windows/Dockerfile").split(/\r?\n/);
  // Join continuation lines so a RUN is examined as the single command Docker sees.
  const offenders = [];
  let buffer = null;
  let startLine = 0;
  lines.forEach((raw, i) => {
    const line = raw.replace(/\r$/, "");
    if (buffer === null) {
      if (/^RUN\s/.test(line) && !/^RUN\s*\[/.test(line)) {
        buffer = line;
        startLine = i + 1;
      }
    } else {
      buffer += "\n" + line;
    }
    if (buffer !== null && !/\\\s*$/.test(line)) {
      // Strip full-line comments inside the RUN before judging.
      const code = buffer
        .split("\n")
        .filter((l) => !/^\s*#/.test(l))
        .join("\n");
      if (code.includes('"')) offenders.push(`line ${startLine}`);
      buffer = null;
    }
  });
  ok(
    offenders.length === 0,
    `shell-form RUN must contain no double quote (Docker strips it, and the error reads as a PowerShell bug): ${offenders.join(", ")}`
  );
});

test("the Windows Dockerfile re-ACLs the directory it moves into place", "WIN-021", () => {
  const df = codeOf("windows/Dockerfile");
  if (/Move-Item/.test(df)) {
    ok(
      /icacls\s+C:\\nodejs/.test(df),
      "Move-Item PRESERVES the source ACL, so C:\\nodejs keeps C:\\Windows\\Temp's permissions and ContainerUser cannot see node.exe. Re-ACL after the move."
    );
  }
});

test("Windows ACL grants use the SID, never the username", "WIN-004", () => {
  // Matched line-by-line rather than with one regex over the whole file: every path
  // here contains backslashes, so any character class that excludes "\" (to stop at
  // a line continuation) also fails to match "C:\screenshots" and the test silently
  // finds nothing to check. A test that asserts on an empty set is worse than none.
  const grants = read("windows/Dockerfile")
    .split(/\r?\n/)
    .filter((l) => /icacls/.test(l) && /\/grant/.test(l) && !/^\s*#/.test(l));
  ok(grants.length > 0, "expected the Windows Dockerfile to grant some ACLs — if the grants moved, update this test");
  for (const g of grants) {
    ok(
      /\*S-1-5-93-2-2/.test(g),
      `grant by SID *S-1-5-93-2-2, not by name — the name resolves to a DIFFERENT principal than the process runs as, so the grant looks applied and does nothing: ${g.trim()}`
    );
  }
});

test("the Windows image pins the user profile, including TEMP", "WIN-006", () => {
  const df = codeOf("windows/Dockerfile");
  for (const v of ["USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP"]) {
    ok(
      new RegExp(`${v}=`).test(df),
      `${v} must be pinned, or ContainerUser gets a throwaway profile at C:\\Users\\TEMP and anything written there is lost on restart while a declared volume sits empty`
    );
  }
});

test("verify.ps1 relaxes ErrorActionPreference around native commands", "WIN-022", () => {
  const ps = codeOf("windows/verify.ps1");
  ok(
    /\$ErrorActionPreference\s*=\s*'Continue'/.test(ps),
    "with ErrorActionPreference=Stop, PowerShell turns ANY native-command stderr into a terminating error — and docker writes ordinary progress to stderr, so a healthy build throws a stack trace across the checklist"
  );
});

test("the engine is Firefox, and nothing claims Chromium works on Windows", "WIN-002", () => {
  ok(/PW_BROWSER=firefox/.test(codeOf("windows/Dockerfile")), "the Windows image must default PW_BROWSER to firefox");
  ok(
    !/chromium/i.test(read("windows/docker-compose.windows.yml").replace(/^\s*#.*$/gm, "")),
    "the Windows compose file must not select chromium"
  );
  // Assert the LIMIT is stated, not that every sentence is policed.
  //
  // The first version of this test flagged any line mentioning Chromium that lacked a
  // negating word, and it false-positived on a perfectly good sentence about keeping
  // engine-specific baselines apart. Policing every mention is both brittle and
  // wrong: the risk is a doc that FAILS TO SAY Chromium cannot work, not one that
  // mentions it. So require the explicit denial to survive a rewrite, and let authors
  // write normal prose around it.
  for (const f of ["windows/README.md", ".claude/context/windows-containers.md"]) {
    const doc = read(f);
    ok(
      /chromium[^.]{0,80}?\b(cannot|can not|does not|never|will not|unsupported)\b/is.test(doc) ||
        /\b(cannot|does not|never|unsupported)\b[^.]{0,80}?chromium/is.test(doc),
      `${f} must state plainly that Chromium does not work in a Windows container. Saying otherwise — or saying nothing — sends the next engineer to debug the one engine that can never work here.`
    );
  }
});

test("the Windows compose file bind-mounts only directories", "WIN-009", () => {
  const yml = read("windows/docker-compose.windows.yml");
  const mounts = [...yml.matchAll(/^\s*-\s+(\.\.?\/[^:\s]+):/gm)].map((m) => m[1]);
  ok(mounts.length > 0, "expected some bind mounts in the Windows compose file");
  for (const m of mounts) {
    const abs = resolve(ROOT, "windows", m);
    ok(existsSync(abs), `bind source ${m} does not exist — Windows Docker REFUSES to start on a missing bind source (the Linux daemon silently creates it)`);
    ok(
      statSync(abs).isDirectory(),
      `bind source ${m} is a file — Windows containers cannot bind-mount a single file, only directories`
    );
  }
});

// ------------------------------------------------------------- structural

test("every COPY source in the Windows Dockerfile exists", null, () => {
  const df = read("windows/Dockerfile");
  for (const line of df.split(/\r?\n/)) {
    const m = line.match(/^COPY\s+(.+)$/);
    if (!m) continue;
    const parts = m[1].trim().split(/\s+/).filter((p) => !p.startsWith("--"));
    const sources = parts.slice(0, -1); // last token is the destination
    for (const src of sources) {
      ok(exists(src), `COPY source "${src}" does not exist — the build would fail after several GB of layers`);
    }
  }
});

test("both stacks serve the same site, rather than duplicating it", null, () => {
  ok(exists("verify/site/index.html"), "verify/site/index.html is missing");
  ok(/verify\/site/.test(read("docker-compose.verify.yml")), "the Linux stack should serve verify/site");
  ok(
    /verify\/site/.test(read("windows/docker-compose.windows.yml")),
    "the Windows stack must serve the SAME verify/site, not a copy — two copies of the proof page will drift"
  );
});

test("verify-setup.sh and verify.ps1 present the same six checks", null, () => {
  const labels = [
    "Workshop app cloned",
    "Docker daemon reachable",
    "Workshop image builds",
    "Claude Code CLI + auth",
    "Workshop site responds",
    "Playwright screenshot captured",
  ];
  const sh = read("verify-setup.sh");
  const ps = read("windows/verify.ps1");
  for (const label of labels) {
    ok(sh.includes(label), `verify-setup.sh is missing the check labelled "${label}"`);
    ok(ps.includes(label), `windows/verify.ps1 is missing the check labelled "${label}" — the two must stay in step or a Windows attendee cannot compare notes with the room`);
  }
  // The counter in every row is "[n/TOTAL]", so a label added to one script without
  // bumping its total prints a checklist that counts past its own length.
  // Read the declared total rather than matching against a literal: the assertion is
  // that the two scripts agree with each other AND with this list, so the list stays
  // the single place a sixth check has to be registered.
  const shTotal = sh.match(/^TOTAL=(\d+)/m);
  const psTotal = ps.match(/^\$Total\s*=\s*(\d+)/m);
  ok(shTotal && Number(shTotal[1]) === labels.length, `verify-setup.sh sets TOTAL=${shTotal ? shTotal[1] : "?"}, expected ${labels.length}`);
  ok(psTotal && Number(psTotal[1]) === labels.length, `windows/verify.ps1 sets $Total = ${psTotal ? psTotal[1] : "?"}, expected ${labels.length}`);
  // Every check but the first is skipped on an earlier failure, and the skipped rows
  // are printed from a hard-coded map. If that map is short, the checklist silently
  // loses its fixed length — which is the one property the whole design rests on.
  // Plain substring matches, deliberately: these needles contain regex metacharacters.
  for (let n = 2; n <= labels.length; n++) {
    ok(sh.includes(`${n}) start_check "${labels[n - 1]}"`), `verify-setup.sh's skipped-row map is missing ${n}) ${labels[n - 1]}`);
    ok(ps.includes(`${n} = '${labels[n - 1]}'`), `windows/verify.ps1's $remaining map is missing ${n} = ${labels[n - 1]}`);
  }
});

// ------------------------------------------------------------- the app clone

test("app/ is gitignored, so the two histories stay independent", null, () => {
  const ignored = read(".gitignore").split(/\r?\n/).map((l) => l.trim());
  ok(
    ignored.includes("app/") || ignored.includes("/app/"),
    "app/ must be gitignored. It is a clone of the application repo, and the whole point of the two-repo split is that this tree records NO pointer to the app's history — that is what a submodule would have done and what was deliberately rejected."
  );
  ok(
    spawnSync("git", ["-C", ROOT, "ls-files", "--error-unmatch", "app"], { encoding: "utf8" }).status !== 0,
    "app/ is tracked in git — it must not be, or an infra commit starts carrying app state again"
  );
});

test("checkpoint.sh drives the APP repo, never this one", null, () => {
  const code = codeOf("checkpoint.sh");
  // The whole design rests on this. A bare `git` here asks workshop-example about
  // tags it does not have, and — worse — a bare `git checkout` would move the
  // INFRASTRUCTURE repo to a checkpoint, which is exactly the rewind the separate
  // app repo exists to prevent.
  const bare = code.split(/\r?\n/).filter((l) => /^\s*git\s/.test(l) || /\$\(\s*git\s/.test(l));
  ok(
    bare.length === 0,
    `every git command in checkpoint.sh must go through app_git (or be an explicit git -C): ${bare.map((l) => l.trim()).join(" | ")}`
  );
  // And the helper must actually target app/, not just exist.
  ok(
    /app_git\(\)\s*\{\s*git -C "\$APP_DIR"/.test(code),
    "app_git must be defined as `git -C \"$APP_DIR\"`"
  );
  // Line continuations are folded first: the wip commit is written as
  //   app_git -c user.name=... \
  //     commit -q -m "..."
  // so the verb is not on the same source line as app_git.
  const flat = code.replace(/\\\r?\n\s*/g, " ");
  for (const op of ["checkout", "status", "add", "commit", "describe", "for-each-ref", "fetch", "rev-parse"]) {
    ok(
      flat.split(/\r?\n/).some((l) => l.includes("app_git") && l.includes(` ${op}`)),
      `checkpoint.sh should still perform "git ${op}" — via app_git — and it no longer appears at all`
    );
  }
});

test("whether app/ is a clone is decided by .git, not by rev-parse", null, () => {
  // A bug that actually happened here. `git -C app rev-parse --git-dir` WALKS UP the
  // directory tree, so run inside a plain unzipped folder sitting in this repo it
  // finds workshop-example's OWN .git and reports success. The attendee is then told
  // their ZIP is "a clone of the wrong repo" and sent to fix the wrong thing.
  ok(
    /\[ ! -e "\$APP_DIR\/\.git" \]/.test(codeOf("verify-setup.sh")),
    "verify-setup.sh must test for $APP_DIR/.git to decide whether app/ is a clone"
  );
  ok(
    /Test-Path -LiteralPath \(Join-Path \$AppDir '\.git'\)/.test(read("windows/verify.ps1")),
    "windows/verify.ps1 must test for app\.git to decide whether app/ is a clone"
  );
  ok(
    /\[ ! -e "\$APP_DIR\/\.git" \]/.test(codeOf("checkpoint.sh")),
    "checkpoint.sh's guard must test for $APP_DIR/.git for the same reason"
  );
});

test("the workshop stack mounts the same app/ the check clones", null, () => {
  const yml = read("docker-compose.workshop.yml");
  ok(/\.\/app:/.test(yml), "docker-compose.workshop.yml must bind-mount ./app");
  ok(
    /context:\s*\.\/app\/autonomous\b/.test(yml),
    "the claude-container service builds from ./app/autonomous — if that moves, verify-setup.sh's 'is this the right repo' probe must move with it"
  );
  ok(
    /autonomous\/Dockerfile/.test(codeOf("verify-setup.sh")),
    "verify-setup.sh must probe for the file the compose build needs (app/autonomous/Dockerfile), or a wrong-repo clone fails minutes later as an opaque build error"
  );
});
// ------------------------------------------------------- context integrity

test("finding ids are unique and every referenced id exists", null, () => {
  const findings = read(".claude/context/findings.yaml");
  const ids = [...findings.matchAll(/^\s*-\s+id:\s*(\S+)/gm)].map((m) => m[1]);
  ok(ids.length > 0, "no findings parsed out of findings.yaml");
  const seen = new Set();
  for (const id of ids) {
    ok(!seen.has(id), `duplicate finding id ${id}`);
    seen.add(id);
  }
  // Any WIN-xxx cited elsewhere must resolve, or the breadcrumb is a dead end.
  const cited = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      if (entry.isDirectory()) walk(rel);
      else if (/\.(md|ps1|sh|mjs|yml|yaml)$/.test(entry.name) && rel !== "/.claude/context/findings.yaml") {
        for (const m of read(rel.slice(1)).matchAll(/\bWIN-\d{3}\b/g)) cited.add(m[0]);
      }
    }
  };
  walk("");
  for (const id of cited) {
    ok(seen.has(id), `${id} is referenced somewhere in the repo but is not in findings.yaml`);
  }
});

test("both checks diagnose a Docker PERMISSION failure separately", "WIN-026", () => {
  // The failure mode this guards: without membership of docker-users, `docker info`
  // fails and the daemon is running perfectly. Reporting "the daemon is not running
  // / start Docker Desktop" puts that person in a restart loop they cannot win. Same
  // shape as the wrong-container-mode bug — a true symptom, the wrong cause.
  const ps = codeOf("windows/verify.ps1");
  ok(
    /Get-DockerGroupStatus/.test(ps),
    "windows/verify.ps1 must diagnose docker-users membership when `docker info` fails"
  );
  for (const state of ["not-member", "stale-token"]) {
    ok(ps.includes(state), `verify.ps1 must distinguish the "${state}" case — the fixes are different`);
  }
  ok(
    /Groups/.test(ps) && /WindowsIdentity/.test(ps),
    "membership must be read from the process TOKEN, not only the group's member list: a user added to docker-users two minutes ago is in the group and still cannot reach Docker until they sign out and back in"
  );

  const sh = codeOf("verify-setup.sh");
  ok(
    /permission denied|access is denied/i.test(sh),
    "verify-setup.sh must recognise a permission failure rather than calling it a stopped daemon"
  );
  ok(/docker-users/.test(sh), "verify-setup.sh must name docker-users for Git Bash users on Windows");
  ok(/usermod -aG docker/.test(sh), "verify-setup.sh must give the docker-group fix on Linux");
});

test("the permission fix tells the user to sign out, not just to re-run", "WIN-026", () => {
  // Windows grants group rights at LOGON, and the Linux docker group behaves the
  // same way. Advice that omits this reads as "the fix did not work".
  const ps = codeOf("windows/verify.ps1");
  const sh = codeOf("verify-setup.sh");
  ok(/SIGN OUT|sign out/.test(ps), "verify.ps1's docker-users advice must say to sign out and back in");
  ok(/SIGN OUT|LOG OUT|sign out|log out/i.test(sh), "verify-setup.sh's permission advice must say to log out and back in");
});

test("the static server never builds a path from the request", "WIN-027", () => {
  // CodeQL flagged the previous version as js/path-injection (high). The fix was not
  // a better sanitiser but an allowlist: the request is used only as a KEY, and every
  // path handed to readFile comes from readdir. This guards that property, because
  // the obvious "improvement" is to go back to joining ROOT with the request.
  const src = read("windows/src/serve.mjs");
  const body = src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  ok(/buildIndex/.test(body), "serve.mjs must build an allowlist of servable files");
  ok(
    !/readFile\(\s*(target|join\(|resolve\()/.test(body),
    "readFile must be handed a path from the allowlist, never one constructed from the request"
  );
  ok(
    !/join\(\s*ROOT\s*,\s*(rel|key|urlPath)/.test(body),
    "do not rejoin ROOT with request-derived data — that is the path-injection shape CodeQL caught"
  );
});

test("workflows declare least-privilege permissions", "WIN-027", () => {
  for (const f of readdirSync(join(ROOT, ".github/workflows"))) {
    const wf = read(`.github/workflows/${f}`);
    ok(
      /^permissions:/m.test(wf) || /^\s{4}permissions:/m.test(wf),
      `${f} must declare an explicit permissions block; without one the repository default applies, which for older orgs is read-write`
    );
  }
});

// ------------------------------------------------------------------ guide

// Every .html under guide/, with its path relative to the repo root.
function guidePages() {
  const found = [];
  const walk = (rel) => {
    for (const entry of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(".html")) found.push(child);
    }
  };
  walk("guide");
  return found;
}

test("the guide has exactly one entry page at its root", null, () => {
  const atRoot = readdirSync(join(ROOT, "guide"), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => e.name);
  ok(
    atRoot.length === 1 && atRoot[0] === "start-here.html",
    `guide/ must contain exactly one HTML file, start-here.html, so there is no doubt which to open — found: ${atRoot.join(", ") || "none"}`
  );
  ok(exists("guide/pages"), "the other pages belong in guide/pages/");
  ok(exists("guide/src/build-guide.js"), "the generator belongs in guide/src/");
});

test("every internal link in the guide resolves", null, () => {
  const broken = [];
  for (const page of guidePages()) {
    const dir = dirname(page);
    for (const m of read(page).matchAll(/href="([^"]+)"/g)) {
      const href = m[1];
      // Skip anything that does not name a file in this repo.
      if (/^(https?:|mailto:|#|data:)/.test(href)) continue;
      const target = href.split("#")[0].split("?")[0];
      if (!target) continue;
      if (!existsSync(resolve(ROOT, dir, target))) broken.push(`${page} -> ${href}`);
    }
  }
  // Worth having as a test rather than a spot-check: relative links are exactly
  // what a directory restructure breaks, and a dead link in a workshop guide is
  // found by an attendee mid-exercise rather than by whoever moved the file.
  ok(broken.length === 0, `broken internal links:\n      ${broken.join("\n      ")}`);
});

test("the committed guide matches its source", null, () => {
  // The generated pages are committed so attendees never have to run a build. That
  // is only safe if they cannot drift from activities.js — hence this test.
  // It regenerates, compares, and puts the originals back, so it never leaves the
  // working tree modified whether it passes or fails.
  const pages = guidePages();
  const before = new Map(pages.map((p) => [p, readFileSync(join(ROOT, p))]));
  // ORPHAN DETECTION. Comparing the file set before and after cannot find a page the
  // generator has stopped writing: it is present on both sides, unchanged, and passes.
  // That is how 01-environment-check.html survived being merged into
  // environment-setup.html — no longer generated, no longer linked, still served, and
  // still answering with the pre-merge content to anyone holding the old URL. So this
  // also asserts every committed page was WRITTEN by the run below.
  const t0 = Date.now() - 2000;
  const result = spawnSync(process.execPath, [join(ROOT, "guide/src/build-guide.js")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  try {
    ok(result.status === 0, `build-guide.js exited ${result.status}: ${result.stderr || result.stdout}`);
    const after = guidePages();
    const added = after.filter((p) => !before.has(p));
    const removed = pages.filter((p) => !after.includes(p));
    const changed = after.filter(
      (p) => before.has(p) && !before.get(p).equals(readFileSync(join(ROOT, p)))
    );
    ok(
      added.length === 0 && removed.length === 0 && changed.length === 0,
      `guide/ is out of date — run: node guide/src/build-guide.js\n      changed: ${changed.join(", ") || "none"}\n      added: ${added.join(", ") || "none"}\n      removed: ${removed.join(", ") || "none"}`
    );
    const orphans = after.filter((p) => statSync(join(ROOT, p)).mtimeMs < t0);
    ok(
      orphans.length === 0,
      `these pages are committed but no longer generated — delete them, or they keep serving stale content to anyone holding the old URL:\n      ${orphans.join("\n      ")}`
    );
  } finally {
    for (const [p, buf] of before) writeFileSync(join(ROOT, p), buf);
  }
});

test("the guide offers a macOS and a Windows pathway, with distinct commands", null, () => {
  const html = read("guide/pages/environment-setup.html");
  for (const id of ["macos", "windows-linux", "windows-windows"]) {
    ok(html.includes(`data-pathway="${id}"`), `environment-setup.html is missing the "${id}" pathway`);
  }
  ok(
    html.includes("docker info --format"),
    "the Windows branch must have attendees RUN a command to find out which container mode they are in, rather than guess"
  );
  // The whole point of the page: the two Windows answers lead to different commands.
  const panel = (id) => {
    const start = html.indexOf(`data-pathway="${id}"`);
    return html.slice(start, html.indexOf("</div>", html.lastIndexOf("</div>", start + 4000)) + 6000);
  };
  ok(panel("windows-windows").includes("verify.ps1"), "the Windows-containers pathway must use verify.ps1");
  ok(panel("macos").includes("./verify-setup.sh"), "the macOS pathway must use ./verify-setup.sh");
});

// --------------------------------------------------------- functional test

test("serve.mjs serves / as text/html and refuses traversal", "WIN-023", async () => {
  const port = 38000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, [join(ROOT, "windows/src/serve.mjs")], {
    env: { ...process.env, SERVE_ROOT: join(ROOT, "verify/site"), SERVE_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    // Wait for the server to say it is listening rather than sleeping and hoping.
    await new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => rejectReady(new Failure("serve.mjs did not start within 10s")), 10_000);
      child.stdout.on("data", (d) => {
        if (d.toString().includes("serving")) {
          clearTimeout(timer);
          resolveReady();
        }
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        rejectReady(new Failure(`serve.mjs exited early with code ${code}`));
      });
    });

    const res = await fetch(`http://127.0.0.1:${port}/`);
    ok(res.status === 200, `GET / returned ${res.status}`);
    // THE regression guard: "/" used to resolve to the DIRECTORY, whose extension is
    // empty, so this header was application/octet-stream — and Firefox DOWNLOADS that
    // instead of rendering it, failing Playwright with "Download is starting".
    // Chromium content-sniffs and would have hidden the bug entirely.
    ok(
      (res.headers.get("content-type") || "").startsWith("text/html"),
      `GET / must be text/html, got "${res.headers.get("content-type")}" — Firefox downloads anything else instead of rendering it`
    );
    ok((await res.text()).includes("ENVIRONMENT OK"), "GET / did not return the proof page");

    const escaped = await fetch(`http://127.0.0.1:${port}/../../Windows/win.ini`);
    ok(escaped.status === 403 || escaped.status === 200, `unexpected status ${escaped.status}`);
    if (escaped.status === 200) {
      ok(
        !(await escaped.text()).includes("[fonts]"),
        "path traversal escaped the site root"
      );
    }
  } finally {
    // Await the child's actual exit rather than just signalling it. Killing a child
    // and then letting the runner call process.exit() races libuv's handle teardown
    // and aborts the process on Windows with
    //   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c
    // which looks alarming and has nothing to do with the test.
    child.stdout?.removeAllListeners();
    child.stderr?.removeAllListeners();
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((done) => {
        child.once("exit", done);
        child.kill();
        setTimeout(done, 3000).unref?.();
      });
    }
    // Destroy the pipes explicitly. Leaving them open is what leaves a handle
    // mid-teardown when the runner finishes.
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
  }
});

// ------------------------------------------------------------------ runner

const only = process.argv[2];
// The morning commands were a second numbered list below the three terminals, so
// "2. Get a shell inside the container" had to be matched back onto "terminal 2" by
// the reader. Now each window carries the command that opens it — which is only an
// improvement if it stays that way.
test("each terminal carries the command that opens it", null, () => {
  const html = read("guide/pages/start-your-day.html");
  const block = html.slice(html.indexOf('class="terminals"'), html.indexOf("</div>\n\n  <div class=\"note\""));
  ok(block.length > 500, "could not find the terminals block");

  // Each numbered window, then its command, in that order and interleaved — not
  // three windows followed by three commands.
  const order = [...block.matchAll(/tm-n[^>]*>(\d|&#10003;)<|class="copyblock/g)].map((m) => m[1] || "cmd");
  ok(
    JSON.stringify(order) === JSON.stringify(["1", "cmd", "2", "cmd", "3", "cmd", "&#10003;", "cmd"]),
    `each window must be immediately followed by its own command; got ${JSON.stringify(order)}`
  );

  // Terminal 3 lands the reader in Claude, in ONE command. It was two lines —
  // `exec ... bash` then `claude` — which reads correctly and does not survive being
  // copied: both lines arrive as a single paste, the first starts an interactive bash
  // that takes over stdin, and the second is eaten rather than run.
  ok(
    /exec claude-container claude/.test(block),
    "terminal 3 must launch Claude directly from exec — a second line after an interactive shell is lost on paste"
  );
});

// Which window you are told to open has a different name on each platform, and the
// attendee answered that question before the workshop. Re-asking it is a chance to
// get a different answer; ignoring it means naming the wrong application.
test("start-your-day inherits the platform answer rather than re-asking", null, () => {
  const html = read("guide/pages/start-your-day.html");
  ok(/data-pick-chosen/.test(html), "the page must show which pathway is remembered, and let it be changed");
  ok(/data-pick="macos"/.test(html), "the page must be answerable by somebody who lands here first");

  // Rendered from PLATFORMS, so the shell named here cannot drift from the shell the
  // setup page told them to use.
  for (const shell of ["Terminal", "Git Bash", "PowerShell"]) {
    ok(html.includes(`<strong>${shell}</strong>`), `the ${shell} variant is missing — the shell names must come from PLATFORMS`);
  }
  ok(
    (html.match(/class="shellname" data-only=/g) || []).length >= 9,
    "every shell name must be gated by data-only, or the page names one application and is wrong for the other two thirds of the room"
  );

  // Windows-container mode cannot run this stack at all — the images are Linux. Say
  // so on the page that tells people to start it, gated to that pathway.
  ok(
    /data-only="windows-windows"/.test(html) && /Linux containers<\/strong>/.test(html),
    "the windows-windows pathway must be told the workshop stack needs Linux containers — its daily start does not work otherwise"
  );
});

// PLATFORM LEAKAGE. A Mac attendee who had answered the picker was still being shown
// "On Windows, do you have Docker? is not enough of a question", because the prose
// explaining the second Windows question was rendered unconditionally. That is a
// class of bug, not one instance: every piece of platform-specific text is gated by
// hand, and nothing until now noticed when a piece was not.
//
// So this runs applyPlatform's OWN rules over the rendered HTML and asks what is left
// visible. It is a re-implementation rather than a DOM test because the suite has no
// dependencies and must run on a bare Windows host — kept honest by deriving the
// rules from the same four attributes the real script reads.

// The full extent of the element whose opening tag starts at `open`, nesting-aware.
function elementExtent(s, open) {
  const name = s.slice(open + 1).match(/^[a-zA-Z0-9]+/)[0];
  let i = s.indexOf(">", open) + 1;
  let depth = 1;
  const openRe = new RegExp(`<${name}[\\s>]`, "g");
  const closeRe = new RegExp(`</${name}>`, "g");
  while (depth > 0 && i < s.length) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const om = openRe.exec(s);
    const cm = closeRe.exec(s);
    if (!cm) return s.length;
    if (om && om.index < cm.index) {
      depth++;
      i = om.index + 1;
    } else {
      depth--;
      i = cm.index + cm[0].length;
    }
  }
  return i;
}

// What an attendee in `state` can actually read. Mirrors applyPlatform(): the same
// four attributes, the same show-by-default contract, the same half-answered rule.
function visibleMarkup(html, state) {
  const os = state ? state.split("-")[0] : "";
  const final = state && state !== "windows";
  const hidden = (tag) => {
    const only = /data-only="([^"]*)"/.exec(tag);
    if (only) {
      const ids = only[1].split(" ").filter(Boolean);
      if (!state) return false;
      if (ids.includes(state)) return false;
      if (final) return true;
      return !ids.some((id) => id.split("-")[0] === os);
    }
    const pathway = /data-pathway="([^"]*)"/.exec(tag);
    if (pathway) return pathway[1] !== state;
    if (/data-step="mode"/.test(tag)) return os !== "windows";
    if (/data-pick-empty/.test(tag)) return !!final;
    if (/data-pick-chosen/.test(tag)) return !final;
    return false;
  };

  let out = html;
  for (let guard = 0; guard < 2000; guard++) {
    const m = /<[a-zA-Z0-9]+[^>]*\b(?:data-only|data-pathway|data-step|data-pick-empty|data-pick-chosen)\b[^>]*>/.exec(out);
    if (!m) break;
    const end = elementExtent(out, m.index);
    // Consumed either way, so the scan always advances: hidden elements are dropped,
    // shown ones lose the attribute that matched.
    out = hidden(m[0])
      ? out.slice(0, m.index) + out.slice(end)
      : out.slice(0, m.index) + out.slice(m.index + m[0].length, end) + out.slice(end);
  }
  return out.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
}

// The same walk, flattened to readable text.
function visibleText(html, state) {
  return visibleMarkup(html, state)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

// The same sequence was being told three ways at three weights: five narrative steps
// in "What to do", "1."/"2." on small copy-block labels inside the setup panel, and
// "Step 3"/"Step 4" as headings. The page therefore appeared to begin at step 3 —
// steps 1 and 2 were on screen, in eleven-point grey, as labels on copy buttons.
test("the setup page tells its sequence once, at one weight", null, () => {
  const html = read("guide/pages/environment-setup.html");

  const headings = [...html.matchAll(/<h2[^>]*>Step (\d+) &middot; ([^<]+)<\/h2>/g)];
  ok(headings.length >= 3, `expected the numbered step headings, found ${headings.length}`);
  headings.forEach((m, i) => {
    ok(Number(m[1]) === i + 1, `step headings must run 1..N with no gaps — found "Step ${m[1]}" in position ${i + 1}`);
  });

  // The headings ARE the list. A "What to do" summary above them restates the same
  // sequence in less detail and with none of the commands, and having both is what
  // made the page look like it began at step 3.
  ok(
    !/<h2[^>]*>What to do<\/h2>/.test(html),
    "the setup page must not also carry a What to do list — its Step N headings are the list"
  );

  // No third telling: a numbered copy-block label is the small-grey-text version of a
  // step, and having both competes with the headings.
  const labels = [...html.matchAll(/<div class="cb-head"><span>([^<]*)<\/span>/g)].map((m) => m[1]);
  const numbered = labels.filter((l) => /^\d+\./.test(l));
  ok(
    numbered.length === 0,
    `these copy-block labels carry step numbers, competing with the headings: ${numbered.join(", ")}`
  );
});


// The check reads .env. Rendering "Run the check" above the section that explains
// what goes in .env meant the obvious next action was the one that fails: check 4 is
// the credential check, and it fails for want of a value nobody had been told about.
// It was in that order because the check was simply the last command in each setup
// pathway panel — an ordering nothing was holding in place.
test("the credential comes before the command that reads it", null, () => {
  const html = read("guide/pages/environment-setup.html");
  const credential = html.indexOf("Your credential</h2>");
  const runIt = html.indexOf("Run the check</h2>");
  ok(credential > 0 && runIt > 0, "both the credential and run-the-check sections must exist as headings");
  ok(
    credential < runIt,
    "the credential section must come BEFORE running the check — the check reads .env, and check 4 fails without it"
  );

  // ...and the check must not ALSO still be sitting in the setup pathway panels,
  // which is where it was and is the state this guards against returning to.
  const panels = html.slice(html.indexOf('data-pathway="macos"'), credential);
  ok(
    !/verify-setup\.sh|verify\.ps1/.test(panels),
    "the check command must not remain in the setup pathway panels — that is what put it above the credential"
  );
});

// The pathway bar. Every page whose content varies by platform needs a way to see
// and change the answer without going back to setup — and the setup page must NOT
// have one, because it sits directly above the buttons that set it.
test("the pathway bar is on every page that needs it, and only those", null, () => {
  // DERIVED, not a list. A page needs the bar exactly when it has content gated on
  // the pathway — data-only spans, data-pathway panels. Hardcoding which pages those
  // are is how the index kept a bar after the last platform-specific thing was
  // removed from it, and how a page that grows its first gated command gets none.
  for (const p of guidePages()) {
    const html = read(p);
    const gated = /data-only="|data-pathway="/.test(html);
    const hasBar = /class="pathbar /.test(html);
    const hasPicker = /data-pick="macos"/.test(html);

    if (!gated) {
      ok(!hasBar, `${p} carries a pathway bar but has nothing gated on the pathway — the bar asks a question the page does not use`);
      continue;
    }
    ok(
      hasBar || hasPicker,
      `${p} has platform-gated content and no way to answer the question — the reader gets whichever variant the default happens to show`
    );
    // Chrome, so it sits under the site header rather than in the page. The setup
    // page is the exception and is checked separately below: there the bar belongs to
    // the already-set-up branch, which is necessarily below the heading.
    if (hasBar && !hasPicker) {
      ok(
        html.indexOf('class="pathbar ') < html.indexOf("<h1"),
        `${p} puts the pathway bar below the page heading — it is chrome, and belongs directly under the site header`
      );
    }
  }

  // The setup page is the one that TEACHES the choice, so it has the full picker and
  // shows the bar only on the already-set-up branch, where the picker is not rendered.
  const setup = read("guide/pages/environment-setup.html");
  ok(
    setup.indexOf('data-pick="macos"') < setup.indexOf('class="pathbar '),
    "on the setup page the full picker comes first; the bar belongs to the already-set-up branch below it"
  );
  ok(
    /<div data-setup="done">\s*<div class="pathbar is-set"/.test(setup),
    'the setup page\'s pathway bar must be inside data-setup="done" — on the full-setup branch it duplicates step 1'
  );

  // Three buttons, not two. "Windows" alone is the half-answered state, which is not
  // a pathway: the bar would have nothing to show and would look broken to the person
  // who just clicked it.
  const onActivity = read("guide/pages/02-coding-challenges.html");
  for (const id of ["macos", "windows-linux", "windows-windows"]) {
    ok(new RegExp(`data-pick="${id}"`).test(onActivity), `the pathway bar is missing the ${id} option`);
  }
  ok(!/data-pick="windows"/.test(onActivity), 'the bar must not offer bare "windows" — that is the half-answered state, and it resolves to no pathway at all');
});


// A copy block is copied WHOLE, as one paste. So a line after one that hands stdin to
// an interactive program is not a second command — it is input to the first, or it is
// swallowed and silently never runs. This was terminal 3: `exec ... bash` followed by
// `claude`, which read perfectly and did nothing when pasted.
test("no copy block puts a command after an interactive session", null, () => {
  // Things that take over the terminal. Anything after one of these on its own line
  // is not going to run as the reader expects.
  const takesOverStdin = /(docker\s+compose[^\n]*\bexec\b(?![^\n]*\b-T\b)[^\n]*|docker\s+exec[^\n]*|\bssh\b[^\n]*|\bclaude\b\s*)$/;

  for (const p of guidePages()) {
    for (const m of read(p).matchAll(/<div class="copyblock[^"]*">[\s\S]*?<pre>([\s\S]*?)<\/pre>/g)) {
      const lines = m[1]
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .split("\n")
        .filter((l) => l.trim());
      for (let i = 0; i < lines.length - 1; i++) {
        ok(
          !takesOverStdin.test(lines[i].trim()),
          `${p}: "${lines[i].trim()}" hands the terminal to an interactive session, but "${lines[i + 1].trim()}" follows it in the same copy block — that line is lost on paste`
        );
      }
    }
  }
});

// The gate has to cover the whole page, not the part that happened to be adjacent to
// it when it was written. It originally closed after the why-prose, which left the
// note ("The first check clones the app for you"), "You are done when", the
// troubleshooting list and the cheat sheet rendering to a reader who had answered
// nothing — the note in particular describing what check 1 does, three steps past
// where that reader is.
test("the pathway gate covers everything that depends on the answer", null, () => {
  for (const p of guidePages()) {
    const html = read(p);
    const open = html.indexOf("<div data-needs-pathway>");
    if (open < 0) continue;
    const end = elementExtent(html, open);
    const gated = html.slice(open, end);
    const after = html.slice(end);

    for (const [what, re] of [
      ["the activity note", /<div class="note">/],
      ['"You are done when"', /<h2>You are done when<\/h2>/],
      ["the success line", /<div class="success">/],
      ["the cheat sheet", /<details class="cheat">/],
      ["the troubleshooting list", /<details class="trouble">/],
    ]) {
      if (!re.test(html)) continue;
      ok(
        re.test(gated) && !re.test(after),
        `${p}: ${what} renders outside the pathway gate — it is shown to a reader who has answered nothing`
      );
    }

    // Navigation is never conditional. The activity gate used to close AFTER the
    // pager, so an unanswered reader lost the page's own next/previous links.
    // (links.html has no pager — there is nothing to page through from it.)
    if (/<nav class="pager">/.test(html)) {
      ok(
        /<nav class="pager">/.test(after),
        `${p}: the pager is inside the gate — navigation must work before the question is answered`
      );
    }
  }
});

// A page that hides everything until a question is answered has to SAY so, in the
// place the answer goes. The setup page gated step 2 onward behind the pathway from
// the moment the gate was added, and the line explaining why was inside the gated
// region — so it was only ever shown to people who had already answered. What a new
// reader actually saw was step 1 and then blank page.
test("a blocking step says what it is blocking", null, () => {
  const html = read("guide/pages/environment-setup.html");
  const step1 = html.slice(html.indexOf('<div class="stepblock"'), html.indexOf('data-needs-pathway'));
  ok(step1.length > 200, "could not find the step 1 block");
  ok(
    /data-pick-empty/.test(step1) && /Everything below depends on this/.test(step1),
    "step 1 must explain, in step 1, that the rest of the page is waiting on it — a message inside the gated region is written for the only people who cannot need it"
  );
  ok(
    /class="stepblock"/.test(step1),
    "step 1 must be a highlightable block, so it can be marked as the thing that is blocking"
  );

  const js = codeOf("guide/src/build-guide.js");
  ok(
    /data-pick-highlight[\s\S]{0,260}classList\.remove\('is-ask'\)/.test(js),
    "the highlight must be REMOVED once answered — a page that keeps shouting after you have answered is worse than one that never did"
  );

  // The two bars look identical and answer different questions; sharing a class made
  // "does this page have a pathway bar?" unanswerable.
  ok(
    /class="statusbar"/.test(html) && /class="pathbar is-set"/.test(html),
    "the setup-question bar and the pathway bar must be distinguishable in the markup, however alike they look"
  );
});

// Two different questions, and conflating them produced false alarms in both
// directions:
//
//   COMMANDS are instructions. A command block offered to the wrong pathway is a
//   command that fails — ./verify-setup.sh cannot run in Windows-container mode.
//
//   PROSE may name another platform legitimately: "Not PowerShell, and not CMD" is a
//   warning, and "every image ./verify-setup.sh uses is a Linux image" is an
//   explanation of why you are on the other pathway. Asserting those away would be
//   asserting that correct content is wrong.
//
// So commands are checked exhaustively, and prose only for the shell-naming leak that
// actually occurred.

// The commands a reader in `state` is offered: the <pre> of every visible copyblock.
function visibleCommands(html, state) {
  return [...visibleMarkup(html, state).matchAll(/<div class="copyblock[^"]*">[\s\S]*?<pre>([\s\S]*?)<\/pre>/g)].map(
    (m) => m[1].replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#39;/g, "'")
  );
}

test("no page offers a command that cannot run on the chosen platform", null, () => {
  const wrong = {
    macos: [/verify\.ps1/, /^copy /m, /powershell /],
    // windows-linux is deliberately absent. It IS offered verify.ps1 — by the
    // wrong-container-mode entry, which exists for the attendee who answered "Linux
    // containers", ran the check, and was told by Docker that they are in the other
    // mode. That is the escape hatch working, not a leak.
    "windows-windows": [/\.\/verify-setup\.sh/, /^cp /m],
  };
  for (const [state, patterns] of Object.entries(wrong)) {
    for (const p of guidePages()) {
      for (const cmd of visibleCommands(read(p), state)) {
        for (const re of patterns) {
          ok(
            !re.test(cmd),
            `${p} offers "${cmd.split("\n")[0]}" to the ${state} pathway, where it does not run`
          );
        }
      }
    }
  }
});

// The reported bug: a Mac attendee who had answered the picker was still reading
// about Git Bash and about why Windows gets a second question.
test("no page names another platform's shell in its own instructions", null, () => {
  for (const p of guidePages()) {
    const text = visibleText(read(p), "macos");
    for (const w of ["PowerShell", "Git Bash", "Git for Windows", "docker-users", "Windows-container mode"]) {
      const at = text.indexOf(w);
      ok(
        at < 0,
        `${p} still shows "${w}" after picking macOS — …${text.slice(Math.max(0, at - 90), at + 90).trim()}…`
      );
    }
  }
});

// Light is the default, whatever the operating system prefers. Three things have to
// agree or a reader gets a flash, or a different theme with JavaScript off than with
// it on: the pre-paint boot script, the toggle, and the CSS.
test("the guide defaults to light regardless of the OS preference", null, () => {
  const src = codeOf("guide/src/build-guide.js");
  ok(
    /stored \|\| 'light'/.test(src),
    "the pre-paint script must default to light — reading the OS preference makes the default depend on whose laptop is plugged into the projector"
  );
  ok(
    !/@media \(prefers-color-scheme/.test(src),
    "no prefers-color-scheme block: with one, the page loads light with JavaScript on and dark with it off, for the same reader"
  );

  for (const p of guidePages()) {
    const html = read(p);
    // Stamped before first paint, in <head>, or the first frame is the wrong theme.
    const head = html.slice(0, html.indexOf("</head>"));
    ok(/setAttribute\('data-theme'/.test(head), `${p} resolves the theme after <head> — that is a visible flash`);
    // Dark still has to be reachable and to win when chosen.
    ok(/:root\[data-theme="dark"\]/.test(html), `${p} has no dark palette — the toggle would do nothing`);
  }
});

// An unbalanced </div> does not look like a bug. It looks like the page suddenly
// going full-bleed halfway down, because the stray tag closes .wrap and everything
// after it escapes the layout container. Nothing else here would catch it: the HTML
// is still valid enough to render, every link resolves, and the drift test compares
// the committed output to a generator that is producing the same broken markup.
//
// It happened while splitting one conditional wrapper into two — the opening tag was
// replaced and the closing tag left behind.
test("every generated page has balanced block nesting", null, () => {
  const problems = [];
  for (const p of guidePages()) {
    // Script and style bodies mention tags in comments and strings; only markup counts.
    const body = read(p)
      .slice(read(p).indexOf('<div class="wrap">'))
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<style[\s\S]*?<\/style>/g, "");

    const stack = [];
    const re = /<(\/?)(div|nav|details|ol|ul|section|header)\b([^>]*)>/g;
    let m;
    let line = 1;
    let last = 0;
    while ((m = re.exec(body))) {
      line += (body.slice(last, m.index).match(/\n/g) || []).length;
      last = m.index;
      if (m[1]) {
        const open = stack.pop();
        if (!open) problems.push(`${p}:${line} stray </${m[2]}> — this one closes .wrap, and everything below it renders full-bleed`);
        else if (open.tag !== m[2]) problems.push(`${p}:${line} </${m[2]}> closes <${open.tag}> opened at line ${open.line}`);
      } else if (!/\/>\s*$/.test(m[0])) {
        stack.push({ tag: m[2], line });
      }
    }
    for (const open of stack) problems.push(`${p}:${open.line} <${open.tag}> is never closed`);
  }
  ok(problems.length === 0, `block nesting is broken:\n      ${problems.join("\n      ")}`);
});

// With no pathway chosen the page content is HELD BACK and the bar goes amber.
//
// THIS REVERSES THE ORIGINAL DEFAULT, deliberately. Showing every variant to somebody
// who had not answered was meant to protect the reader who scrolled straight to
// troubleshooting — but what it actually handed them was three contradictory versions
// of each fix with no way to tell which was theirs. One click resolves it, and the
// question is now unmissable instead of optional.
test("with no pathway chosen, the page asks instead of showing every variant", null, () => {
  for (const p of guidePages()) {
    const html = read(p);
    if (!/class="pathbar /.test(html)) continue;
    ok(
      /data-needs-pathway/.test(html),
      `${p} has a pathway bar but gates nothing behind it — its platform-specific content would render every variant at once`
    );
    ok(
      /class="pathbar is-ask"/.test(html) && /Pick your pathway to continue/.test(html),
      `${p} must say, in the amber bar, that the question has to be answered — otherwise the page just looks empty`
    );
  }

  // The gate is driven by the same state as everything else, and only by the final
  // pathways: the half-answered "windows" must not unlock a page whose commands
  // differ between the two Windows pathways.
  const js = codeOf("guide/src/build-guide.js");
  ok(
    /\[data-needs-pathway\][\s\S]{0,200}el\.hidden = !final/.test(js),
    "the gate must open only on a FINAL pathway — half-answered Windows does not determine the commands"
  );
});

// Two arrivals at one page. Setting a machine up (the SETUP link, the invite) wants
// the full guide immediately; "I want to prove my setup works", opened on the day,
// cannot know whether the reader is set up and has to ask.
test("the setup page defaults by how it was reached", null, () => {
  const js = codeOf("guide/src/build-guide.js");
  ok(
    /ask\(=\|&\|\$\)/.test(js) && /setup = 'fresh'/.test(js),
    "arriving without ?ask must default to the full setup — asking somebody who came to set up is a wasted click"
  );
  ok(
    !/localStorage\.setItem\(SETUP_KEY, 'fresh'\)/.test(js),
    "the default must not be written to storage, or a later arrival from the card replays a choice nobody made"
  );
  ok(
    /href="pages\/environment-setup\.html\?ask"/.test(read("guide/start-here.html")),
    'the "I want to prove my setup works" card must carry ?ask — it is the arrival that cannot assume'
  );
});

// "Which container mode is Docker in?" is not something a Windows attendee knows —
// it is why the setup page has them run a command rather than choose. A bar that
// offered only the two answers was asking them to guess, and a wrong guess makes
// every command on the page wrong.
test("the pathway bar offers Windows users a way out instead of a guess", null, () => {
  const html = read("guide/pages/02-coding-challenges.html");
  ok(/class="pb-idk"/.test(html), "the bar must offer a not-sure option for Windows");
  ok(
    /href="environment-setup\.html\?os=windows#docker-mode"/.test(html),
    "not-sure must LINK to the setup page's container-mode question, not set a pathway"
  );
  ok(
    /id="docker-mode"/.test(read("guide/pages/environment-setup.html")),
    "the container-mode question needs the id that link targets"
  );
  const js = codeOf("guide/src/build-guide.js");
  ok(
    /os=windows[\s\S]{0,900}setPlatform\('windows'\)/.test(js),
    "landing with ?os=windows must half-answer the platform — that is the state that reveals the mode question"
  );
  // ...and must open the full-setup branch first. The container-mode question lives
  // inside step 1, which the "already set up" branch does not render, so a reader who
  // had answered "just run the check" followed this link to a hidden element and saw
  // nothing happen. That reader is the likeliest one to click it: they are on the
  // setup page, they have a pathway bar, and they cannot answer it.
  ok(
    /os=windows[\s\S]{0,900}setSetup\('fresh'\)[\s\S]{0,200}setPlatform\('windows'\)/.test(js),
    "?os=windows must switch to the full-setup branch BEFORE half-answering the platform — otherwise the question it links to is not on the page"
  );
  ok(
    /scrollIntoView/.test(js),
    "and must scroll to it: the question is below the fold on the page it lands on"
  );
});


// An API key in the OAuth line, or the reverse. Both values start "sk-ant-" and run
// to about 108 characters, so the wrong line looks exactly like the right one: .env
// reads fine, `claude --version` runs, all six checks pass — and then Claude asks the
// attendee to log in, with nothing in any output connecting that back to a swapped
// line. Defended in three places: the guide never shows both sets of instructions at
// once, .env.example names the prefixes, and both checks test them.
test("both checks catch a credential pasted into the wrong line", null, () => {
  const bash = codeOf("verify-setup.sh");
  const ps = codeOf("windows/verify.ps1");

  for (const [name, src] of [["verify-setup.sh", bash], ["windows/verify.ps1", ps]]) {
    ok(
      /sk-ant-oat01-/.test(src) && /sk-ant-api03-/.test(src),
      `${name} must test BOTH prefixes — catching one swap and not the other leaves half the attendees with a silent failure`
    );
  }

  // Loaded through a CR-stripping path on both sides. The audience is largely on
  // Windows, .env gets opened in Notepad and saved CRLF, and the trailing \r then
  // travels inside the credential — invisible in every message it causes.
  ok(/tr -d '\\r'/.test(bash), "verify-setup.sh must strip CR when loading .env — a CRLF .env produces a credential that fails authentication while looking perfect");
  ok(/-replace "`r"/.test(ps), "windows/verify.ps1 must strip CR when parsing .env — same reason");

  // ...AND must report it, not just survive it. Stripping alone is the worst of both
  // worlds: docker compose reads the real file and hands the real value to the
  // container, so the check goes green on a credential the container cannot use, and
  // the attendee is told to log in with six passing checks behind them.
  for (const [name, src] of [["verify-setup.sh", bash], ["windows/verify.ps1", ps]]) {
    ok(
      /CRLF/.test(src),
      `${name} must FAIL on a CRLF .env, not silently cope with it — compose does not strip the CR, so a check that only strips it passes while the stack stays broken`
    );
  }

  const example = read(".env.example");
  ok(
    /sk-ant-api03-/.test(example) && /sk-ant-oat01-/.test(example),
    ".env.example must name both prefixes and which line each belongs on — it is read before either check runs"
  );
  ok(
    /^CLAUDE_CODE_OAUTH_TOKEN=/m.test(example) && /^# ANTHROPIC_API_KEY=/m.test(example),
    "the subscription token must be the live line and the API key the commented one, matching which section the guide opens by default — two live lines invites filling in both"
  );
});

// `KEY: "${KEY:-}"` does not omit an unset variable — it sets it to the empty string.
// So a stack with only an OAuth token still handed every container an
// ANTHROPIC_API_KEY that was present and blank, and interactive Claude Code treated
// that as a configured API key and asked for a login. `claude -p` authenticated fine
// on the same container, so every check passed and only the thing attendees actually
// do was broken. env_file omits what .env does not define.
const COMPOSE_FILES = [
  "docker-compose.workshop.yml",
  "docker-compose.verify.yml",
  "windows/docker-compose.windows.yml",
];

// Split a compose file into [serviceName, body] pairs, so a test can ask about one
// service rather than about the whole file — "somewhere in here" is not an answer
// when the question is whether THIS container is configured.
const services = (yml) => {
  const body = yml.split(/^services:[ \t]*$/m)[1] || "";
  const out = [];
  for (const m of body.matchAll(/^ {2}([a-z][\w-]*):[ \t]*$/gm)) {
    const start = m.index + m[0].length;
    const next = body.slice(start).search(/^ {0,2}\S/m);
    out.push([m[1], next === -1 ? body.slice(start) : body.slice(start, start + next)]);
  }
  return out;
};

test("credentials are never passed as empty strings", null, () => {
  for (const f of COMPOSE_FILES) {
    // codeOf, not read: the comment explaining this bug quotes the broken line, and
    // a test that matched its own documentation would fail on the fix.
    const yml = codeOf(f);
    ok(
      !/(ANTHROPIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN):\s*"\$\{/.test(yml),
      `${f} passes a credential through an environment: mapping — when unset that sets it to "" rather than omitting it, and a blank ANTHROPIC_API_KEY is what sends attendees to a login prompt`
    );
    // Every service that runs Claude has to get the credential from somewhere.
    if (/claude|verify-agent|autonomous-agent/.test(yml)) {
      ok(/env_file:/.test(yml), `${f} no longer supplies credentials at all — env_file is how they reach the container now`);
      ok(
        /required:\s*false/.test(yml),
        `${f} must mark .env optional — a missing .env is the environment check's job to report, with a fix, not a raw compose error`
      );
    }
  }
});

// Check 4 proved the credential EXISTED. It did not prove it worked, and those are
// different facts: `claude --version` makes no network call, so a present, correctly
// shaped, correctly placed, expired token passed all six checks and then produced a
// login prompt. The only thing that distinguishes the two is one real round trip.
test("the credential check authenticates, not just exists", null, () => {
  for (const [name, src] of [
    ["verify-setup.sh", codeOf("verify-setup.sh")],
    ["windows/verify.ps1", codeOf("windows/verify.ps1")],
  ]) {
    ok(
      /claude -p /.test(src),
      `${name} must make a real Claude call — --version proves the CLI exists, which is not the thing that fails`
    );
    ok(
      /04-auth\.log/.test(src),
      `${name} must keep the authentication attempt in its own log, so the failure message can point at the actual error`
    );
    ok(
      /credential authenticated/.test(src),
      `${name} must not claim more or less than it proved — "credential present" was true and useless`
    );
  }
});

// A credential that authenticates is not the same as a session that starts. Claude
// Code shows its first-run onboarding - a theme picker, then "your Claude subscription
// or billed based on API usage through your Console account" - whenever $HOME records
// no completed onboarding, and ~/.claude lives in the image rather than in a volume,
// so EVERY recreated container is a first run. `claude -p` never onboards, which is
// exactly why check 4 reported an authenticated credential while the attendee's own
// `exec ... claude` stopped at a screen that reads as a login prompt. No check can
// catch this one: the two code paths differ.
test("the workshop container does not stop at Claude's first-run onboarding", null, () => {
  const sh = codeOf("workshop/start-app.sh");
  ok(
    /\.claude\.json/.test(sh) && /hasCompletedOnboarding/.test(sh),
    "start-app.sh must seed ~/.claude.json with hasCompletedOnboarding - that flag is the only thing standing between an attendee with a valid token and a login screen"
  );
  ok(
    /hasTrustDialogAccepted/.test(sh),
    "seed the trust answer too - onboarding is followed immediately by \"do you trust this folder\", and a container that exists to hold one repo has no other answer"
  );
  // Claude keeps real state in this file. Rewriting it every boot would discard the
  // attendee's history and project settings on each restart of the app.
  ok(
    /if \[ -f "\$CLAUDE_CONFIG" \]/.test(sh),
    "the seed must only be written when the file is absent - this is Claude's live config, not a template"
  );

  // The variable that looks like the fix and is not. It appears nowhere in the CLI
  // binary, which carries seventeen real CLAUDE_CODE_SKIP_* names; setting it buys
  // nothing and, worse, reads like the problem is already handled.
  for (const f of [...COMPOSE_FILES, "workshop/start-app.sh", "verify-setup.sh", "windows/verify.ps1"]) {
    ok(
      !/CLAUDE_CODE_SKIP_ONBOARDING/.test(codeOf(f)),
      `${f} sets CLAUDE_CODE_SKIP_ONBOARDING, which is not a Claude Code variable - the gate is hasCompletedOnboarding in ~/.claude.json`
    );
  }
});

// The guide stopped carrying the instructions. They are given from the front of the
// room, the reader is working through the activities in order, and a numbered summary
// of the sections underneath was restating them in less detail — noise on every page,
// and the workshop's teaching material sitting in a public repository besides.
//
// What a numbered list WAS carrying, and what had to survive it: how somebody who
// fell behind gets back onto the same code as the room.
test("an activity page asks nothing of a reader who is keeping up", null, () => {
  const pages = readdirSync(join(ROOT, "guide/pages")).filter((f) => /^\d\d-/.test(f));
  ok(pages.length >= 9, `expected the activity pages, found ${pages.length}`);

  for (const f of pages) {
    const html = read(`guide/pages/${f}`);

    ok(
      !/<h2[^>]*>What to do<\/h2>/.test(html),
      `${f} still carries a What to do list — the instructions come from the room now`
    );

    // The catch-up, and the two things that make it right: collapsed, so it is not
    // the first thing the room reads, and phrased as a question, so the one person
    // it is for recognises themselves in it.
    const detail = html.match(/<details class="trouble compact"[^>]*>[\s\S]*?<\/details>/);
    ok(detail, `${f} has no catch-up block — a reader who fell behind has no way back to the room's code`);
    ok(
      !/<details class="trouble compact" open/.test(html),
      `${f} opens its catch-up by default — it is for one reader, not for the room`
    );
    ok(
      /checkpoint\.sh \d/.test(detail[0]),
      `${f}'s catch-up does not name a checkpoint, which is the only thing it is for`
    );

    // The checkpoint jump belongs to the catch-up and nowhere else. Every page used
    // to OPEN with it, so the first command most of the room saw was one they must
    // not run — it would park the work they had just done.
    const withoutCatchUp = html.replace(detail[0], "");
    // The cheat sheet is the other direction - skipping AHEAD past an activity you
    // ran out of time on - and that is a different command to a different rung.
    const outsideCheat = withoutCatchUp.replace(/<details class="cheat">[\s\S]*?<\/details>/, "");
    ok(
      !/checkpoint\.sh \d/.test(outsideCheat),
      `${f} offers a checkpoint jump outside the catch-up — most of the room is already on that rung, and running it parks their work`
    );

    // Three terminals, opened once in the morning. A page that tells you to start
    // Claude is talking to somebody who is already typing into it.
    // `claude` and `claude --flag` START a session. `claude mcp list` is a subcommand
    // and runs in the work terminal, which is a different thing and stays allowed.
    const bareClaude = [...withoutCatchUp.matchAll(/<pre>([^<]*)<\/pre>/g)]
      .map((m) => m[1].trim())
      .filter((c) => /^claude(\s|$)/.test(c) && c.split(/\s+/).slice(1).every((w) => w.startsWith("-")));
    ok(
      bareClaude.length === 0,
      `${f} tells the reader to start Claude Code — that happens once, on start-your-day.html`
    );

    // And when there ARE prompts, say which window they go in. A prompt pasted into
    // the host terminal is bash trying to run an English sentence.
    if (/Prompts &mdash; copy|Prompts — copy/.test(html)) {
      ok(
        /Inside the <strong>Claude terminal<\/strong>/.test(html),
        `${f} offers prompts without saying which window they are pasted into`
      );
    }
  }
});

// Order is instruction. Every page used to list its commands above the prompts, so
// "run the same gates CI runs, when you think you are done" was read before the
// prompt whose work it checks — a page telling you to verify nothing. A command that
// checks the work belongs below the thing that does it, under its own heading.
test("a command that checks the work comes after the prompt that does it", null, () => {
  const { activities } = createRequire(import.meta.url)(join(ROOT, "guide/src/activities.js"));
  const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // code -> after?, taken from the data rather than from a guess about which
  // commands look like verification.
  const flag = new Map();
  for (const a of activities) for (const c of a.commands || []) flag.set(c.code, !!c.after);
  ok([...flag.values()].some(Boolean), "no command is flagged `after` — this test would pass on any page");

  let checked = 0;
  for (const f of readdirSync(join(ROOT, "guide/pages")).filter((x) => /^\d\d-/.test(x))) {
    const html = read(`guide/pages/${f}`);
    const prompts = html.indexOf("<h2>Prompts");
    if (prompts === -1) continue; // an activity with nothing to paste has no ordering to get wrong

    for (const [code, after] of flag) {
      const at = html.indexOf(`<pre>${esc(code)}</pre>`);
      if (at === -1) continue;
      checked++;
      if (after) {
        ok(
          at > prompts,
          `${f}: "${code.split("\n")[0]}" checks the work but is listed above the prompts — it reads as something to run before there is anything to check`
        );
      } else {
        ok(
          at < prompts,
          `${f}: "${code.split("\n")[0]}" has to be run before the prompt is pasted, but is listed below it`
        );
      }
    }
  }
  ok(checked >= 6, `expected to place several commands relative to the prompts, placed ${checked}`);

  // The second group needs a heading of its own. Without one it is a bare run of
  // copy blocks under the prompts, which reads as more prompts.
  ok(
    /<h2>Check your work<\/h2>/.test(read("guide/pages/02-coding-challenges.html")),
    "the after-the-prompt commands must sit under their own heading"
  );
});

// The container exists so that permission prompts are not the safety layer - that is
// what the Levels of Safety slide argues, and it is why the image runs as a non-root
// user in the first place. Opening the day WITHOUT the flag and introducing it at
// activity 09 spent Part 1 approving edits one at a time inside the very thing that
// made approving them unnecessary.
test("the Claude terminal opens in the mode the day is actually run in", null, () => {
  const day = read("guide/pages/start-your-day.html");

  const opener = day.match(/<pre>(docker compose[^<]*claude-container claude[^<]*)<\/pre>/);
  ok(opener, "start-your-day.html no longer carries the command that opens the Claude terminal");
  ok(
    /--dangerously-skip-permissions/.test(opener[1]),
    `the Claude terminal opens without the flag ("${opener[1]}") — the room then approves every edit all morning inside a container built so they would not have to`
  );

  // A flag called dangerous, unexplained, is worse than no flag. It is explained
  // where the reader first meets it, and exactly once.
  ok(
    /About that flag/.test(day),
    "the flag appears on start-your-day.html with nothing saying why it is defensible here"
  );
  ok(
    day.indexOf("About that flag") > day.indexOf("--dangerously-skip-permissions"),
    "the explanation must sit with the command it explains, not above it"
  );
  const explained = guidePages().filter((p) => /About that flag/.test(read(p)));
  ok(
    explained.length === 1,
    `the flag is explained on ${explained.length} pages (${explained.join(", ")}) — it was two identical copies before, which is how they drifted out of step with the command`
  );

  // The CLI shows a one-time disclaimer before honouring the flag, and SILENTLY
  // DOWNGRADES to default mode without it. A workshop that seeds the flag and not
  // the answer gets neither the dialog it expected nor the mode it asked for.
  ok(
    /bypassPermissionsModeAccepted/.test(codeOf("workshop/start-app.sh")),
    "the container asks for bypass mode but never answers the disclaimer that gates it — Claude quietly falls back to asking for permission on every edit"
  );
});

// The credential was prose with an "or" in it, and that is what produced the swap
// above. Two sections, at most one open, so the instructions that are not yours are
// never on screen to be followed by accident.
test("the two credentials are exclusive sections, not a list of options", null, () => {
  const html = read("guide/pages/environment-setup.html");
  const creds = [...html.matchAll(/<details class="cred"[^>]*>/g)].map((m) => m[0]);
  ok(creds.length === 2, `expected exactly two credential sections, found ${creds.length}`);

  // Native exclusivity, so it holds with JavaScript off.
  ok(
    creds.every((d) => /name="credential"/.test(d)),
    'both sections must share a <details name="..."> group — that is what makes them exclusive without JavaScript'
  );
  // ...and a fallback, so it also holds on a browser that predates the attribute,
  // where it would otherwise silently degrade to both open.
  ok(
    /data-exclusive/.test(html) && /other\.open = false/.test(codeOf("guide/src/build-guide.js")),
    "there must be a JS fallback closing the sibling — without it, older browsers show both credentials at once, which is the state these sections exist to prevent"
  );
  ok(
    creds.filter((d) => / open/.test(d)).length === 1,
    "exactly one section must start open — none looks like a page that failed to load, both defeats the point"
  );
  ok(
    / open/.test(creds[0]) && /Claude subscription/.test(html.slice(html.indexOf(creds[0]), html.indexOf(creds[0]) + 400)),
    "the subscription section must be the one open by default — it is what most of the room has"
  );

  // Each section says which .env line is ITS line, and says to leave the other alone.
  const body = html.slice(html.indexOf(creds[0]));
  ok(
    /CLAUDE_CODE_OAUTH_TOKEN/.test(body) && /ANTHROPIC_API_KEY/.test(body),
    "each section must name the .env line it belongs to"
  );

  // The credential must not also be sitting in the numbered pathway commands: that
  // was a `claude setup-token` block shown to everyone, including the two thirds of
  // the room it did not apply to.
  ok(
    !/data-pathway="macos"[\s\S]{0,4000}claude setup-token/.test(html),
    "claude setup-token must not be a numbered pathway command — which command you run (if any) is exactly what the two sections disagree about"
  );
});


let passed = 0;
const failures = [];

console.log("\n  Workshop repo tests\n");
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  const tag = t.guards ? `  [${t.guards}]` : "";
  try {
    await t.fn();
    passed++;
    console.log(`  PASS  ${t.name}${tag}`);
  } catch (err) {
    failures.push({ t, err });
    console.log(`  FAIL  ${t.name}${tag}`);
  }
}

if (failures.length) {
  console.log("\n  FAILURES\n");
  for (const { t, err } of failures) {
    console.log(`  ${t.name}`);
    console.log(`      ${err.message}`);
    if (!(err instanceof Failure)) console.log(`      (${err.stack?.split("\n")[1]?.trim() ?? "no stack"})`);
    console.log("");
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed, ${tests.length} total\n`);

// process.exitCode, NOT process.exit(). process.exit() tears the process down while
// libuv still holds handles from the spawned server, which on Windows aborts with
//   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c
// and reports exit 127 — so an all-green run fails CI for a reason that has nothing
// to do with the tests. Setting exitCode lets Node close its handles and then exit
// with the code we asked for.
process.exitCode = failures.length ? 1 : 0;
