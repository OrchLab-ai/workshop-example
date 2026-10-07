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

# Git Bash rewrites any argument that looks like a POSIX path into a Windows path
# before docker.exe sees it - right for host paths, fatal for CONTAINER paths:
# `test -f /usr/local/bin/app-views.mjs` reached the container as
# C:/Program Files/Git/usr/local/bin/app-views.mjs, and the view check reported the
# checker "not mounted" in a container created a minute earlier. Every host path in
# this script is relative, so nothing here needs the conversion. Same guard as
# verify-setup.sh; meaningless on macOS and Linux.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

COMPOSE_FILE="docker-compose.workshop.yml"
PORT="${WORKSHOP_PORT:-5173}"
SERVICE="claude-container"
# Generous: a first run downloads nothing (check 3 warmed the images) but still
# installs a monorepo's dependencies - once, and normally during ./verify-setup.sh,
# whose check 5 runs this script. Ten minutes is comfortably past the worst
# observed, and hitting it means something is wrong rather than slow.
TIMEOUT="${WORKSHOP_UP_TIMEOUT:-600}"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; RED=''; RESET=''
fi

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

hhmmss() { printf '%dm%02ds' "$(( $1 / 60 ))" "$(( $1 % 60 ))"; }

# Docker in Windows-container mode cannot run this stack - every image is Linux - and
# compose says so only as "no matching manifest for windows(...)/amd64", which reads
# like a broken image. Seen on the Windows-containers pathway, whose environment check
# passes in that mode and so never prompted the switch. Checked before `up`, and
# only when the answer is definite: an empty OSType (daemon not running) falls
# through to compose, whose own error for that case is already clear.
#
# Interactive runs are offered the switch itself, through Docker Desktop's own CLI -
# never without a yes, because it stops any Windows container that is running.
# Non-interactive runs (verify-setup.sh's check 5, anything piped) only explain.
# Same facts as SWITCH_TO_LINUX in guide/src/activities.js; keep the two in step.
DOCKER_OS=$(docker info --format '{{.OSType}}' 2>/dev/null || true)
if [ "$DOCKER_OS" = "windows" ]; then
  printf '\n%sDocker is in Windows-container mode. The workshop needs Linux containers.%s\n\n' "$RED$BOLD" "$RESET"
  printf 'Every workshop image is a Linux image, and Docker Desktop runs one mode at a time.\n\n'
  printf '%sWhat switching does%s  Docker Desktop has two separate engines, Windows and Linux.\n' "$BOLD" "$RESET"
  printf '  Switching stops one and starts the other. Nothing is converted or removed.\n'
  printf '%sWhy it is safe%s  Your Windows images, containers and volumes are kept - hidden\n' "$BOLD" "$RESET"
  printf '  while you are in Linux mode, not deleted. Only RUNNING Windows containers stop.\n'
  printf '%sSwitching back%s  Right-click the whale -> Switch to Windows containers... and\n' "$BOLD" "$RESET"
  printf '  everything is listed again as you left it.\n\n'

  DOCKER_CLI="${ProgramFiles:-C:/Program Files}/Docker/Docker/DockerCli.exe"
  if [ -t 0 ] && [ -t 1 ] && [ -x "$DOCKER_CLI" ]; then
    printf '%sSwitch Docker to Linux containers now? [y/N] %s' "$BOLD" "$RESET"
    read -r ANSWER || ANSWER=""
    case "$ANSWER" in
      [yY]|[yY][eE][sS])
        printf '\nSwitching - Docker restarts, which can take a minute (longer the first time).\n'
        "$DOCKER_CLI" -SwitchLinuxEngine >/dev/null 2>&1
        SWITCH_START=$(date +%s)
        while :; do
          DOCKER_OS=$(docker info --format '{{.OSType}}' 2>/dev/null || true)
          [ "$DOCKER_OS" = "linux" ] && break
          if [ $(( $(date +%s) - SWITCH_START )) -ge 300 ]; then
            printf '\n%sDocker has not come back in Linux mode after 5 minutes.%s\n' "$RED$BOLD" "$RESET"
            printf 'Check the Docker Desktop window - the first switch may be asking to install\n'
            printf 'WSL 2. Once  docker info --format '"'"'{{.OSType}}'"'"'  prints linux, run this again.\n'
            exit 1
          fi
          sleep 3
        done
        printf '%s%s  Docker is in Linux-container mode.%s\n' "$GREEN" "$BOLD" "$RESET"
        ;;
      *)
        printf '\nNot switched. When you are ready:\n'
        ;;
    esac
  fi

  if [ "$DOCKER_OS" != "linux" ]; then
    printf '  Right-click the Docker whale in the system tray -> %sSwitch to Linux containers...%s\n' "$BOLD" "$RESET"
    printf '  wait for Docker to restart, then run  %s./workshop/up.sh%s  again.\n\n' "$BOLD" "$RESET"
    printf '%sCheck with  docker info --format '"'"'{{.OSType}}'"'"'  - it should print linux.%s\n' "$DIM" "$RESET"
    exit 1
  fi
fi

# STILL ON main? A setup that skipped the "land on cp-01" step - windows\verify.ps1
# did, until it was fixed - leaves app/ on main's tip, which carries every published
# rung: the morning's first activity is then already done. Attendees otherwise always
# work on a work/cp-* branch made by checkpoint.sh, so main means "never placed", not
# "placed and progressed". Never moved silently - up.sh is run again whenever the
# stack is restarted, and a reset then would throw away the day - only offered, and only on main. The move
# goes through checkpoint.sh, which parks any uncommitted work to wip/ first.
APP_BRANCH=$(git -C app branch --show-current 2>/dev/null || true)
if [ "$APP_BRANCH" = "main" ] && git -C app rev-parse -q --verify refs/tags/cp-01 >/dev/null 2>&1; then
  printf '\n%sThe app is on main, not on a checkpoint.%s main has every published\n' "$RED$BOLD" "$RESET"
  printf 'checkpoint already applied, so the first activity would start finished.\n'
  printf 'The workshop starts at cp-01. Any uncommitted work is parked to a wip/ branch first.\n\n'
  if [ -t 0 ] && [ -t 1 ]; then
    printf '%sMove the app to cp-01 now? [Y/n] %s' "$BOLD" "$RESET"
    read -r ANSWER || ANSWER=""
    case "$ANSWER" in
      [nN]|[nN][oO]) printf '\nLeft on main. To move it later:  %s./checkpoint.sh 1%s\n' "$BOLD" "$RESET" ;;
      *) ./checkpoint.sh 1 || exit 1 ;;
    esac
  else
    printf 'To move it:  %s./checkpoint.sh 1%s\n' "$BOLD" "$RESET"
  fi
fi

printf '\n%sStarting the workshop stack%s\n\n' "$BOLD" "$RESET"
# Retried, but only for one failure: a dependency that was not healthy YET. A slow
# first start (cold Docker VM, Postgres initialising) made `compose up` give up with
# "dependency failed to start: container ...-db-1 is unhealthy" while the database
# came up moments later - and the attendee saw a failed check for a stack that was
# fine. `up -d` is idempotent, so a retry just starts what is not running. Any other
# failure (a taken port, say) is reported at once, unchanged, for check 5 to read.
UP_OUT=$(mktemp 2>/dev/null || echo "/tmp/workshop-up.$$")
UP_TRY=1
until compose up -d 2>&1 | tee "$UP_OUT"; do
  if [ "$UP_TRY" -ge 3 ] || ! grep -qiE 'dependency failed|is unhealthy' "$UP_OUT"; then
    rm -f "$UP_OUT"
    exit 1
  fi
  printf '\n%sA dependency was not healthy yet - usually a slow first start. Retrying (%s of 3)...%s\n\n' \
    "$DIM" "$(( UP_TRY + 1 ))" "$RESET"
  UP_TRY=$(( UP_TRY + 1 ))
  sleep 10
done
rm -f "$UP_OUT"

printf '\n%sThe container is up. The app inside it is not, yet.%s\n' "$BOLD" "$RESET"
printf '%sFirst run installs the app'"'"'s dependencies — several minutes, once.%s\n\n' "$DIM" "$RESET"

START=$(date +%s)
LAST_PHASE=""
LAST_BEAT=0

while :; do
  ELAPSED=$(( $(date +%s) - START ))

  # --max-time: without it one probe could wait FOREVER. Seen on Windows: the site was
  # up inside the container within a second, but a connection made through Docker
  # Desktop's port forwarding before the app listened was accepted and never answered.
  # The loop never came round again, so neither the 30s heartbeat nor the timeout below
  # ever fired, and up.sh sat on "Site on :5173" indefinitely.
  if curl -fsS --max-time 5 -o /dev/null "http://localhost:${PORT}/" 2>/dev/null; then
    printf '\n%s%s  READY  %s  the site is answering on http://localhost:%s%s\n' \
      "$GREEN" "$BOLD" "$RESET" "$PORT" ""
    printf '   Took %s. Leave the stack running — you only do this once, at the start of the workshop.\n' "$(hhmmss "$ELAPSED")"

    # THE SITE IS NOT THE APP. Vite serves the page while the API behind it is dead,
    # and every /v1 call then comes back a bare 500 - so the loop above said READY
    # over an API that was crash-looping on a missing package, and the first sign was
    # an attendee clicking around the app. check-api.sh asks the API itself, through
    # the same proxy the browser uses, and names the cause when it cannot answer.
    #
    # A 401 (exit 2) only warns: the API is up and querying its database, and the demo
    # account is gone - which can be an attendee's own work by mid-afternoon, and is
    # no reason to hold the stack back.
    if [ -z "${WORKSHOP_SKIP_API_CHECK:-}" ] && [ -x ./workshop/check-api.sh ]; then
      API_OUT=$(./workshop/check-api.sh)
      case $? in
        0) printf '   %sAPI answering, database reachable.%s\n' "$DIM" "$RESET" ;;
        2) printf '   %sAPI answering, but the demo account was not found.%s\n' "$DIM" "$RESET"
           printf '%s\n' "$API_OUT" | sed -n 's/^FIX   /   /p; s/^        /       /p' ;;
        *)
          printf '\n%s%s  NOT READY  %s  the site is up, but the API behind it is not.\n\n' \
            "$RED" "$BOLD" "$RESET"
          printf '%s\n' "$API_OUT" | sed 's/^/   /'
          printf '\n   To carry on regardless:  WORKSHOP_SKIP_API_CHECK=1 ./workshop/up.sh\n\n'
          exit 1
          ;;
      esac
    fi

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
