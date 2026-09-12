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
//     are covered by verify.sh / verify.ps1 themselves.
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
//   * that a browser actually renders (that IS check 5; run verify.sh / verify.ps1)
//   * anything about credentials or the network
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
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
  ok(/^verify\.sh\s+text\s+eol=lf/m.test(ga), "verify.sh has no extension to match on and must be named explicitly");
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

test("verify.sh disables MSYS path conversion", "WIN-025", () => {
  const sh = codeOf("verify.sh");
  ok(
    /export\s+MSYS_NO_PATHCONV=1/.test(sh),
    "verify.sh must export MSYS_NO_PATHCONV=1, or Git Bash rewrites the CONTAINER path /work/screenshot.mjs into a Windows host path and check 5 fails with a MODULE_NOT_FOUND naming a path nobody wrote"
  );
  ok(/export\s+MSYS2_ARG_CONV_EXCL=/.test(sh), "verify.sh must also set MSYS2_ARG_CONV_EXCL for MSYS2 shells");
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

test("verify.sh and verify.ps1 present the same five checks", null, () => {
  const labels = ["Docker daemon reachable", "Workshop image builds", "Claude Code CLI + auth", "Workshop site responds", "Playwright screenshot captured"];
  const sh = read("verify.sh");
  const ps = read("windows/verify.ps1");
  for (const label of labels) {
    ok(sh.includes(label), `verify.sh is missing the check labelled "${label}"`);
    ok(ps.includes(label), `windows/verify.ps1 is missing the check labelled "${label}" — the two must stay in step or a Windows attendee cannot compare notes with the room`);
  }
});

test("each entry point redirects to the other on the wrong daemon mode", "WIN-001", () => {
  ok(/OSType/.test(codeOf("verify.sh")), "verify.sh must detect Windows-container mode rather than failing at check 2 blaming the network");
  ok(/OSType/.test(codeOf("windows/verify.ps1")), "windows/verify.ps1 must detect Linux-container mode");
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

  const sh = codeOf("verify.sh");
  ok(
    /permission denied|access is denied/i.test(sh),
    "verify.sh must recognise a permission failure rather than calling it a stopped daemon"
  );
  ok(/docker-users/.test(sh), "verify.sh must name docker-users for Git Bash users on Windows");
  ok(/usermod -aG docker/.test(sh), "verify.sh must give the docker-group fix on Linux");
});

test("the permission fix tells the user to sign out, not just to re-run", "WIN-026", () => {
  // Windows grants group rights at LOGON, and the Linux docker group behaves the
  // same way. Advice that omits this reads as "the fix did not work".
  const ps = codeOf("windows/verify.ps1");
  const sh = codeOf("verify.sh");
  ok(/SIGN OUT|sign out/.test(ps), "verify.ps1's docker-users advice must say to sign out and back in");
  ok(/SIGN OUT|LOG OUT|sign out|log out/i.test(sh), "verify.sh's permission advice must say to log out and back in");
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
  } finally {
    for (const [p, buf] of before) writeFileSync(join(ROOT, p), buf);
  }
});

test("the guide offers a macOS and a Windows pathway, with distinct commands", null, () => {
  const html = read("guide/pages/platform.html");
  for (const id of ["macos", "windows-linux", "windows-windows"]) {
    ok(html.includes(`data-pathway="${id}"`), `platform.html is missing the "${id}" pathway`);
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
  ok(panel("macos").includes("./verify.sh"), "the macOS pathway must use ./verify.sh");
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
