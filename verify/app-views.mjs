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

// Resolve playwright from a NAMED package root rather than from wherever this file
// happens to be mounted. The in-container run executes this script from outside the
// repo tree, so a bare `import "playwright"` would look in /usr/local/bin/node_modules
// and find nothing — while the module sits in the repo's own node_modules volume.
// VERIFY_REQUIRE_FROM points at the package.json to resolve against; unset, it falls
// back to this file's own location, which is what the verify image wants.
const require = createRequire(process.env.VERIFY_REQUIRE_FROM || import.meta.url);
const { chromium } = require("playwright");

const URL = process.env.VERIFY_URL;
const OUT = process.env.VERIFY_OUT;
const LABEL = process.env.VERIFY_LABEL || "unlabelled";

if (!URL || !OUT) {
  console.error("VERIFY_URL and VERIFY_OUT are both required");
  process.exit(2);
}

mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });

const browser = await chromium.launch();
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
  await browser.close();
  console.error(
    `FAIL ${LABEL}: ${URL} returned ${response ? response.status() : "no response"}`
  );
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
console.log(`VIEW_URL=${URL}`);
console.log(`VIEW_HOST=${hostname()}`);
console.log(`VIEW_TITLE=${title}`);
console.log(`VIEW_HEADING=${heading}`);
console.log(`VIEW_LINKS=${links}`);
console.log(`VIEW_OUT=${OUT}`);
