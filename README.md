# OrchLab Workshop — Example Container

The single repository you need for the whole workshop. One container, one
codebase, built up level by level across the day.

**Do this before you arrive.** It takes about five minutes, most of it waiting
for a download.

---

## Before the workshop: run the environment check

```bash
git clone https://github.com/OrchLab-ai/workshop-example.git
cd workshop-example
cp .env.example .env      # then paste your token in — see below
./verify.sh
```

### On Windows with Docker Desktop in *Windows-container* mode

Check which mode you are in:

```bash
docker info --format '{{.OSType}}'
```

If that prints `linux`, carry on above — nothing changes for you. If it prints
`windows`, the command above cannot work: every image this check uses is a Linux
image, and one Docker daemon serves one mode. Run the Windows check instead, which
proves the same five things and needs no daemon switch:

```powershell
powershell -ExecutionPolicy Bypass -File windows\verify.ps1
```

`./verify.sh` will tell you this too rather than failing confusingly. See
[`windows/README.md`](windows/README.md) for the detail.

### Getting your token

If you have a Claude subscription, run this **on your own machine** (not in the
container):

```bash
claude setup-token
```

Copy the value it prints into `.env` as `CLAUDE_CODE_OAUTH_TOKEN`. If you use an
API key from [console.anthropic.com](https://console.anthropic.com) instead, set
`ANTHROPIC_API_KEY` and leave the token blank.

### What a pass looks like

```
============================================================
   ORCHLAB WORKSHOP - ENVIRONMENT CHECK
============================================================

   [1/5]  Docker daemon reachable ..................  PASS   27.3.1
   [2/5]  Workshop image builds ....................  PASS   58s
   [3/5]  Claude Code CLI + auth ...................  PASS   claude 2.0.14, credential present
   [4/5]  Workshop site responds ...................  PASS   HTTP 200 on :8080, 4s
   [5/5]  Playwright screenshot captured ...........  PASS   verify.png, 184 KB

   ALL 5 CHECKS PASSED

   Your environment is ready. There is nothing else to do.
   Open screenshots/verify.png to see the proof - it should read
   "ENVIRONMENT OK" with your container name and the time.

============================================================
```

If you see `ALL 5 CHECKS PASSED`, **you are done.** There is no second step, no
extra setup, and nothing to prepare. Close the terminal.

Open `screenshots/verify.png` if you want to see it for yourself — a real
headless browser rendered that page and captured it from inside your container.

### What a failure looks like

The run stops at the first failed check and tells you exactly what to do:

```
   [3/5]  Claude Code CLI + auth ...................  FAIL

   1 CHECK FAILED - this is fixable, and you are not behind.

       Failed check:    Claude Code CLI + auth
       What went wrong: no credential found - .env has neither
                        CLAUDE_CODE_OAUTH_TOKEN nor ANTHROPIC_API_KEY
       Fix it:          run  claude setup-token
                        ...
       Still stuck?     raise your hand - do not keep retrying.
```

A plain-text copy lands in `verify-report.txt`. Paste that when you ask for help
— it saves everyone a round trip.

### Options

| Command | What it does |
|---|---|
| `./verify.sh` | The normal run |
| `VERIFY_PORT=8081 ./verify.sh` | Use a different port if 8080 is taken |
| `./verify.sh --quiet` | One-line verdict only (facilitators sweeping a room) |
| `./verify.sh --keep` | Leave the containers up afterwards |

Detailed output from every step is kept in `.verify-logs/` — you should not need
it, but it is there when a check fails.

---

## What the check actually proves

Each check maps to something the workshop depends on, so a pass is meaningful
rather than decorative.

| # | Check | Why the workshop needs it |
|---|---|---|
| 1 | Docker daemon reachable | Docker is the safety boundary for every autonomous exercise |
| 2 | Workshop image builds | You can build locally — no network surprise mid-exercise |
| 3 | Claude Code CLI + auth | The agent runs *inside* the container, not on your laptop |
| 4 | Workshop site responds | The app under test is reachable from your machine |
| 5 | Playwright screenshot | Your agent can *see* — the basis of self-verification in Part 3 |

The check container is built to the same shape as the real workshop container
(Playwright base image, Claude Code CLI, non-root user), so a pass here predicts
a pass later.

---

## Repository layout

```
verify.sh                    # The environment check — start here
checkpoint.sh                # Jump between checkpoints; parks your work safely
docker-compose.verify.yml    # Two-service check stack (site + agent)
verify/
  Dockerfile                 # Playwright base + Claude Code CLI
  screenshot.mjs             # Check 5 — drives the browser, captures proof
  site/index.html            # The "ENVIRONMENT OK" page
checkpoints/
  manifest.txt               # The ladder — single source of truth
  README.md                  # How checkpoints work; publishing guide
guide/
  start-here.html            # The how-to guide — open this in a browser
  pages/                     # Activities, platform.html (setup), links.html
  src/activities.js          # Guide content as data
  src/build-guide.js         # Regenerates the guide (no dependencies)
windows/                     # Windows-containers support layer
  verify.ps1                 # The check, for Docker in Windows-container mode
  Dockerfile                 # Server Core + Node + Playwright/Firefox + Claude Code
  README.md                  # When you need this, and how it differs
tests/run-tests.mjs          # Repo invariant tests — no deps, no Docker
screenshots/                 # verify.png lands here
```

More arrives with each checkpoint — see below.

---

## The how-to guide

Open **[`guide/start-here.html`](guide/start-here.html)** in a browser — double-click
it, no server needed. That is the only file at the top of `guide/`, so there is never
a question about which one to open.

It asks *what are you trying to do?* and each activity has its own page: the steps,
what success looks like, every command and prompt as a one-click copy, and a
collapsed "Stuck? Open this" section with the shortcut when you need it.

### Pick your operating system first

**[`guide/pages/platform.html`](guide/pages/platform.html)** — linked as **SETUP** in
the header of every page — asks which machine you are on and gives you the exact
commands for it. It is worth doing before anything else, because the environment
check is a *different script* depending on your setup.

On Windows it asks a second question, and hands you a command to answer it rather
than having you guess:

```bash
docker info --format '{{.OSType}}'
```

Docker Desktop on Windows runs **either** Linux containers **or** Windows
containers — one daemon, one mode, never both — and each needs a different check.
Your answer is remembered across pages, so the environment-check activity shows the
same pathway you chose.

| Answer | Pathway | Shell | Check |
|---|---|---|---|
| macOS | Only one — there is no Windows-container mode on a Mac | Terminal | `./verify.sh` |
| `linux` | Linux containers — the usual Windows setup | Git Bash | `./verify.sh` |
| `windows` | Windows containers — see [`windows/README.md`](windows/README.md) | PowerShell | `windows\verify.ps1` |

Guess wrong and nothing breaks: each script detects the wrong container mode and
points you at the other one.

There is also a **light / dark toggle** in the header of every page. It follows your
system setting to begin with and remembers your choice after that.

### Layout

```
guide/
  start-here.html    The entry point — the only file here, double-click it
  pages/             Every other page: the 10 activities, platform.html, links.html
  src/
    activities.js    The workshop content as data — edit this
    build-guide.js   The generator: no dependencies, no build tooling
```

The generated pages are committed so attendees never need to run a build. After
editing `guide/src/activities.js`, regenerate them:

```bash
node guide/src/build-guide.js
```

`node tests/run-tests.mjs` fails if you forget — it regenerates the guide and
compares, and separately checks that every internal link still resolves.

---

## Tests

```bash
node tests/run-tests.mjs
```

No dependencies, no Docker, no Windows required — it runs anywhere Node does, in a
second or two. Most of the checks are **regression guards** for bugs that actually
happened, and each names the finding in
[`.claude/context/findings.yaml`](.claude/context/findings.yaml) that records it.

It does **not** prove that either image builds or that a browser renders — those need
a Docker daemon in the right mode, and they are exactly what `verify.sh` and
`windows\verify.ps1` are for. A green run here means the invariants hold, not that
the workshop works.

---

## Checkpoints

The workshop builds one feature — **Mission Updates** — four times, once at each
level. Every activity is bracketed by a git tag, so if an exercise doesn't land
you are never locked out of the next one.

```bash
./checkpoint.sh --list      # the whole ladder
./checkpoint.sh --status    # where am I, and what's next
./checkpoint.sh 4           # jump to the state after activity 4
./checkpoint.sh --parked    # find work an earlier jump parked for you
```

Jumping commits your in-progress work to a `wip/` branch first and lands you on
a `work/cp-NN` branch you can commit to. **Nothing is ever discarded** — see
[`checkpoints/README.md`](checkpoints/README.md) for the full model.

| Tag | State |
|---|---|
| `cp-00` | Clean clone, environment verified ← **you are here** |
| `cp-01` | Warm-up challenge complete |
| `cp-02` | Playwright sight wired up |
| `cp-03` | Micro/mega-prompt Mission Updates |
| `cp-04` | `mission-updates.spec.md` written |
| `cp-05` | Your own brand written and applied to the app |
| `cp-06` | Spec-driven Mission Updates built, in your brand |
| `cp-07` | Autonomous agent run |
| `cp-08` | Plan → code handoff complete |

Checkpoints beyond `cp-00` are published as the container is built out;
`--list` shows you which exist. Asking for one that doesn't yet gives you a
clear "not published yet", not an error.
