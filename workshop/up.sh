#!/usr/bin/env bash
#
# Start the workshop stack and stay until the app is actually serving.
#
# WHY THIS EXISTS
# `docker compose up -d` answers a question nobody asked. It reports that the
# CONTAINER started — which is true within seconds — and then returns, while the app
# inside is still several minutes from answering on :5173. An attendee reads
#
#     ✔ Container orchlab-workshop-claude-container-1  Started
#
# opens the URL, gets nothing, and reasonably concludes it is broken. The first run
# installs the app's dependencies inside the container, and that is the wait.
#
# So this wrapper does the `up -d` and then narrates the rest, using the phase
# markers start-app.sh prints, and exits only when the site really answers.
#
# NO \r REDRAWING HERE, deliberately. The environment check earns its animated line
# because it is a fixed-length checklist; this is an open-ended wait whose output is
# routinely piped to a file or read back later, and in-place redrawing in that
# setting produces exactly the truncation and residue artefacts that cost time in
# verify-setup.sh. One line per event, and nothing to go wrong.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

COMPOSE_FILE="docker-compose.workshop.yml"
PORT="${WORKSHOP_PORT:-5173}"
SERVICE="claude-container"
# Generous: a first run downloads nothing (check 3 warmed the images) but still
# installs a monorepo's dependencies. Ten minutes is comfortably past the worst
# observed, and hitting it means something is wrong rather than slow.
TIMEOUT="${WORKSHOP_UP_TIMEOUT:-600}"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; RED=''; RESET=''
fi

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

hhmmss() { printf '%dm%02ds' "$(( $1 / 60 ))" "$(( $1 % 60 ))"; }

printf '\n%sStarting the workshop stack%s\n\n' "$BOLD" "$RESET"
compose up -d || exit 1

printf '\n%sThe container is up. The app inside it is not, yet.%s\n' "$BOLD" "$RESET"
printf '%sFirst run installs the app'"'"'s dependencies — several minutes, once.%s\n\n' "$DIM" "$RESET"

START=$(date +%s)
LAST_PHASE=""
LAST_BEAT=0

while :; do
  ELAPSED=$(( $(date +%s) - START ))

  if curl -fsS -o /dev/null "http://localhost:${PORT}/" 2>/dev/null; then
    printf '\n%s%s  READY  %s  the site is answering on http://localhost:%s%s\n' \
      "$GREEN" "$BOLD" "$RESET" "$PORT" ""
    printf '   Took %s. Leave the stack running — you only do this once a day.\n' "$(hhmmss "$ELAPSED")"

    # READY ABOVE IS ONE VANTAGE, AND IT IS NOT THE AGENT'S.
    #
    # The loop that just exited tests `curl http://localhost:PORT/` from the HOST.
    # That is precisely the evidence that stayed green while the agent, inside the
    # container, could not reach the app at all — curl falls back to IPv4 when IPv6
    # refuses, and headless Chromium does not. Declaring the stack ready on that
    # alone is the mistake this whole check exists to stop repeating.
    #
    # So prove the other vantage before saying you can start working. Skippable,
    # because a room of thirty should never be held up by a check, and the escape
    # hatch is better than somebody inventing their own.
    if [ -z "${WORKSHOP_SKIP_VIEW_CHECK:-}" ] && [ -x ./workshop/verify-views.sh ]; then
      if ! ./workshop/verify-views.sh; then
        printf '\n%s%s  NOT READY  %s  the app is up, but the agent cannot see it.\n' \
          "$RED" "$BOLD" "$RESET"
        printf '   The output above says which vantage failed and what to do.\n'
        printf '   To carry on regardless:  WORKSHOP_SKIP_VIEW_CHECK=1 ./workshop/up.sh\n\n'
        exit 1
      fi
    fi

    printf '   Next:  %sdocker compose -f %s exec %s bash%s\n\n' "$BOLD" "$COMPOSE_FILE" "$SERVICE" "$RESET"
    exit 0
  fi

  LOG=$(compose logs --no-log-prefix "$SERVICE" 2>/dev/null)

  # start-app.sh gives up and says so rather than leaving the container looking
  # healthy. Surface that immediately instead of waiting out the timeout.
  if printf '%s' "$LOG" | grep -q 'WORKSHOP APP DID NOT START'; then
    printf '\n%s%s  FAILED  %s  the app did not start.\n\n' "$RED" "$BOLD" "$RESET"
    printf '%s' "$LOG" | sed -n '/WORKSHOP APP DID NOT START/,/^====/p' | sed 's/^/   /'
    printf '\n   Full output:  docker compose -f %s logs %s\n\n' "$COMPOSE_FILE" "$SERVICE"
    exit 1
  fi

  # The phase markers start-app.sh prints ("=== Dependencies"). Report a change the
  # moment it happens, because that is the only real evidence of forward motion.
  PHASE=$(printf '%s' "$LOG" | sed -n 's/^=== //p' | tail -1)
  if [ -n "$PHASE" ] && [ "$PHASE" != "$LAST_PHASE" ]; then
    printf '   %s...%s %s\n' "$DIM" "$RESET" "$PHASE"
    LAST_PHASE="$PHASE"
    LAST_BEAT=$ELAPSED
  elif [ $(( ELAPSED - LAST_BEAT )) -ge 30 ]; then
    # A heartbeat, so a long install never looks like a hang. Installing the
    # dependencies is one phase and takes the bulk of the wait.
    printf '   %sstill working — %s%s\n' "$DIM" "$(hhmmss "$ELAPSED")" "$RESET"
    LAST_BEAT=$ELAPSED
  fi

  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    printf '\n%s%s  GAVE UP  %s  nothing answered on :%s after %s.\n\n' \
      "$RED" "$BOLD" "$RESET" "$PORT" "$(hhmmss "$ELAPSED")"
    printf '   This is longer than it should ever take. Look at:\n'
    printf '       docker compose -f %s logs %s\n\n' "$COMPOSE_FILE" "$SERVICE"
    exit 1
  fi

  sleep 2
done
