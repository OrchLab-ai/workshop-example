// Screenshot the REAL workshop app from one vantage point, and say what it saw.
//
// WHY THIS EXISTS, SEPARATELY FROM screenshot.mjs
// screenshot.mjs drives a browser against `verify-web` — a static page that exists
// only to prove Docker and Playwright work. It never touches the workshop app, which
// is exactly why two app-breaking bugs walked straight past every environment check:
//
//   1. start-app.sh probed /v1/campaigns, a route cp-01 renamed, so the boot banner
//      reported "API NOT RUNNING" against a perfectly healthy server.
//   2. /etc/hosts in the container maps localhost to ::1 with no IPv4 entry, while
//      Vite binds --host 0.0.0.0 (IPv4 only). Headless Chromium inside the container
//      therefore could not reach the site at all.
//
// Both were invisible because every check in the suite used curl, and curl falls back
// to IPv4 when IPv6 refuses. Chromium does not. The only thing that broke was the
// agent's view of the app — the one thing no check was looking at.
//
// So this script is deliberately a BROWSER check against the REAL app, and it is run
// from two vantage points that must agree. See workshop/verify-views.sh.
import { createRequire } from "node:module";
import { hostname } from "node:os";
import { mkdirSync } from "node:fs";

// USE THE AGENT'S OWN BROWSER, not merely a browser.
//
// Two containers run this and they do not have playwright in the same place, and more
// importantly they do not have the same BUILD of it. The workshop image installs
// chromium for @playwright/mcp's bundled playwright-core specifically (see
// app/autonomous/Dockerfile) because the MCP server expects a different build from the
// base image's. The repo's own node_modules carries a third version, whose browser was
// never downloaded — asking for that one fails with "Executable doesn't exist" against
// a container that is perfectly capable of driving a browser.
//
// So the MCP copy is tried FIRST. That is the exact stack the agent drives in activity
// 3, which makes this check the agent's vantage AND the agent's browser rather than an
// approximation of either. The verify image has no MCP, so it falls through to its own
// global install. VERIFY_MODULE overrides the lot when something moves.
const require = createRequire(process.env.VERIFY_REQUIRE_FROM || import.meta.url);

const CANDIDATES = [
  process.env.VERIFY_MODULE,
  "/usr/lib/node_modules/@playwright/mcp/node_modules/playwright-core",
  "playwright",
  "playwright-core",
].filter(Boolean);

let chromium;
let engine;
const tried = [];
for (const candidate of CANDIDATES) {
  try {
    ({ chromium } = require(candidate));
    engine = candidate;
    break;
  } catch (err) {
    tried.push(`${candidate}: ${err.code || err.message}`);
  }
}
if (!chromium) {
  console.error("FAIL: no usable playwright module");
  tried.forEach((t) => console.error(`  tried ${t}`));
  process.exit(2);
}

const URL = process.env.VERIFY_URL;
const OUT = process.env.VERIFY_OUT;
const LABEL = process.env.VERIFY_LABEL || "unlabelled";

if (!URL || !OUT) {
  console.error("VERIFY_URL and VERIFY_OUT are both required");
  process.exit(2);
}

mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  console.error(`FAIL ${LABEL}: could not launch chromium via ${engine}`);
  console.error(`  ${err.message.split("\n")[0]}`);
  console.error("  The browser binary for this playwright build is not present.");
  console.error("  This is the checker being unable to start, not the app being down.");
  process.exit(2);
}
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// Fail loudly on the failure mode this whole script exists for. A refused connection
// throws here rather than quietly producing a screenshot of a browser error page —
// which is precisely what the agent handed back, and precisely what looked like a
// broken app rather than a broken address.
let response;
try {
  response = await page.goto(URL, { waitUntil: "networkidle", timeout: 30_000 });
} catch (err) {
  await browser.close();
  console.error(`FAIL ${LABEL}: could not load ${URL}`);
  console.error(`  ${err.message}`);
  console.error("  If this is the in-container view and the host view passed, the");
  console.error("  address is wrong, not the app. Check: getent hosts localhost");
  process.exit(1);
}

if (!response || !response.ok()) {
  const status = response ? response.status() : null;
  await browser.close();
  console.error(`FAIL ${LABEL}: ${URL} returned ${status ?? "no response"}`);
  // 403 from a dev server that is plainly running is almost never authorisation.
  // Vite checks the Host header against server.allowedHosts and blocks anything it
  // does not recognise, so reaching it by service name fails while the identical
  // app answers on localhost. Say so, rather than leaving the reader to conclude
  // the app is down — which is the one thing it demonstrably is not.
  if (status === 403) {
    console.error("  A 403 here is Vite's allowedHosts check, not the app being down.");
    console.error("  It rejects Host headers it does not recognise. Reach it by IP");
    console.error("  or by localhost; a service name will always be blocked.");
  }
  process.exit(1);
}

// The fingerprint both vantage points are compared on. Pixels are the wrong thing to
// diff — fonts, animation timing and scrollbar width all vary between runs and would
// make a green check go red for no reason. What must agree is that both views loaded
// the same application: same document title, same heading, same number of rendered
// links. That is what "they should match" means in a way that stays true.
const title = (await page.title()) || "";
const heading = ((await page.textContent("h1").catch(() => "")) || "").trim();
const links = await page.locator("a").count();
const bodyChars = ((await page.textContent("body").catch(() => "")) || "").trim().length;

if (!heading && bodyChars < 200) {
  await browser.close();
  console.error(`FAIL ${LABEL}: ${URL} loaded but rendered nothing meaningful`);
  console.error(`  title="${title}" body=${bodyChars} chars`);
  console.error("  A blank page usually means the API is unreachable and the client");
  console.error("  rendered an empty shell. Check the API before blaming the page.");
  process.exit(1);
}

await page.screenshot({ path: OUT, fullPage: false });
await browser.close();

// Machine-readable, because verify-views.sh compares these across two runs in two
// different containers and needs to do it without parsing prose.
console.log(`VIEW_LABEL=${LABEL}`);
console.log(`VIEW_ENGINE=${engine}`);
console.log(`VIEW_URL=${URL}`);
console.log(`VIEW_HOST=${hostname()}`);
console.log(`VIEW_TITLE=${title}`);
console.log(`VIEW_HEADING=${heading}`);
console.log(`VIEW_LINKS=${links}`);
console.log(`VIEW_OUT=${OUT}`);
