// Check 5 of the environment check: drive a real headless browser against the
// workshop site and capture a self-evidencing screenshot.
//
// "Self-evidencing" is the point — the captured page literally reads
// "ENVIRONMENT OK" and carries the container hostname, timestamp and checkpoint.
// An attendee who opens verify.png needs nobody to interpret it for them, and it
// is the single artefact worth showing a facilitator when something looks wrong.
import { chromium } from "playwright";
import { hostname } from "node:os";
import { mkdirSync } from "node:fs";

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
// them beside the file path. The container these ran in is destroyed the moment the
// check finishes (--rm, then compose down), so its hostname is otherwise unknowable
// — and "check the screenshot shows your container name" is not a check anybody can
// perform against a name they were never told.
console.log(`VERIFY_HOST=${HOST}`);
console.log(`VERIFY_STAMP=${STAMP}`);
console.log(`screenshot written to ${OUT}`);
