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

TOTAL=6
COMPOSE_FILE="docker-compose.verify.yml"
# The application attendees work on. It lives in its own repository so that its
# history (the cp-* ladder) moves independently of this one — see
# checkpoints/README.md. Overridable so a fork or a mirror can be pointed at.
APP_DIR="${WORKSHOP_APP_DIR:-app}"
APP_REPO="${WORKSHOP_APP_REPO:-https://github.com/OrchLab-ai/mars-mission-fund.git}"
LOG_DIR=".verify-logs"
REPORT="verify-report.txt"
SCREENSHOT="screenshots/verify.png"

QUIET=0
KEEP=0

usage() {
  cat <<'USAGE'
Usage: ./verify-setup.sh [options]

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
CURRENT_LABEL=""
CURRENT_LINE=""
CURRENT_PREFIX=""
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
  # The finished line is padded out with dots to a fixed width. While the check is
  # still running those columns are worth more as room for a progress note, so the
  # animated line uses an unpadded prefix and the padded line overwrites it.
  CURRENT_PREFIX="   [$IDX/$TOTAL]  $label ... "
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

# ------------------------------------------------------------------- progress
#
# The checklist prints one line per check, and that line is only written once the
# check has finished. That is right for a check that takes a second and wrong for
# check 2, which on a first run downloads a ~2 GB base image: the screen holds
# still for minutes with nothing to say it is working, and people kill it. So a
# long step redraws its own line in place with where it has got to, and the
# finished PASS/FAIL line overwrites the animation. Nothing is streamed, and the
# report file never sees any of it - a pasted report stays the same fixed-length
# checklist it was before.

# Animate only on a real terminal, and never under --quiet or in CI, where the
# carriage returns would pile up in a log nobody is watching live.
PROGRESS=0
if [ -t 1 ] && [ "$QUIET" -eq 0 ] && [ -z "${CI:-}" ]; then PROGRESS=1; fi

term_cols() {
  local c
  c=$(tput cols 2>/dev/null)
  case "$c" in '' | *[!0-9]*) c=80 ;; esac
  [ "$c" -lt 48 ] && c=48
  printf '%s' "$c"
}

# progress_note <log> - one short phrase for where the step has got to, read out
# of BuildKit's plain-progress log.
progress_note() {
  local log="$1" sizes line
  [ -s "$log" ] || { printf 'starting'; return; }
  # git clone, not docker. Check 1 clones the app repo through this same helper,
  # and git's own progress line is the only thing on screen that moves during a
  # slow clone. Read before the BuildKit patterns because it is unambiguous.
  line=$(tr '\r' '\n' < "$log" 2>/dev/null |
    grep -oE '(Receiving|Resolving|Counting|Compressing) objects: +[0-9]+%' | tail -1)
  if [ -n "$line" ]; then
    printf '%s' "$(printf '%s' "$line" | tr 'A-Z' 'a-z')"
    return
  fi

  # BuildKit's plain output carries the layer counter: "120.4MB / 1.9GB". Showing it
  # verbatim is the single most reassuring thing on screen during a first run, because
  # it is the one part that visibly moves.
  # Both phases are read from the TAIL of the log, so the note follows what docker is
  # doing now. Extraction is checked first: the download's byte counters stay in the
  # log after it finishes, and would otherwise keep winning once the pull is over.
  if tail -40 "$log" 2>/dev/null | grep -qE 'extracting'; then
    printf 'extracting layers'
    return
  fi
  sizes=$(tail -40 "$log" 2>/dev/null |
    grep -oE '[0-9.]+[KMG]i?B / [0-9.]+[KMG]i?B' | tail -1)
  if [ -n "$sizes" ]; then
    printf 'pulling %s' "$sizes"
    return
  fi
  line=$(grep -E '^#[0-9]+ \[[0-9]+/[0-9]+\]' "$log" 2>/dev/null | tail -1)
  if [ -n "$line" ]; then
    printf 'step %s' "$(printf '%s' "$line" |
      sed -E 's/^#[0-9]+ \[([0-9]+\/[0-9]+)\] ([A-Za-z]+).*/\1 \2/')"
    return
  fi
  printf 'working'
}

# progress_draw <elapsed-seconds> <note> - repaint the current check line. The
# note is truncated so the line cannot wrap: a wrapped line defeats the \r redraw
# and leaves a trail of half-finished rows up the screen.
progress_draw() {
  local secs="$1" note="$2" room
  room=$(( $(term_cols) - ${#CURRENT_PREFIX} - 10 ))
  [ "$room" -lt 8 ] && room=8
  if [ ${#note} -gt "$room" ]; then note="${note:0:$((room - 3))}..."; fi
  printf '\r%s%s%s %ss%s' "$CURRENT_PREFIX" "$DIM" "$note" "$secs" "$RESET"
}

progress_clear() {
  printf '\r%*s\r' "$(term_cols)" ''
}

# run_logged <log> <command...> - run a command silently, logging it, and keep the
# current check line updated while it runs. Returns the command's own exit status,
# so the callers' if/elif logic reads exactly as it did before.
run_logged() {
  local log="$1"; shift
  # stdin comes from /dev/null in both branches. `docker compose run` will read the
  # terminal if it can, and a BACKGROUND job that reads the terminal is stopped by
  # SIGTTIN - which looks exactly like the hang this function exists to prevent.
  if [ "$PROGRESS" -eq 0 ]; then
    "$@" >"$log" 2>&1 </dev/null
    return $?
  fi
  : > "$log"
  "$@" >"$log" 2>&1 </dev/null &
  local pid=$! start rc
  start=$(date +%s)
  while kill -0 "$pid" 2>/dev/null; do
    progress_draw "$(( $(date +%s) - start ))" "$(progress_note "$log")"
    sleep 1
  done
  wait "$pid"
  rc=$?
  progress_clear
  return $rc
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
      proves the same six things:

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

# ------------------------------------------------------------ 1: App cloned
#
# The app is a SEPARATE repository, cloned into app/ and gitignored here. That
# split is what stops an infrastructure change invalidating the checkpoint
# ladder (see checkpoints/README.md), and it costs exactly one thing: app/ can
# be absent.
#
# Absent is the failure mode a submodule would have had too, and it is a nasty
# one, because it does not announce itself. docker-compose.workshop.yml
# bind-mounts ./app, and an EMPTY DIRECTORY BIND-MOUNTS SUCCESSFULLY — the
# container starts, reports no error, and simply has no app inside it. So this
# is caught here, first, before anything slow runs.
#
# It is cheap (no Docker, no network unless it actually has to clone) and the
# repo is public, so the check just does the clone rather than printing a
# command for someone to copy at 09:05.

start_check "Workshop app cloned"
if ! command -v git >/dev/null 2>&1; then
  fail_check "the 'git' command was not found on your PATH" \
"git is one of the three things this workshop needs on your own machine
                        (the other two are Docker and Claude Code)
                        install it from https://git-scm.com/downloads
                        then re-run  ./verify-setup.sh"
elif [ -d "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ] && [ ! -e "$APP_DIR/.git" ]; then
  # Tested by the presence of $APP_DIR/.git, NOT by `git -C $APP_DIR rev-parse`.
  # rev-parse WALKS UP the directory tree, so inside an unzipped folder sitting
  # in this repo it finds workshop-example's OWN .git and cheerfully reports
  # success - and the attendee is told their ZIP is a clone of the wrong repo.
  # Deliberately NOT auto-fixed. Everything else in this check is safe to do
  # unasked because it only ever creates app/; deleting a directory somebody
  # already has files in is not, and a downloaded ZIP is the likely cause.
  fail_check "$APP_DIR/ exists but is not a git clone" \
"the checkpoint ladder is git tags, so a copy of the files is not enough
                        move that folder aside:  mv $APP_DIR ${APP_DIR}-old
                        then re-run  ./verify-setup.sh  and it will clone it properly"
else
  APP_ACTION="already cloned"
  if [ ! -d "$APP_DIR" ] || [ -z "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
    # An empty app/ left behind by an interrupted clone would make git refuse.
    rmdir "$APP_DIR" 2>/dev/null || true
    CLONE_START=$(date +%s)
    # --progress, not --quiet: run_logged reads this log to keep the checklist
    # line moving, and without it a slow clone looks exactly like a hang.
    if run_logged "$LOG_DIR/01-clone.log" git clone --progress "$APP_REPO" "$APP_DIR"; then
      APP_ACTION="cloned in $(( $(date +%s) - CLONE_START ))s"
    else
      fail_check "could not clone the workshop app from $APP_REPO" \
"this is almost always a network problem - check your connection,
                        then re-run  ./verify-setup.sh
                        the full git output is in $LOG_DIR/01-clone.log"
    fi
  else
    # Best effort, and deliberately not fatal: a tag published since this clone
    # was made should be visible, but being offline must not fail a check that
    # has everything it needs on disk. checkpoint.sh retries a fetch of its own
    # when a tag it wants is missing.
    run_logged "$LOG_DIR/01-clone.log" git -C "$APP_DIR" fetch --tags --quiet || true
  fi

  if [ "$FAILED" -eq 0 ]; then
    # Prove it is the right repository, not merely a repository. The workshop
    # stack builds app/autonomous/Dockerfile; if that is missing, the failure
    # surfaces several minutes later as a build error about a missing context.
    if [ ! -f "$APP_DIR/autonomous/Dockerfile" ]; then
      fail_check "$APP_DIR/ is a git clone, but it is not the workshop app" \
"expected to find $APP_DIR/autonomous/Dockerfile and it is not there
                        if you pointed WORKSHOP_APP_REPO somewhere else, unset it
                        otherwise move the folder aside and re-run  ./verify-setup.sh"
    else
      CP_COUNT=$(git -C "$APP_DIR" tag --list 'cp-*' 2>/dev/null | grep -c . || true)
      if [ "${CP_COUNT:-0}" -gt 0 ]; then
        if [ "$CP_COUNT" -eq 1 ]; then APP_DETAIL="1 checkpoint"; else APP_DETAIL="$CP_COUNT checkpoints"; fi
      else
        # Not a failure. The ladder is published rung by rung, and checkpoint.sh
        # already reports an unbuilt rung as "not published" rather than erroring.
        APP_DETAIL="no checkpoints published yet"
      fi
      pass_check "$(basename "$APP_REPO" .git), $APP_ACTION, $APP_DETAIL"
    fi
  fi
fi

# ------------------------------------------------------------ 2: Docker up

# Guarded like every check after it. Check 1 can now fail, and an unguarded
# check here would run anyway and overwrite the failure being reported.
if [ "$FAILED" -eq 0 ]; then
  start_check "Docker daemon reachable"
  if ! command -v docker >/dev/null 2>&1; then
    fail_check "the 'docker' command was not found on your PATH" \
"install Docker Desktop from https://docker.com/products/docker-desktop
                        then re-run  ./verify-setup.sh"
  elif ! docker info >"$LOG_DIR/02-docker.log" 2>&1; then
    # `docker info` failing has two very different causes that look identical from
    # here. If you lack permission to reach the socket or pipe, the daemon is running
    # perfectly and simply will not talk to you — and "start Docker Desktop" sends
    # that person into a restart loop they can never win. Judge by the error text.
    if grep -qiE 'permission denied|access is denied|denied while trying to connect|dial unix.*permission' \
         "$LOG_DIR/02-docker.log"; then
      case "$(uname -s)" in
        MINGW*|MSYS*|CYGWIN*)
          fail_check "you do not have permission to reach Docker - you are probably not in the docker-users group" \
"this needs an administrator, once. In an ELEVATED PowerShell:
                          Add-LocalGroupMember -Group docker-users -Member <your-username>
                        then SIGN OUT of Windows and back in - group rights are
                        granted at logon, so nothing changes until a new session.
                        Docker Desktop itself is almost certainly running fine."
          ;;
        Linux)
          fail_check "you do not have permission to reach the Docker socket" \
"add yourself to the docker group, once:
                          sudo usermod -aG docker \$USER
                        then LOG OUT and back in - group membership is applied at
                        login, so nothing changes until a new session.
                        The daemon itself is almost certainly running fine."
          ;;
        *)
          fail_check "you do not have permission to reach the Docker socket" \
"the daemon is running but will not talk to you - this is a permissions
                        problem, not a startup one. See $LOG_DIR/02-docker.log"
          ;;
      esac
    else
      fail_check "Docker is installed but the daemon is not answering" \
"start Docker Desktop and wait for the whale icon to stop animating
                        then re-run  ./verify-setup.sh
                        the full error is in $LOG_DIR/02-docker.log"
    fi
  else
    DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
    pass_check "$DOCKER_VERSION"
  fi
fi

# ------------------------------------------------------------------- 3: Build

if [ "$FAILED" -eq 0 ]; then
  start_check "Workshop image builds"
  BUILD_START=$(date +%s)
  if run_logged "$LOG_DIR/03-build.log" compose build verify-agent; then
    pass_check "$(( $(date +%s) - BUILD_START ))s"
  else
    fail_check "the container image failed to build" \
"this is almost always a network problem - check your connection,
                        then re-run  ./verify-setup.sh
                        full build output is in $LOG_DIR/03-build.log"
  fi
fi

# --------------------------------------------------------- 4: Claude Code auth

if [ "$FAILED" -eq 0 ]; then
  start_check "Claude Code CLI + auth"
  if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    fail_check "no credential found - .env has neither CLAUDE_CODE_OAUTH_TOKEN nor ANTHROPIC_API_KEY" \
"run  claude setup-token
                        copy the value it prints
                        run  cp .env.example .env   (if you have not already)
                        paste the value into .env as CLAUDE_CODE_OAUTH_TOKEN
                        re-run  ./verify-setup.sh"
  elif ! run_logged "$LOG_DIR/04-claude.log" \
        compose run --rm --no-deps verify-agent claude --version; then
    fail_check "the Claude Code CLI did not start inside the container" \
"check $LOG_DIR/04-claude.log for the error
                        if it mentions authentication, re-run  claude setup-token
                        and refresh the value in .env"
  else
    CLAUDE_VERSION=$(tr -d '\r' < "$LOG_DIR/04-claude.log" | tail -1 | awk '{print $1}')
    pass_check "claude ${CLAUDE_VERSION:-ok}, credential present"
  fi
fi

# ------------------------------------------------------------ 5: Site reachable

if [ "$FAILED" -eq 0 ]; then
  start_check "Workshop site responds"
  PORT="${VERIFY_PORT:-8080}"
  if ! run_logged "$LOG_DIR/05-web.log" compose up -d verify-web; then
    fail_check "the web container would not start" \
"port $PORT is probably already in use on your machine
                        re-run with a different port:  VERIFY_PORT=8081 ./verify-setup.sh"
  else
    SITE_START=$(date +%s)
    SITE_OK=0
    # Poll rather than sleep-and-hope, so a slow machine passes and a genuinely
    # broken one fails fast enough to keep the room moving.
    for _ in $(seq 1 30); do
      if curl -fsS -o /dev/null "http://localhost:${PORT}/" 2>>"$LOG_DIR/05-web.log"; then
        SITE_OK=1
        break
      fi
      [ "$PROGRESS" -eq 1 ] &&
        progress_draw "$(( $(date +%s) - SITE_START ))" "waiting for nginx to answer on :${PORT}"
      sleep 1
    done
    [ "$PROGRESS" -eq 1 ] && progress_clear
    if [ "$SITE_OK" -eq 1 ]; then
      pass_check "HTTP 200 on :${PORT}, $(( $(date +%s) - SITE_START ))s"
    else
      fail_check "nothing answered on http://localhost:${PORT}/ after 30s" \
"another program may be holding port $PORT
                        re-run with a different port:  VERIFY_PORT=8081 ./verify-setup.sh"
    fi
  fi
fi

# --------------------------------------------------------------- 6: Screenshot

if [ "$FAILED" -eq 0 ]; then
  start_check "Playwright screenshot captured"
  rm -f "$SCREENSHOT"
  if ! run_logged "$LOG_DIR/06-screenshot.log" \
       compose run --rm verify-agent node /work/screenshot.mjs; then
    fail_check "the headless browser could not render and capture the page" \
"check $LOG_DIR/06-screenshot.log for the error
                        then re-run  ./verify-setup.sh"
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
    2) start_check "Docker daemon reachable" ;;
    3) start_check "Workshop image builds" ;;
    4) start_check "Claude Code CLI + auth" ;;
    5) start_check "Workshop site responds" ;;
    6) start_check "Playwright screenshot captured" ;;
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
