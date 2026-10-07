#!/usr/bin/env bash
#
# Bring the workshop app up inside the container, and then get out of the way.
#
# WHY THIS LIVES IN THIS REPO AND NOT IN THE APP
# The app has a startup script of its own (scripts/docker-app-entrypoint.sh), and
# reusing it would be the obvious move. It is the wrong move here: ./checkpoint.sh
# rewinds app/ to an arbitrary cp-* tag, so a script inside app/ is rewound with it.
# The thing that starts the container must not change when an attendee jumps
# checkpoints — same reasoning as checkpoints/README.md gives for keeping the two
# repositories apart in the first place.
#
# WHY IT ENDS IN `sleep infinity` RATHER THAN RUNNING VITE IN THE FOREGROUND
# Attendees break this app on purpose — that is most of Part 1. If the dev server
# were PID 1, the first failing edit would take the container down and with it the
# Claude Code session, the shell, and any uncommitted work. So both servers run in
# the background and PID 1 is something that cannot fail. A broken app is then a
# broken app, not a lost afternoon.
set -uo pipefail

REPO="${WORKSHOP_REPO_DIR:-/workspace/repo}"
LOGS="${WORKSHOP_LOG_DIR:-/workspace/logs}"
PORT="${WORKSHOP_PORT:-5173}"
API_PORT="${PORT_API:-3001}"

mkdir -p "$LOGS"

step() { printf '\n=== %s\n' "$1"; }

# ON PATH, AS start-app.sh. The compose file mounts the folder this lives in at
# /opt/workshop rather than the file itself (see why there), so nothing puts it on
# PATH - and every recovery command in the guide, the banner below and
# ./checkpoint.sh's database reset call it by bare name. A symlink, not a copy: a copy
# would go stale on the next pull, which is the problem the folder mount exists to
# fix. `agent` has passwordless sudo in the image.
SELF=/opt/workshop/start-app.sh
LINK=/usr/local/bin/start-app.sh
if [ -e "$SELF" ] && [ "$(readlink "$LINK" 2>/dev/null)" != "$SELF" ]; then
  sudo ln -sfn "$SELF" "$LINK" 2>/dev/null ||
    echo "could not link $LINK - run it as $SELF instead" >&2
fi

# ------------------------------------------------- Claude Code, kept current
#
# The image installs whatever Claude Code was current when it was BUILT, and an
# attendee who ran the environment check a week early keeps that image. A room then
# runs a spread of versions, and the screen at the front does not match the screen in
# front of you.
#
# Updated HERE, on every container start, because nothing done inside the container
# survives it: ./verify-setup.sh stops the stack when it finishes, and the morning's
# ./workshop/up.sh starts a fresh container from the image. Updating once at check
# time would be undone before anybody used it.
#
# Not `claude update`: the image installs the CLI globally as root, and this runs as
# `agent`, so the updater's own npm install fails with EACCES. npm through sudo is the
# same update with the permission it needs (`agent` has passwordless sudo).
#
# WORKSHOP_CLAUDE_VERSION pins it - set it in .env if a release lands on the morning
# of a workshop and you would rather not find out live. Never fatal: offline, it keeps
# the version it has and says so.
CLAUDE_PKG="@anthropic-ai/claude-code"
update_claude() {
  local want have
  have=$(claude --version 2>/dev/null | awk '{print $1}')
  want=$(npm view "${CLAUDE_PKG}@${WORKSHOP_CLAUDE_VERSION:-latest}" version 2>/dev/null | tail -1)
  if [ -z "$want" ]; then
    echo "claude ${have:-?} - could not reach the npm registry to check for a newer one"
    return 1
  fi
  if [ "$have" = "$want" ]; then
    echo "claude ${have} - up to date"
    return 0
  fi
  if sudo npm install -g --no-fund --no-audit "${CLAUDE_PKG}@${want}" >"$LOGS/claude-update.log" 2>&1; then
    echo "claude updated ${have:-?} -> $(claude --version 2>/dev/null | awk '{print $1}')"
    return 0
  fi
  echo "claude ${have:-?} - update to ${want} FAILED, see $LOGS/claude-update.log"
  return 1
}

# Just the update, for the environment check's Claude row and for doing it by hand.
if [ "${1:-}" = "--update-claude" ]; then
  update_claude
  exit $?
fi

# ------------------------------------------------- Claude's first-run onboarding
#
# WHY THIS IS HERE AND NOT AN ENVIRONMENT VARIABLE
# Claude Code shows its first-run onboarding - a theme picker, then "Claude Code can
# be used with your Claude subscription or billed based on API usage through your
# Console account" - whenever $HOME records no completed onboarding. An attendee with
# a perfectly good token lands on what looks like a login prompt, on the one command
# the whole morning builds up to.
#
# The CLI has no switch for this. CLAUDE_CODE_SKIP_ONBOARDING reads like one and does
# nothing: the binary carries seventeen real CLAUDE_CODE_SKIP_* names and that is not
# among them. The only gate is hasCompletedOnboarding in ~/.claude.json, so the file
# is what has to exist.
#
# It has to be written HERE, at every start, because the image pre-creates ~/.claude
# but keeps it in the image rather than in a volume - so every recreated container is
# a first run, forever. It could be seeded in workshop/container/Dockerfile instead, now
# that the image lives in this repo rather than in app/; it stays here so a change to it
# takes effect on a restart, not an image rebuild.
#
# hasTrustDialogAccepted goes with it: the next thing Claude asks is whether this
# folder is trusted, and the answer cannot be anything but yes - the container exists
# to hold this one repo, and the container IS the isolation boundary.
#
# bypassPermissionsModeAccepted is the third of the same kind. The Claude terminal
# opens with --dangerously-skip-permissions, and the CLI shows a one-time disclaimer
# before honouring it - without this the flag is silently DOWNGRADED ("permission mode
# downgraded to default - bypass requires accepting the disclaimer interactively
# first") and a room of attendees is back to approving every edit without being told
# why. The disclaimer is answered here because the guide answers it properly: the
# Claude terminal on start-your-day.html carries the full explanation, and the deck
# spends a slide on it.
#
# Only ever written when absent. Claude keeps real state in this file (history,
# per-project settings), and clobbering it on every restart would throw that away.
step "Claude Code"
update_claude || true
CLAUDE_CONFIG="${HOME:-/home/agent}/.claude.json"
if [ -f "$CLAUDE_CONFIG" ]; then
  echo "already onboarded"
elif cat > "$CLAUDE_CONFIG" <<JSON
{
  "hasCompletedOnboarding": true,
  "bypassPermissionsModeAccepted": true,
  "projects": {
    "$REPO": { "hasTrustDialogAccepted": true }
  }
}
JSON
then
  echo "onboarding pre-answered — claude opens straight at a prompt"
else
  echo "could not write $CLAUDE_CONFIG — claude will ask to log in" >&2
fi

cd "$REPO" || { echo "workshop: $REPO is not mounted — check the app/ bind mount" >&2; exec sleep infinity; }

# Re-runnable on purpose. Attendees break the app and need it back, and the honest
# way to offer that is to make this same script the restart — one thing to know
# rather than two. Existing servers are killed first: --strictPort means a second
# Vite on a taken port would fail rather than quietly move, which is right at boot
# and unhelpful when somebody is trying to recover.
#
# ONLY THE DEV SERVERS, NOT EVERY VITE AND EVERY API. This used to pkill anything
# matching 'vite' or 'packages/server', which also caught the app's E2E run
# (scripts/run-e2e.sh starts its own API and Vite on spare ports, 3101 and 5273, so it
# never touches these). So: the process trees this script started, recorded in
# $LOGS/*.pid, and then whatever still listens on the two dev ports - that covers a
# container started before the pid files existed, and a dev server an agent started
# by hand on one of them.
kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}
# --reset-db is --restart plus a database rebuilt from scratch: see "migrations" below.
RESTART=0
RESET_DB=0
for arg in "$@"; do
  case "$arg" in
    --restart) RESTART=1 ;;
    --reset-db) RESTART=1; RESET_DB=1 ;;
  esac
done
if [ "$RESTART" -eq 1 ]; then
  echo "stopping the running app…"
  # Clear the sentinel FIRST. The API runs under a restart supervisor (see below), so
  # killing the server without this just gets it started again two seconds later.
  rm -f "$LOGS/.api-supervisor" 2>/dev/null || true
  for f in "$LOGS/api.pid" "$LOGS/vite.pid"; do
    [ -f "$f" ] && kill_tree "$(cat "$f")"
    rm -f "$f"
  done
  # Anchored: an unanchored -f pattern also matches any shell whose command line merely
  # mentions it - an agent running `start-app.sh --restart; tail vite.log` would kill itself.
  pkill -f '^npm run dev:server' 2>/dev/null || true
  if command -v lsof >/dev/null 2>&1; then
    for pid in $(lsof -t -iTCP:"$API_PORT" -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null); do
      kill_tree "$pid"
    done
  fi
  sleep 2
fi

# ------------------------------------------------------- dependency volumes
#
# THE ONE THAT BIT. Docker creates a named volume OWNED BY ROOT when the image has
# nothing at the path it shadows — and the image has nothing at any of these, by
# design. This container runs as `agent` (the image makes it non-root because Claude
# Code refuses --dangerously-skip-permissions as root), so the first npm install died
# with:
#
#   EACCES: permission denied, mkdir '/workspace/repo/node_modules/@acemir'
#
# and with no dependencies, Vite and the API both failed to start. The fix lives HERE.
# Pre-creating these paths owned by `agent` in workshop/container/Dockerfile would also
# work, now that the image lives in this repo rather than in app/; doing it at start
# means an image that is already built needs no rebuild. `agent` has passwordless sudo
# in the image.
step "Dependency volumes"
VOLUME_DIRS="node_modules packages/client/node_modules packages/server/node_modules packages/shared/node_modules"
for d in $VOLUME_DIRS; do
  [ -d "$d" ] || sudo mkdir -p "$d"
  if [ ! -w "$d" ]; then
    sudo chown "$(id -un):$(id -gn)" "$d"
    echo "took ownership of $d"
  fi
done
echo "writable"

# --------------------------------------------------------------------- deps
#
# The volumes start EMPTY (see above), so npm install has to happen here on a first
# run. The shadowing is deliberate and documented in docker-compose.workshop.yml: the
# host is usually Windows, and win32 binaries (esbuild, lightningcss) cannot run in a
# Linux container.
#
# KEYED ON THE LOCKFILE, not on any one package being present. This used to check for
# vite's binary, and that is exactly the wrong question: an interrupted install, or an
# install made from an older lockfile, leaves vite there and something else missing.
# The script then said "already installed", and the API died on every start with
#
#   ERR_MODULE_NOT_FOUND: Cannot find package 'pino-http'
#
# which Vite turns into a bare 500 on every /v1 call. ./checkpoint.sh makes the same
# thing routine: any rung that adds a dependency changes the lockfile under a volume
# installed for the old one.
#
# So a stamp of the lockfile's hash is written into the volume AFTER a successful
# install, and anything else - no stamp, a different hash - installs again. On an
# existing tree npm install only fetches the difference, so a re-run costs seconds.
# `start-app.sh --restart` re-runs this step, which makes it the repair too.
step "Dependencies"
APP_OK=1
DEPS_STAMP="node_modules/.workshop-lock-hash"
LOCK_HASH=$(sha256sum package-lock.json 2>/dev/null | cut -d' ' -f1)
if [ -n "$LOCK_HASH" ] && [ "$(cat "$DEPS_STAMP" 2>/dev/null)" = "$LOCK_HASH" ]; then
  echo "already installed"
else
  if [ -x "node_modules/.bin/vite" ]; then
    echo "dependencies out of date — updating"
  else
    echo "first run — installing (this takes a few minutes, once)"
  fi
  # NOT `npm install | tail`: a pipe reports the exit status of tail, so a failed
  # install looked exactly like a successful one and the script sailed on to start
  # servers that had nothing to run.
  if npm install >"$LOGS/install.log" 2>&1; then
    # Only now. A stamp written before or regardless of the install would mark a
    # half-finished tree as complete - the failure this whole block exists to stop.
    # Hashed again rather than reusing LOCK_HASH: npm may rewrite the lockfile as it
    # installs, and a stamp of the old one would reinstall on every start.
    sha256sum package-lock.json | cut -d' ' -f1 > "$DEPS_STAMP"
    echo "installed"
  else
    APP_OK=0
    echo "INSTALL FAILED - last lines of $LOGS/install.log:" >&2
    tail -15 "$LOGS/install.log" >&2
  fi
fi

# ---------------------------------------------------------------- migrations
# Everything below depends on the install. Starting servers with no node_modules
# produces ERR_MODULE_NOT_FOUND in a log nobody is reading, so skip straight to the
# report and let it say what happened.
if [ "$APP_OK" -eq 1 ]; then
step "Database"
# --reset-db: DROP THE DATABASE AND MIGRATE IT FROM NOTHING. This is what
# ./checkpoint.sh runs after every jump. The database lives in its own container and
# a jump only moves app/, so without this the database stays on the PREVIOUS rung:
# jump back from cp-02 and the cp-01 API queries campaigns tables that cp-02's
# migration renamed; jump forward over a half-done rename and cp-02's migration runs
# on top of the attendee's own, and fails. Every rung's seed data is itself a
# migration, so `dbmate up` on an empty database is exactly that rung's data.
#
# Dropped from node, not `dbmate drop`: that refuses while anything is still
# connected, and WITH (FORCE) does not leave the reset at the mercy of a stray
# connection. There is no psql in this image; pg is already an app dependency.
DB_OK=1
if [ "$RESET_DB" -eq 1 ]; then
  if node -e '
    const { Client } = require("pg")
    const url = new URL(process.env.DATABASE_URL)
    const name = decodeURIComponent(url.pathname.slice(1))
    url.pathname = "/postgres"
    const c = new Client({ connectionString: url.toString() })
    c.connect()
      .then(() => c.query(`DROP DATABASE IF EXISTS "${name.replace(/"/g, "\"\"")}" WITH (FORCE)`))
      .then(() => { console.log(`dropped ${name} - rebuilding it from the migrations in this checkout`); return c.end() })
      .catch((e) => { console.error(`could not drop the database: ${e.message}`); process.exit(1) })
  '; then
    :
  else
    DB_OK=0
  fi
fi
if command -v dbmate >/dev/null 2>&1; then
  # dbmate's own status, read at once - the next command overwrites PIPESTATUS.
  dbmate -d ./packages/server/db/migrations -s ./packages/server/db/schema.sql up 2>&1 | tail -5
  MIGRATE_STATUS=${PIPESTATUS[0]}
  [ "$RESET_DB" -eq 1 ] && [ "$MIGRATE_STATUS" -ne 0 ] && DB_OK=0
else
  [ "$RESET_DB" -eq 1 ] && DB_OK=0
  echo "dbmate not found — skipping migrations" >&2
fi

# -------------------------------------------------------------------- server
# Is anything listening? NOT "does this route work". This script is deliberately not
# rewound by ./checkpoint.sh, so it outlives route names — asking for /v1/campaigns
# here meant that the moment cp-02 renamed it to /v1/proposals, the poll could never
# succeed and the banner below called a perfectly healthy API dead. A 404 is a pass:
# it proves the server answered. curl writes 000 when the connection is refused.
api_listening() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 \
        "http://127.0.0.1:${API_PORT}/" 2>/dev/null)" != "000" ]
}

step "API on :${API_PORT}"

# RESTART ON CRASH, not just on file change.
#
# `tsx watch` reloads when a file changes and exits when the process dies. A bad edit
# — the entire point of Part 1 — therefore leaves nothing on the port for the rest of
# the day, and Vite turns the resulting connection-refused into a 500 in the browser.
# The attendee sees a broken page and debugs the page. The evidence is in server.log,
# which nobody has been given a reason to open.
#
# The sentinel is how --restart stops this loop: pkill alone would just make the
# supervisor start a fresh server two seconds later.
: > "$LOGS/.api-supervisor"
(
  while [ -e "$LOGS/.api-supervisor" ]; do
    PORT="$API_PORT" npm run dev:server
    status=$?
    [ -e "$LOGS/.api-supervisor" ] || break
    echo ""
    echo "=== API exited (status ${status}) - restarting in 2s ==="
    echo "=== If this repeats, the error above is the real one. ==="
    echo ""
    sleep 2
  done
) >"$LOGS/server.log" 2>&1 &
echo $! > "$LOGS/api.pid"

# Poll rather than sleep-and-hope. The API not being up yet is not fatal — Vite
# proxies to it lazily — so this waits a bounded time and carries on either way.
for _ in $(seq 1 30); do
  api_listening && break
  sleep 1
done

# ---------------------------------------------------------------------- vite
#
# --host 0.0.0.0 because Vite binds loopback by default, and a loopback bind inside
# a container cannot be reached through a published port however the ports are
# mapped. This is the single line that makes http://localhost:PORT work at all.
#
# 0.0.0.0 IS THE IPv4 WILDCARD, AND ONLY THAT. /etc/hosts in this container maps
# `localhost` to ::1 with no IPv4 entry, so anything in here resolving `localhost`
# gets IPv6 and a refused connection. curl hides it by falling back to IPv4;
# headless Chromium does not, so the agent's screenshots came back showing the
# site offline while the same page loaded fine in the attendee's browser on the
# host. Every in-container probe and agent-facing URL therefore says 127.0.0.1.
# The banner below still says localhost: that URL is for the host browser, where
# it is both correct and the thing people expect to see.
#
# --strictPort because the alternative is worse than failing: without it Vite
# quietly moves to the next free port when PORT is taken INSIDE the container, and
# the published mapping then points at nothing. A page that will not load is much
# harder to diagnose than a server that says the port is taken.
step "Site on :${PORT}"
(
  cd packages/client || exit 1
  npx vite --host 0.0.0.0 --port "$PORT" --strictPort
) >"$LOGS/vite.log" 2>&1 &
echo $! > "$LOGS/vite.pid"

# WAIT AS LONG AS VITE IS ALIVE, NOT A FIXED 30 SECONDS. Vite's first start scans and
# pre-bundles the app's dependencies, and on Windows every one of those file reads
# crosses Docker Desktop's file sharing - far slower than on macOS. The old 30-try
# loop gave up while Vite was still booting, printed WORKSHOP APP DID NOT START
# (whose first line of advice is "did the dependencies install?"), up.sh failed check
# 5 on that banner - and Vite came up a minute later, in a log nobody was reading.
#
# So: the site is up when it answers; it has FAILED only when Vite has exited. Until
# then keep waiting, up to WORKSHOP_SITE_WAIT seconds (default 600, the same budget
# as up.sh), with a line every 30s so the wait is visibly alive. --max-time stops a
# half-booted Vite that accepts the connection from stalling a single probe for
# minutes, which is what stretched the old "30 seconds" far past 30.
SITE_UP=0
VITE_PID=$(cat "$LOGS/vite.pid" 2>/dev/null || true)
SITE_WAIT="${WORKSHOP_SITE_WAIT:-600}"
SITE_START=$(date +%s)
SITE_BEAT=0
while :; do
  if curl -sf --max-time 5 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then SITE_UP=1; break; fi
  # Vite gone means it failed to boot - say so now rather than waiting out the budget.
  if [ -n "$VITE_PID" ] && ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo "Vite exited before serving - see ${LOGS}/vite.log" >&2
    break
  fi
  SITE_ELAPSED=$(( $(date +%s) - SITE_START ))
  [ "$SITE_ELAPSED" -ge "$SITE_WAIT" ] && break
  if [ $(( SITE_ELAPSED - SITE_BEAT )) -ge 30 ]; then
    echo "still starting the site - ${SITE_ELAPSED}s (the first start is the slow one)"
    SITE_BEAT=$SITE_ELAPSED
  fi
  sleep 1
done
fi   # APP_OK

# --------------------------------------------------------------------- report
#
# Say what actually happened. The first version of this printed "Workshop app is up"
# unconditionally, so a container whose install had failed and whose servers were
# both dead still looked healthy — the only evidence was in a log file nobody had
# been given a reason to open. A start script that lies about starting is worse than
# one that fails loudly.
API_STATE="NOT RUNNING - see ${LOGS}/server.log"
api_listening && API_STATE="listening on :${API_PORT}"

if [ "${SITE_UP:-0}" -eq 1 ]; then
  cat <<BANNER

============================================================
   Workshop app is up.

   Site   http://localhost:${PORT}
   API    ${API_STATE}
   Logs   ${LOGS}/vite.log , ${LOGS}/server.log
   Restart it       start-app.sh --restart
   Fresh database   start-app.sh --reset-db
============================================================

BANNER
else
  cat >&2 <<BANNER

============================================================
   WORKSHOP APP DID NOT START

   Nothing is listening on http://localhost:${PORT}
   Read, in this order:
       ${LOGS}/install.log   did the dependencies install?
       ${LOGS}/vite.log      did the site fail to boot?
       ${LOGS}/server.log    did the API fail to boot?

   Then, on the HOST:
       docker compose -f docker-compose.workshop.yml exec claude-container start-app.sh --restart
============================================================

BANNER
fi

if [ "${DB_OK:-1}" -eq 0 ]; then
  cat >&2 <<BANNER
============================================================
   DATABASE RESET FAILED - the app is on the old data, or none.
   The lines under "=== Database" above say why.
============================================================

BANNER
fi

# PID 1 has to stay alive or the container exits and takes everyone's shell with
# it. Run by hand as a restart, there is nothing to hold open — just leave, saying
# whether it worked: ./checkpoint.sh reads this to report a reset that did not land.
if [ "$$" -ne 1 ]; then
  [ "${SITE_UP:-0}" -eq 1 ] && [ "${DB_OK:-1}" -eq 1 ] && exit 0
  exit 1
fi

# The harness runs' plans, results, logs, screenshots and diffs, copied to runs/ on the
# host as they are written (see mirror-runs.sh). Started here, at boot and only at boot,
# so a --restart never starts a second copy.
bash "$(dirname "$(readlink -f "$0")")/mirror-runs.sh" >"$LOGS/mirror-runs.log" 2>&1 &

exec sleep infinity
