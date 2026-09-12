// Static file server — the Windows-container stand-in for `nginx:alpine`.
//
// Why this exists: there is no Windows-container equivalent of nginx:alpine. The
// official IIS image (mcr.microsoft.com/windows/servercore/iis) would work, but it
// is a multi-gigabyte second pull for the sake of serving one static HTML file.
// The workshop image already has Node, so the web service runs from the *same*
// image as the agent — one build, one pull, two services. That keeps the stack the
// same shape as the Linux one (something serving a site + an agent that can see it)
// without doubling the download an attendee waits on.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(process.env.SERVE_ROOT || "C:/site");
const PORT = Number(process.env.SERVE_PORT || 80);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// An ALLOWLIST of the files under ROOT, built by walking the directory: URL path
// ("pages/platform.html") -> absolute path on disk.
//
// Why an allowlist rather than sanitising the request path: it removes the bug class
// instead of defending against it. No value derived from the request ever reaches
// readFile — the request is only ever used as a KEY, and every path served comes
// from readdir. A traversal attempt cannot match a key, so it 404s like any other
// miss, and there is no normalise-then-check sequence to get subtly wrong.
//
// (The previous version did resolve-then-startsWith, which is a correct check but
// still passes request-derived data into a path expression. CodeQL flagged it as
// js/path-injection, and it was right to: the safety depended on my check being
// exhaustive, which is a worse position than the data never arriving.)
async function buildIndex(root) {
  const files = new Map();
  const walk = async (dir, prefix) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(abs, key);
      else files.set(key, abs);
    }
  };
  await walk(root, "");
  return files;
}

let index = await buildIndex(ROOT);

// Resolve a request to a file we already know about, or null.
async function lookup(key) {
  // Rebuild once on a miss so a file added after start-up is still served — these
  // directories hold a handful of files, so this is cheap.
  if (!index.has(key)) index = await buildIndex(ROOT);
  if (index.has(key)) return index.get(key);

  // A directory request, or "/" itself, means that directory's index.html.
  const asIndex = key ? `${key}/index.html` : "index.html";
  if (index.has(asIndex)) return index.get(asIndex);
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    // Trim the leading and trailing slashes so the key matches how buildIndex spells
    // it. "/" becomes "", which lookup() maps to index.html — getting that wrong is
    // what previously served the DIRECTORY, leaving the content type as
    // application/octet-stream so Firefox downloaded the page instead of rendering
    // it, and Playwright failed with the unhelpful "Download is starting".
    const key = urlPath.replace(/^\/+/, "").replace(/\/+$/, "");

    const servedPath = (await lookup(key)) ?? (await lookup(""));
    if (!servedPath) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }

    const body = await readFile(servedPath);
    res.writeHead(200, {
      // Derived from the path actually SERVED, not the one requested: the header has
      // to describe the bytes going out.
      "content-type": TYPES[extname(servedPath).toLowerCase()] || "application/octet-stream",
      "content-length": body.length,
      "cache-control": "no-store",
    }).end(body);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" }).end(`server error: ${err.message}`);
  }
});

// Listening on 0.0.0.0 matters: bind to localhost and the port publish from the
// Windows container NAT network silently answers nothing from the host.
server.listen(PORT, "0.0.0.0", () => {
  console.log(`serving ${ROOT} on http://0.0.0.0:${PORT}/`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
