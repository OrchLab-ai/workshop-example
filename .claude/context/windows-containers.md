# Windows containers — the narrative

The *what* is in `findings.yaml` and `environment-baseline.yaml`. This file is the
*why*, for whoever picks this up next.

## The problem in one paragraph

The workshop's environment check (`verify-setup.sh`) is a Linux-container stack:
`nginx:alpine` serves a page, and a `mcr.microsoft.com/playwright:...-noble` container
screenshots it. On a Windows host whose Docker Desktop is set to **Windows
containers**, none of that can run — a Docker daemon serves one mode or the other,
never both, and the Linux images have no Windows manifest. Worse, the failure was
*mislabelled*: check 1 ("Docker daemon reachable") passed happily, and the run died at
check 2 saying **"this is almost always a network problem"**. An attendee in that
state debugs their wifi for twenty minutes over what is really a one-line mode switch.

## Why a separate package and not a patch

The obvious fix is "switch Docker Desktop to Linux containers". It was rejected,
because switching is not free: it **stops every running Windows container**. On the
machine this was developed against, a Windows container was actively running. For
anyone whose day job needs Windows images — .NET Framework work, most obviously — "lose
your other containers to run the workshop check" is a bad trade to impose at 9am on
workshop day.

So `windows/` is a genuine second implementation rather than a compatibility shim:

| | Linux stack | Windows stack |
|---|---|---|
| Entry point | `./verify-setup.sh` | `windows\verify.ps1` |
| Compose | `docker-compose.workshop.yml` — the real stack, started via `workshop/up.sh` | `windows/docker-compose.windows.yml` — a stand-in stack |
| Web service | `nginx:alpine` | the same image, running `src/serve.mjs` |
| Browser | Chromium | **Firefox** (Chromium cannot work — see below) |
| Site page | `verify/site/index.html` | the same file, shared not duplicated |
| Checks | 8, asked of the workshop container itself | 6, same output format |

Both entry points now detect the wrong mode and point at the other one, so an attendee
cannot get stuck in the gap between them.

## Firefox, not Chromium — and this is not negotiable

The single most valuable thing inherited from the sibling
`../ai-codebase-accelerator` pilot. **Chromium does not render in a Windows Server Core
container.** It installs, it starts, it answers `--version` — and then dies on any
actual page render with `0xC00000FD STATUS_STACK_OVERFLOW`. Through the Playwright API
this surfaces as the thoroughly misleading *"Target page, context or browser has been
closed"*.

The pilot ruled out every plausible cause **by measurement**: 22 real fonts left the
crash byte-identical, 4.5 GB and 4 CPUs changed nothing, six flag combinations all
failed the same way, and `winldd` showed every DLL dependency resolving. Firefox then
worked on the first attempt. That result was re-confirmed here before a line of the
Dockerfile was written — a probe launched all three engines inside a Windows container
and only Firefox rendered.

The lesson worth carrying: **when a browser engine will not start in a constrained OS,
try another engine before debugging the first.** Days went into Chromium; Firefox took
one cheap experiment.

Two consequences to respect:

- The engine is read from `PW_BROWSER`, never hard-coded. A banner or comment that
  says "Chromium" sends the next agent to debug the one engine that cannot work here.
- **Baselines are engine-specific.** If a repo is ever visual-tested on both editions,
  keep the engine in the baseline path or Linux/Chromium and Windows/Firefox will
  overwrite each other's PNGs.

Fonts are still installed (23 of them, the same count the pilot measured on a cold
build) — not to fix Chromium, but because the base image ships **exactly one** font.
Without them the screenshot is legible but looks nothing like the page in a real
browser, which for a check whose entire job is to be *believable* is worse than
failing loudly.

## What Windows forced, and what it merely suggested

Every difference in `windows/` is commented in place. The ones that are genuinely
forced, not stylistic:

- **No `nginx:alpine` equivalent.** The official IIS image is a multi-gigabyte second
  pull to serve one static HTML file, so the web service runs the *same image* as the
  agent with a ~70-line Node static server. One build, one pull, two services — and
  the stack keeps the same two-service shape as the Linux one.
- **No single-file bind mounts.** Windows containers mount directories only, so the
  Linux stack's `./verify/screenshot.mjs:/work/screenshot.mjs:ro` has no equivalent and
  the check scripts are baked into the image.
- **Bind sources must pre-exist.** Windows Docker refuses to start on a missing bind
  source where the Linux daemon silently creates one. `verify.ps1` creates
  `screenshots\` before calling compose.
- **ACLs by SID, never by name.** `*S-1-5-93-2-2`. Granting the *name* `ContainerUser`
  targets a different principal than the one the process runs as; the grant looks
  applied and does nothing.
- **Profile env vars must be pinned.** Otherwise `ContainerUser` gets a throwaway
  profile at `C:\Users\TEMP`, and anything keyed off `%USERPROFILE%` silently
  evaporates on restart *while a declared volume sits empty*.
- **No double quotes in a shell-form `RUN`.** Docker wraps the RUN in double quotes, so
  yours terminates that quoting early and is stripped. This is why `package.json` is
  `COPY`d rather than written by a `RUN` — JSON is all double quotes.

## The security delta — state it, never soften it

The Linux sandbox sets `read_only: true`, `cap_drop: ALL`, `no-new-privileges` and uses
tmpfs for secrets. **None of those have a Windows-container equivalent.** They are
absent from the compose file because they are unsupported, not because anyone forgot.
Egress allowlisting is *structurally* impossible in this mode: it is implemented with a
Squid sidecar, which is a Linux image, and a Windows-mode daemon cannot run Linux
containers at all.

What *is* in place: a non-admin `ContainerUser`, Hyper-V isolation (which on one axis is
stronger than Linux containers — the container gets its own kernel rather than sharing
the host's), and the same restricted mount surface.

**Never describe this as equivalent to the Linux sandbox.** For the workshop's
verification stack the delta is close to irrelevant — it renders one static page it
ships itself. It would matter a great deal if the Windows image were later promoted to
run the autonomous exercises, where an agent executes arbitrary code. That promotion
should not happen on the strength of this check passing.

## What is still not known

Honest gaps, so nobody mistakes this for finished:

1. **The Linux stack has never been run on this machine.** Doing so needs a daemon
   switch, which would have stopped the user's running containers. Everything known
   about the Linux path here is from reading it.
2. **`verify/screenshot.mjs` looks latently broken** (finding WIN-012). It is an ESM
   module importing `playwright` by bare specifier, while the image installs playwright
   globally and relies on `NODE_PATH` — which the ESM resolver ignores. That *should*
   fail. It presumably passes for real attendees, so the interesting question is why.
   Do not "fix" it on this reasoning alone; run it first.
3. **Process isolation is untested.** Only Hyper-V isolation has been exercised.
4. **Checkpoints beyond `cp-00` do not exist**, so `checkpoint.sh` was read but its
   jump/park behaviour was never executed.

## A note on stale caveats

A lesson the sibling repo learned the hard way and wrote down: *a stale caveat is an
overclaim with the sign flipped.* It is easy to police a feature list for
overclaiming and then let the "known issues" list rot — which makes the work look worse
than it is and sends the next engineer to re-fix something that already works. Both
lists are claims and both need a source. Before carrying an item out of this file,
check it with `git log -S` rather than assuming.
