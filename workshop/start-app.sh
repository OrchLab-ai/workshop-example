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
# a first run, forever. Seeding it in app/autonomous/Dockerfile would be rewound by
# ./checkpoint.sh, same reason the rest of this file lives in this repo.
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
if [ "${1:-}" = "--restart" ]; then
  echo "stopping the running app…"
  # Clear the sentinel FIRST. The API runs under a restart supervisor (see below), so
  # killing the server without this just gets it started again two seconds later.
  rm -f "$LOGS/.api-supervisor" 2>/dev/null || true
  pkill -f 'vite' 2>/dev/null || true
  pkill -f 'dev:server' 2>/dev/null || true
  pkill -f 'packages/server' 2>/dev/null || true
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
# and with no dependencies, Vite and the API both failed to start. The fix lives HERE
# rather than in app/autonomous/Dockerfile deliberately: ./checkpoint.sh rewinds app/
# to a cp-* tag, and a fix sitting in a rewound Dockerfile would quietly vanish the
# first time somebody jumped checkpoints. `agent` has passwordless sudo in the image.
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
# Keyed on the client's binary rather than on node_modules existing at all: an
# interrupted install leaves the directory there but unusable.
step "Dependencies"
APP_OK=1
if [ -x "node_modules/.bin/vite" ] || [ -x "packages/client/node_modules/.bin/vite" ]; then
  echo "already installed"
else
  echo "first run — installing (this takes a few minutes, once)"
  # NOT `npm install | tail`: a pipe reports the exit status of tail, so a failed
  # install looked exactly like a successful one and the script sailed on to start
  # servers that had nothing to run.
  if npm install >"$LOGS/install.log" 2>&1; then
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
if command -v dbmate >/dev/null 2>&1; then
  dbmate -d ./packages/server/db/migrations -s ./packages/server/db/schema.sql up 2>&1 | tail -5
else
  echo "dbmate not found — skipping migrations" >&2
fi

# -------------------------------------------------------------------- server
# Is anything listening? NOT "does this route work". This script is deliberately not
# rewound by ./checkpoint.sh, so it outlives route names — asking for /v1/campaigns
# here meant that the moment cp-01 renamed it to /v1/proposals, the poll could never
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

SITE_UP=0
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then SITE_UP=1; break; fi
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

# PID 1 has to stay alive or the container exits and takes everyone's shell with
# it. Run by hand as a restart, there is nothing to hold open — just leave.
[ "$$" -eq 1 ] || exit 0
exec sleep infinity
