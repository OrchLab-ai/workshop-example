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
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

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

const server = createServer(async (req, res) => {
  try {
    // Strip the query string, then resolve inside ROOT. The containment check below
    // is what stops `GET /../../Windows/win.ini` escaping the site root — cheap to
    // add, and this server does get pointed at a bind mount.
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let rel = normalize(urlPath.replace(/^\/+/, ""));

    // normalize("") returns "." , not "" — so a request for "/" must be mapped to
    // index.html explicitly. Miss this and "/" resolves to the DIRECTORY, which has
    // no extension, so the content type below falls through to
    // application/octet-stream and Firefox DOWNLOADS the page instead of rendering
    // it. Playwright then fails page.goto with "Download is starting", which says
    // nothing about the real cause. (Chromium happens to sniff the type and render
    // anyway, so this bug is invisible on the Linux stack.)
    if (rel === "" || rel === "." || rel.endsWith("/") || rel.endsWith("\\")) {
      rel = join(rel === "." ? "" : rel, "index.html");
    }

    const target = resolve(join(ROOT, rel));
    if (target !== ROOT && !target.startsWith(ROOT + "\\") && !target.startsWith(ROOT + "/")) {
      res.writeHead(403, { "content-type": "text/plain" }).end("forbidden");
      return;
    }

    // Track the path actually SERVED, not the one requested: the content type must
    // describe the bytes being sent, so it has to be derived after any fallback.
    let servedPath = target;
    let body;
    try {
      body = await readFile(target);
    } catch {
      servedPath = join(ROOT, "index.html");
      body = await readFile(servedPath);
    }

    res.writeHead(200, {
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
