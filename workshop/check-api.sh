#!/usr/bin/env bash
#
# Prove the workshop API answers, and say why when it does not.
#
# WHY THIS EXISTS
# The site and the API are two processes. Vite serves the page perfectly well while
# the API is dead, and turns every /v1 call into a bare "500 Internal Server Error" -
# so a stack could say READY and then fail on the first page that loads data. That is
# exactly what happened: the API was crash-looping on a missing package (pino-http)
# and the first sign of it was an attendee clicking around the app.
#
# THE PROBE is one login as the seeded demo creator, from the host and through the
# site's /v1 proxy - the path every page in the app takes - so a pass means the proxy,
# the API, the database, the migrations and the seed data all work. /v1/auth/login is
# also route-stable: the rename challenge moves /v1/campaigns at cp-01, not this.
#
# Used by ./verify-setup.sh as check 6, and by workshop/up.sh before it says READY.
# Exit codes:
#   0  logged in - everything works
#   2  the API answered 401 - it is up and queried the database, but the demo account
#      is not there (missing migrations or seed data)
#   1  anything else
# Either way the reason is on stdout, with CAUSE and FIX lines for the caller to quote.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

# Git Bash would rewrite /workspace/logs/server.log into a Windows path before
# docker.exe sees it. Same guard as up.sh; meaningless on macOS and Linux.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

COMPOSE_FILE="docker-compose.workshop.yml"
PORT="${WORKSHOP_PORT:-5173}"
URL="http://localhost:${PORT}/v1/auth/login"
BODY="$(mktemp 2>/dev/null || echo "/tmp/workshop-api.$$")"
trap 'rm -f "$BODY"' EXIT

# The API can come up a few seconds after the site, so allow it half a minute.
CODE=000
for _ in $(seq 1 15); do
  CODE=$(curl -sS -o "$BODY" -w '%{http_code}' --max-time 10 \
    -X POST -H 'Content-Type: application/json' \
    -d '{"email":"creator@example.com","password":"creator-demo-pass"}' \
    "$URL" 2>/dev/null) || CODE=000
  case "$CODE" in 000|500|502|503|504) sleep 2 ;; *) break ;; esac
done

if [ "$CODE" = 200 ] && grep -q '"token"' "$BODY"; then
  echo "API_OK logged in as the demo creator via /v1"
  exit 0
fi

echo "API_FAIL http ${CODE} from ${URL}"
[ -s "$BODY" ] && { printf 'response: '; head -c 300 "$BODY"; echo; }

if [ "$CODE" = 401 ]; then
  echo "CAUSE the API answers, but the demo account was not found"
  echo "FIX   the database is missing its migrations or seed data; rebuild it from scratch:"
  echo "        docker compose -f ${COMPOSE_FILE} exec claude-container start-app.sh --reset-db"
  exit 2
fi

# The real error is in the API's own log, inside the container. Read it here rather
# than telling somebody to go and find it: nobody opened server.log until they were
# told exactly which line to look at.
LOG=$(docker compose -f "$COMPOSE_FILE" exec -T claude-container \
        tail -n 40 /workspace/logs/server.log 2>/dev/null || true)

if grep -q 'ERR_MODULE_NOT_FOUND' <<<"$LOG"; then
  MISSING=$(sed -n "s/.*Cannot find package '\([^']*\)'.*/\1/p" <<<"$LOG" | tail -1)
  echo "CAUSE the API cannot start: package '${MISSING:-?}' is not installed"
  echo "FIX   the dependencies are incomplete; this reinstalls them and restarts the app:"
  echo "        docker compose -f ${COMPOSE_FILE} exec claude-container start-app.sh --restart"
elif [ "$CODE" = 000 ]; then
  echo "CAUSE nothing answered on :${PORT} - the site itself is down"
  echo "FIX   start the stack:  ./workshop/up.sh"
elif grep -qE 'ECONNREFUSED.*5432|relation .* does not exist' <<<"$LOG"; then
  echo "CAUSE the API is running but its database query failed"
  echo "FIX   look at the Database step in:"
  echo "        docker compose -f ${COMPOSE_FILE} logs claude-container"
else
  echo "CAUSE the site is up, but its API did not answer (HTTP ${CODE})"
  echo "FIX   restart the app:"
  echo "        docker compose -f ${COMPOSE_FILE} exec claude-container start-app.sh --restart"
fi
if [ -n "$LOG" ]; then
  echo "--- last lines of /workspace/logs/server.log ---"
  printf '%s\n' "$LOG" | tail -n 15
fi
exit 1
