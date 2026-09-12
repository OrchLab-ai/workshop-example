# Windows-containers support layer

**You need this only if Docker Desktop on your machine is set to *Windows
containers*.** Most people are not, and should run `./verify.sh` from the repo root as
the main README says.

Not sure? Run this:

```powershell
docker info --format '{{.OSType}}'
```

- prints `linux` → use `.\verify.sh` from the repo root. Stop reading here.
- prints `windows` → you are in the right place.

Either entry point will also tell you if you picked the wrong one, so a mistake costs
you one command, not an afternoon.

---

## Run the check

From the **repo root**:

```powershell
powershell -ExecutionPolicy Bypass -File windows\verify.ps1
```

It prints the same five-line checklist and the same one-line verdict as the Linux
check, and writes the same `screenshots\verify.png` proof and `verify-report.txt`.

| Command | What it does |
|---|---|
| `.\windows\verify.ps1` | The normal run |
| `$env:VERIFY_PORT=8081; .\windows\verify.ps1` | Use a different port if 8080 is taken |
| `.\windows\verify.ps1 -Quiet` | One-line verdict only (facilitators sweeping a room) |
| `.\windows\verify.ps1 -Keep` | Leave the containers up afterwards |
| `.\windows\verify.ps1 -Help` | Options and environment variables |

The first run pulls a ~2 GB Windows base image and builds on top of it, so give it
time. Later runs reuse both.

### Host requirements

| Requirement | Why |
|---|---|
| Windows 10/11 or Server, **amd64** | Windows containers need a Windows kernel; there is no emulation, and the base images are x86-64 only |
| Docker Desktop in Windows-container mode | One daemon serves one mode |
| The **Containers** optional feature enabled | Separate from Hyper-V, and easy to miss — see below |
| ~10 GB free disk | Base image plus the workshop layers |

> **If "Switch to Windows containers" appears to do nothing,** the `Containers`
> optional feature is probably off. It is *separate* from Hyper-V and can be disabled
> while every other signal looks healthy. Enable it from an elevated prompt and
> **reboot**:
>
> ```powershell
> Enable-WindowsOptionalFeature -Online -FeatureName Containers -All -NoRestart
> ```

---

## What this package contains

```
windows/
  verify.ps1                   # The check. PowerShell 5.1 compatible. Start here.
  Dockerfile                   # Server Core + Node + Playwright/Firefox + Claude Code
  docker-compose.windows.yml   # Two services, both from the one image
  src/
    package.json               # Pins playwright. Local, not global — see below.
    serve.mjs                  # Static file server; the nginx:alpine stand-in
    screenshot.mjs             # Check 5; drives Firefox and captures the proof
```

The page being screenshotted is **not** duplicated here — both stacks serve
`../verify/site/index.html`, so there is one source of truth for what "ENVIRONMENT OK"
looks like.

---

## How it differs from the Linux stack, and why

Every difference below is forced by Windows, not a preference. Each one is also
commented at the point it occurs in the code.

### Firefox, not Chromium

**Chromium cannot render in a Windows Server Core container.** It installs, starts and
answers `--version`, then dies on any actual page render with `0xC00000FD
STATUS_STACK_OVERFLOW`. Through the Playwright API it surfaces as the misleading
*"Target page, context or browser has been closed"*.

This was established by measurement, not guesswork — fonts, memory, browser flags and
DLL dependencies were each ruled out, and were each *not* the cause. Firefox worked
immediately. **Treat Chromium here as unsupported, not untested**, and do not switch it
back without a rendered PNG to prove it.

The engine comes from `PW_BROWSER` so nothing hard-codes it.

### Both services run the same image

There is no Windows equivalent of `nginx:alpine`, and the official IIS image is a
multi-gigabyte second pull to serve one static HTML file. The image already has Node, so
the web service runs `src/serve.mjs`. One build, one pull, two services — and the stack
keeps the same shape as the Linux one: something serving a site, and an agent that can
see it through a real browser.

### Playwright is installed *locally*, not globally

This looks like a style choice and is not. **`NODE_PATH` applies only to CommonJS
`require()`, never to ESM `import`.** A globally-installed `playwright` is simply not
importable from an `.mjs` file — you get `ERR_MODULE_NOT_FOUND: Cannot find package
'playwright'` no matter what `NODE_PATH` says. A real `node_modules` next to the scripts
is the fix.

### Other forced differences

- **Mounts are directories only.** Windows containers cannot bind-mount a single file,
  so the check scripts are baked into the image rather than mounted.
- **Bind sources must pre-exist.** Windows Docker refuses to start on a missing bind
  source where the Linux daemon silently creates one; `verify.ps1` creates
  `screenshots\` first.
- **Fonts are installed.** The base image ships exactly one. Without them the
  screenshot is legible but looks nothing like the page in your browser.
- **Hyper-V isolation, with an explicit memory limit.** The Hyper-V default is 1 GB,
  which is not comfortable headroom for a browser; the compose file sets 4 GB. Override
  with `WINDOWS_MEMORY`, or set `WINDOWS_ISOLATION=process` on a Windows Server host
  without Hyper-V.

---

## Security: this is *not* equivalent to the Linux sandbox

Said plainly because it matters, and because a reassuring summary here would be a lie.

The Linux stack sets `read_only: true`, `cap_drop: ALL`, `no-new-privileges`, and keeps
secrets in tmpfs. **None of those have a Windows-container equivalent.** They are absent
from the compose file because they are unsupported, not forgotten. Egress allowlisting
is *structurally* impossible in this mode — it uses a Squid sidecar, which is a Linux
image, and a Windows-mode daemon cannot run Linux containers at all.

What is in place: a non-admin `ContainerUser`, Hyper-V isolation (each container gets
its own kernel, which on that one axis is stronger than Linux containers sharing the
host's), and the same restricted mount surface.

For **this** check the delta barely matters — it renders one static page that it ships
itself. It would matter a great deal if this image were later promoted to run the
workshop's autonomous exercises, where an agent executes arbitrary code. That promotion
should not ride on this check passing.

---

## If a check fails

`verify.ps1` stops at the first failure and tells you what to do. Detailed output for
every step lands in `.verify-logs\`, and a pasteable plain-text copy of the verdict in
`verify-report.txt`.

| Symptom | Cause |
|---|---|
| `no matching manifest for windows/...` | A Linux-only image is being pulled. Tell a facilitator. |
| Build fails early, no network error | Check `.verify-logs\02-build.log`; the first build pulls ~2 GB. |
| `claude: not found` inside the container | The npm global prefix grant. See `.claude/context/findings.yaml` → WIN-007. |
| Screenshot check passes but no PNG on the host | Docker Desktop file sharing, or a missing bind source. |
| Switching container modes does nothing | The `Containers` optional feature is off. See above. |

Deeper background, including everything that was measured rather than assumed, is in
[`../.claude/context/`](../.claude/context/) — start with `index.yaml`.
