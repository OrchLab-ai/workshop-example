#!/usr/bin/env bash
#
# OrchLab Workshop — Environment Check
#
# Run this first. It is the only thing you need to do before the workshop.
#
# Design note: every intermediate command is silenced and logged to
# .verify-logs/. The problem this script exists to solve is not that checks
# fail — it is that a wall of streamed container output makes SUCCESS
# indistinguishable from FAILURE. So the only thing on screen is a fixed-length
# checklist and one unambiguous verdict.
#
set -uo pipefail

TOTAL=5
COMPOSE_FILE="docker-compose.verify.yml"
LOG_DIR=".verify-logs"
REPORT="verify-report.txt"
SCREENSHOT="screenshots/verify.png"

QUIET=0
KEEP=0

usage() {
  cat <<'USAGE'
Usage: ./verify.sh [options]

  --quiet   Suppress the banner; print only the final verdict line.
            Intended for facilitators sweeping a room.
  --keep    Leave the check containers running afterwards.
  --help    Show this message.

Exit code is 0 only when all checks pass.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --quiet) QUIET=1 ;;
    --keep)  KEEP=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------- presentation

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "$QUIET" -eq 0 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; RED=''; RESET=''
fi

RULE="============================================================"

# Git Bash / MSYS rewrites any argument that looks like a POSIX path into a Windows
# path before the program sees it. That is right for host paths and catastrophic for
# CONTAINER paths: `node /work/screenshot.mjs` reached docker as
#   node C:/Program Files/Git/work/screenshot.mjs
# and check 5 failed with a MODULE_NOT_FOUND naming a path nobody wrote. Harmless
# on macOS and Linux, where these variables mean nothing.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

# say: to screen (unless --quiet) and always to the report file, with colour
# stripped from the file so it can be pasted into chat.
say() {
  [ "$QUIET" -eq 0 ] && printf '%s\n' "$1"
  printf '%s\n' "$1" | sed $'s/\033\\[[0-9;]*m//g' >> "$REPORT"
  return 0
}

# ------------------------------------------------------------------- machinery

mkdir -p "$LOG_DIR" screenshots
: > "$REPORT"

IDX=0
FAILED=0
FAIL_LABEL=""
FAIL_CAUSE=""
FAIL_FIX=""

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# check <label> <log-name> -- runs the remaining args, silencing them.
# On success the caller sets DETAIL to the short right-hand annotation.
# On failure the caller has already set FAIL_CAUSE / FAIL_FIX.
start_check() {
  IDX=$((IDX + 1))
  local label="$1"
  local padded="$label "
  while [ ${#padded} -lt 42 ]; do padded="${padded}."; done
  CURRENT_LABEL="$label"
  CURRENT_LINE="   [$IDX/$TOTAL]  $padded  "
}

pass_check() {
  say "${CURRENT_LINE}${GREEN}PASS${RESET}   ${DIM}${1:-}${RESET}"
}

fail_check() {
  say "${CURRENT_LINE}${RED}FAIL${RESET}"
  FAILED=1
  FAIL_LABEL="$CURRENT_LABEL"
  FAIL_CAUSE="$1"
  FAIL_FIX="$2"
}

cleanup() {
  if [ "$KEEP" -eq 0 ]; then
    compose down --remove-orphans >"$LOG_DIR/teardown.log" 2>&1
  fi
}
trap cleanup EXIT

cd "$(dirname "$0")" || exit 1

# Load .env so the token checks see the same values the containers will.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# ------------------------------------------------- wrong-container-mode gate

# A Docker daemon in Windows-container mode cannot run ANY of the Linux images
# this stack uses (nginx:alpine, the Playwright base), and one daemon cannot
# serve both modes at once. Without this gate the run gets as far as check 2 and
# reports "the container image failed to build / this is almost always a network
# problem" — which sends the attendee off debugging their wifi over what is
# really a one-line mode switch. Found on a real Windows 11 host, 2026-09-12.
#
# The message is a quoted heredoc so the Windows paths inside it need no
# escaping: writing them into a printf FORMAT string turns windows\verify.ps1
# into windowserify.ps1, because printf reads the \v as a vertical tab.
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  OS_TYPE=$(docker info --format '{{.OSType}}' 2>/dev/null || echo "")
  if [ "$OS_TYPE" = "windows" ]; then
    if [ "$QUIET" -eq 1 ]; then
      # printf with a single-quoted %s argument, not echo: `echo` is allowed to
      # interpret backslash escapes (SC2028), and this string contains a Windows
      # path. The same \v-becomes-a-vertical-tab mistake already turned
      # "windows\verify.ps1" into "windowserify.ps1" once in this file.
      printf '%s\n' 'FAIL  Docker is in Windows-container mode - run windows\verify.ps1 instead'
      exit 2
    fi
    cat <<'BANNER'

============================================================
   ORCHLAB WORKSHOP - WRONG CONTAINER MODE
============================================================

   Docker Desktop is in WINDOWS-container mode, and every image this
   check needs is a Linux image. Nothing here can run as-is.

   This is not your fault and nothing is broken. Pick one:

   A) Run the Windows-container check instead. No daemon switch, and it
      proves the same five things:

          powershell -ExecutionPolicy Bypass -File windows\verify.ps1

   B) Switch Docker Desktop to Linux containers, then re-run this script:

          & "$Env:ProgramFiles\Docker\Docker\DockerCli.exe" -SwitchDaemon

      This stops any Windows containers you have running.

   See windows\README.md for the difference between the two.
============================================================
BANNER
    exit 2
  fi
fi

# ---------------------------------------------------------------------- banner

if [ "$QUIET" -eq 0 ]; then
  say ""
  say "${BOLD}${RULE}${RESET}"
  say "${BOLD}   ORCHLAB WORKSHOP - ENVIRONMENT CHECK${RESET}"
  say "${BOLD}${RULE}${RESET}"
  say ""
fi

# ---------------------------------------------------------------- 1: Docker up

start_check "Docker daemon reachable"
if ! command -v docker >/dev/null 2>&1; then
  fail_check "the 'docker' command was not found on your PATH" \
"install Docker Desktop from https://docker.com/products/docker-desktop
                        then re-run  ./verify.sh"
elif ! docker info >"$LOG_DIR/01-docker.log" 2>&1; then
  fail_check "Docker is installed but the daemon is not running" \
"start Docker Desktop and wait for the whale icon to stop animating
                        then re-run  ./verify.sh"
else
  DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
  pass_check "$DOCKER_VERSION"
fi

# ------------------------------------------------------------------- 2: Build

if [ "$FAILED" -eq 0 ]; then
  start_check "Workshop image builds"
  BUILD_START=$(date +%s)
  if compose build verify-agent >"$LOG_DIR/02-build.log" 2>&1; then
    pass_check "$(( $(date +%s) - BUILD_START ))s"
  else
    fail_check "the container image failed to build" \
"this is almost always a network problem - check your connection,
                        then re-run  ./verify.sh
                        full build output is in $LOG_DIR/02-build.log"
  fi
fi

# --------------------------------------------------------- 3: Claude Code auth

if [ "$FAILED" -eq 0 ]; then
  start_check "Claude Code CLI + auth"
  if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    fail_check "no credential found - .env has neither CLAUDE_CODE_OAUTH_TOKEN nor ANTHROPIC_API_KEY" \
"run  claude setup-token
                        copy the value it prints
                        run  cp .env.example .env   (if you have not already)
                        paste the value into .env as CLAUDE_CODE_OAUTH_TOKEN
                        re-run  ./verify.sh"
  elif ! compose run --rm --no-deps verify-agent claude --version \
        >"$LOG_DIR/03-claude.log" 2>&1; then
    fail_check "the Claude Code CLI did not start inside the container" \
"check $LOG_DIR/03-claude.log for the error
                        if it mentions authentication, re-run  claude setup-token
                        and refresh the value in .env"
  else
    CLAUDE_VERSION=$(tr -d '\r' < "$LOG_DIR/03-claude.log" | tail -1 | awk '{print $1}')
    pass_check "claude ${CLAUDE_VERSION:-ok}, credential present"
  fi
fi

# ------------------------------------------------------------ 4: Site reachable

if [ "$FAILED" -eq 0 ]; then
  start_check "Workshop site responds"
  PORT="${VERIFY_PORT:-8080}"
  if ! compose up -d verify-web >"$LOG_DIR/04-web.log" 2>&1; then
    fail_check "the web container would not start" \
"port $PORT is probably already in use on your machine
                        re-run with a different port:  VERIFY_PORT=8081 ./verify.sh"
  else
    SITE_START=$(date +%s)
    SITE_OK=0
    # Poll rather than sleep-and-hope, so a slow machine passes and a genuinely
    # broken one fails fast enough to keep the room moving.
    for _ in $(seq 1 30); do
      if curl -fsS -o /dev/null "http://localhost:${PORT}/" 2>>"$LOG_DIR/04-web.log"; then
        SITE_OK=1
        break
      fi
      sleep 1
    done
    if [ "$SITE_OK" -eq 1 ]; then
      pass_check "HTTP 200 on :${PORT}, $(( $(date +%s) - SITE_START ))s"
    else
      fail_check "nothing answered on http://localhost:${PORT}/ after 30s" \
"another program may be holding port $PORT
                        re-run with a different port:  VERIFY_PORT=8081 ./verify.sh"
    fi
  fi
fi

# --------------------------------------------------------------- 5: Screenshot

if [ "$FAILED" -eq 0 ]; then
  start_check "Playwright screenshot captured"
  rm -f "$SCREENSHOT"
  if ! compose run --rm verify-agent node /work/screenshot.mjs \
       >"$LOG_DIR/05-screenshot.log" 2>&1; then
    fail_check "the headless browser could not render and capture the page" \
"check $LOG_DIR/05-screenshot.log for the error
                        then re-run  ./verify.sh"
  elif [ ! -s "$SCREENSHOT" ]; then
    fail_check "Playwright reported success but $SCREENSHOT was not written" \
"this is usually a Docker file-sharing permission problem
                        check that this folder is shared with Docker Desktop
                        (Settings > Resources > File Sharing)"
  else
    SIZE_KB=$(( $(wc -c < "$SCREENSHOT") / 1024 ))
    pass_check "verify.png, ${SIZE_KB} KB"
  fi
fi

# ---------------------------------------------------------------- Skipped rows

# A failure stops the run, but the checklist should still show its full length -
# otherwise it reads as "the script crashed" rather than "check 3 failed".
while [ "$IDX" -lt "$TOTAL" ]; do
  case $((IDX + 1)) in
    2) start_check "Workshop image builds" ;;
    3) start_check "Claude Code CLI + auth" ;;
    4) start_check "Workshop site responds" ;;
    5) start_check "Playwright screenshot captured" ;;
  esac
  say "${CURRENT_LINE}${DIM}----${RESET}   ${DIM}not reached${RESET}"
done

# ------------------------------------------------------------------- Verdict

say ""
if [ "$FAILED" -eq 0 ]; then
  say "   ${GREEN}${BOLD}ALL ${TOTAL} CHECKS PASSED${RESET}"
  say ""
  say "   Your environment is ready. ${BOLD}There is nothing else to do.${RESET}"
  say "   Open ${BOLD}${SCREENSHOT}${RESET} to see the proof - it should read"
  say "   \"ENVIRONMENT OK\" with your container name and the time."
  say ""
  say "   ${BOLD}${RULE}${RESET}"
  [ "$QUIET" -eq 1 ] && printf 'PASS  all %s checks\n' "$TOTAL"
  exit 0
else
  say "   ${RED}${BOLD}1 CHECK FAILED${RESET} - this is fixable, and you are not behind."
  say ""
  say "       Failed check:    ${BOLD}${FAIL_LABEL}${RESET}"
  say "       What went wrong: ${FAIL_CAUSE}"
  say "       Fix it:          ${FAIL_FIX}"
  say "       Still stuck?     raise your hand - do not keep retrying."
  say ""
  say "   A copy of this report is in ${BOLD}${REPORT}${RESET} - paste it if you ask for help."
  say "   ${BOLD}${RULE}${RESET}"
  [ "$QUIET" -eq 1 ] && printf 'FAIL  %s\n' "$FAIL_LABEL"
  exit 1
fi
