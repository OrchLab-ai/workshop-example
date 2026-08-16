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
  index.html                 # The how-to guide — open this in a browser
  activities.js              # Guide content as data
  build-guide.js             # Regenerates the guide (no dependencies)
screenshots/                 # verify.png lands here
```

More arrives with each checkpoint — see below.

---

## The how-to guide

Open **[`guide/index.html`](guide/index.html)** in a browser — double-click it,
no server needed. The index asks *what are you trying to do?* and each activity
has its own page: the steps, what success looks like, every command and prompt
as a one-click copy, and a collapsed "Stuck? Open this" section with the
shortcut when you need it.

There is a **light / dark toggle** in the header of every page. It follows your
system setting to begin with and remembers your choice after that.

Regenerate it after editing `guide/activities.js`:

```bash
node guide/build-guide.js
```

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
