// Check 7 of the environment check: drive a real headless browser against the
// verify-web page and capture a self-evidencing screenshot. It runs inside
// claude-container, the container attendees work in all day, so the browser it
// proves is the one the agent will drive.
//
// "Self-evidencing" is the point — the captured page literally reads
// "ENVIRONMENT OK" and carries the container hostname, timestamp and checkpoint.
// An attendee who opens verify.png needs nobody to interpret it for them, and it
// is the single artefact worth showing a facilitator when something looks wrong.
import { createRequire } from "node:module";
import { hostname } from "node:os";
import { mkdirSync } from "node:fs";

// THE AGENT'S BROWSER, resolved the same way app-views.mjs resolves it. The workshop
// image installs chromium for @playwright/mcp's bundled playwright-core and for
// nothing else, so a bare `import "playwright"` either fails to resolve or finds a
// build whose browser was never downloaded. See app-views.mjs for the full story.
const require = createRequire(import.meta.url);
const CANDIDATES = [
  process.env.VERIFY_MODULE,
  "/usr/lib/node_modules/@playwright/mcp/node_modules/playwright-core",
  "playwright",
  "playwright-core",
].filter(Boolean);

let chromium;
const tried = [];
for (const candidate of CANDIDATES) {
  try {
    ({ chromium } = require(candidate));
    break;
  } catch (err) {
    tried.push(`${candidate}: ${err.code || err.message}`);
  }
}
if (!chromium) {
  console.error("no usable playwright module");
  tried.forEach((t) => console.error(`  tried ${t}`));
  process.exit(2);
}

const URL = process.env.VERIFY_URL || "http://verify-web/";
const OUT = process.env.VERIFY_OUT || "/screenshots/verify.png";
const CHECKPOINT = process.env.VERIFY_CHECKPOINT || "cp-00";

mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const response = await page.goto(URL, { waitUntil: "load", timeout: 30_000 });
if (!response || !response.ok()) {
  await browser.close();
  throw new Error(`site returned ${response ? response.status() : "no response"} for ${URL}`);
}

// The page ships as a static file, so the run-specific facts are injected here
// rather than baked in — that way the screenshot proves *this* run, not a
// stale artefact left behind by an earlier one.
// Named, because these two are both stamped onto the page AND printed to stdout
// below for the caller to echo. Computing them inline in the evaluate() call was
// what made it impossible to tell the attendee what to look for.
const HOST = hostname();
const STAMP = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

await page.evaluate(
  ([host, stamp, checkpoint]) => {
    document.getElementById("host").textContent = host;
    document.getElementById("stamp").textContent = stamp;
    document.getElementById("checkpoint").textContent = checkpoint;
  },
  [HOST, STAMP, CHECKPOINT]
);

const heading = await page.textContent("h1");
if (!heading || !heading.includes("ENVIRONMENT OK")) {
  await browser.close();
  throw new Error(`page rendered but heading was "${heading}" — expected "ENVIRONMENT OK"`);
}

await page.screenshot({ path: OUT });
await browser.close();

// Report the two facts that were stamped INTO the image, so the caller can print
// them beside the file path. The container these ran in is stopped the moment the
// check finishes (compose down), so its hostname is otherwise unknowable
// — and "check the screenshot shows your container name" is not a check anybody can
// perform against a name they were never told.
console.log(`VERIFY_HOST=${HOST}`);
console.log(`VERIFY_STAMP=${STAMP}`);
console.log(`screenshot written to ${OUT}`);
