// Check 5 of the Windows environment check: drive a real headless browser inside a
// Windows container and capture a self-evidencing screenshot.
//
// Two things differ from the Linux original (verify/screenshot.mjs), both forced:
//
//  1. FIREFOX, NOT CHROMIUM. Chromium's Windows build is not usable in a Windows
//     container here, so the workshop's Windows image ships Playwright's Firefox.
//     Override with PW_BROWSER if you are experimenting.
//
//  2. EXPLICIT MODULE RESOLUTION. `NODE_PATH` does not apply to ESM `import` — only
//     to CommonJS `require`. A globally-installed `playwright` is therefore NOT
//     importable from an .mjs file no matter what NODE_PATH says; you get
//     "ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'". The image installs
//     playwright *locally* next to this script so a plain import works, and the
//     fallback below resolves it out of the global root if someone runs this script
//     from somewhere unexpected.
import { createRequire } from "node:module";
import { hostname } from "node:os";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const URL_ = process.env.VERIFY_URL || "http://verify-web/";
const OUT = process.env.VERIFY_OUT || "C:/screenshots/verify.png";
const CHECKPOINT = process.env.VERIFY_CHECKPOINT || "cp-00";
const BROWSER = process.env.PW_BROWSER || "firefox";
const GLOBAL_ROOT = process.env.NPM_GLOBAL_ROOT || "C:/npm-global/node_modules/";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (err) {
    if (err?.code !== "ERR_MODULE_NOT_FOUND") throw err;
    // Global install: resolve as CommonJS from the global root, which does work.
    return createRequire(GLOBAL_ROOT.endsWith("/") ? GLOBAL_ROOT : GLOBAL_ROOT + "/")("playwright");
  }
}

const pw = await loadPlaywright();
const engine = pw[BROWSER];
if (!engine) throw new Error(`unknown PW_BROWSER "${BROWSER}" — expected firefox, chromium or webkit`);

mkdirSync(dirname(OUT), { recursive: true });

const browser = await engine.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

try {
  const response = await page.goto(URL_, { waitUntil: "load", timeout: 60_000 });
  if (!response || !response.ok()) {
    throw new Error(`site returned ${response ? response.status() : "no response"} for ${URL_}`);
  }

  // The page ships as a static file, so run-specific facts are injected here rather
  // than baked in — the screenshot then proves *this* run, not a stale artefact.
  await page.evaluate(
    ([host, stamp, checkpoint, engineName]) => {
      const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };
      set("host", host);
      set("stamp", stamp);
      set("checkpoint", checkpoint);
      set("engine", engineName);
    },
    [
      hostname(),
      new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
      `${CHECKPOINT} (windows containers)`,
      BROWSER,
    ]
  );

  const heading = await page.textContent("h1");
  if (!heading || !heading.includes("ENVIRONMENT OK")) {
    throw new Error(`page rendered but heading was "${heading}" — expected "ENVIRONMENT OK"`);
  }

  await page.screenshot({ path: OUT });
  console.log(`screenshot written to ${OUT} using ${BROWSER}`);
} finally {
  // Without this a thrown error leaves the browser process alive and the
  // container hangs instead of failing the check.
  await browser.close();
}
