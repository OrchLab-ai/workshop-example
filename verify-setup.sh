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
WORKSHOP_COMPOSE_FILE="docker-compose.workshop.yml"
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
CURRENT_PREFIX_SHORT=""
SHOT_HOST=""
SHOT_STAMP=""
PROGRESS_EPOCH=""
STEP_NOTE_PREFIX=""
FAIL_LABEL=""
FAIL_CAUSE=""
FAIL_FIX=""

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# The real workshop stack. Check 3 builds through this so that the images warmed the
# night before are the images `up -d` wants in the morning - see check 3.
workshop_compose() { docker compose -f "$WORKSHOP_COMPOSE_FILE" "$@"; }

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
  # What a narrow terminal falls back to. The counter is kept because it is what
  # tells you which check you are watching; the label is dropped because it is
  # static, and the moving note beside it is worth more columns.
  CURRENT_PREFIX_SHORT="   [$IDX/$TOTAL] "
  # One clock per check, however many commands it runs. See run_logged.
  PROGRESS_EPOCH=$(date +%s)
  STEP_NOTE_PREFIX=""
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

# term_cols - the REAL width of the terminal, which is harder than it looks.
#
# `tput cols` on its own is wrong here. term_cols is always called inside $( ),
# where stdout is a pipe, so tput cannot measure the terminal and falls back to the
# terminfo default for $TERM - 80 for xterm, and narrower for some others. That is
# how a 200-column window ended up computing its layout against 80 columns, and how
# a terminal whose terminfo says less than 80 ended up truncating the one line on
# screen that was actually moving.
#
# So: ask the terminal itself, via /dev/tty, and only then fall back. stty is first
# because it reports the CURRENT size and so survives the window being resized
# mid-build, which is exactly when a long pull is running.
term_cols() {
  local c=""
  if [ -r /dev/tty ]; then
    c=$(stty size </dev/tty 2>/dev/null | cut -d' ' -f2)
    case "$c" in '' | *[!0-9]*) c=$(tput cols </dev/tty 2>/dev/null) ;; esac
  fi
  case "$c" in '' | *[!0-9]*) c="${COLUMNS:-}" ;; esac
  case "$c" in '' | *[!0-9]*) c=80 ;; esac
  [ "$c" -lt 40 ] && c=40
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

# progress_draw <elapsed-seconds> <note> - repaint the current check line. The line
# must not wrap: a wrapped line defeats the \r redraw and leaves a trail of
# half-finished rows up the screen. So something has to give when it will not fit,
# and the order of what gives is the whole point of this function.
#
# THE NOTE IS THE LAST THING TO BE CUT. It is the only part of the row that moves,
# and on a first run it is the only evidence on screen that a ~2 GB download is
# progressing rather than hung - which is precisely when somebody kills it. The
# prefix beside it is static text they read when the check started. So a narrow
# terminal drops to the SHORT prefix ("   [3/6] ") and gives the reclaimed columns
# to the note, and the note is only truncated once even that is not enough.
progress_draw() {
  local secs="$1" note="$2" cols prefix room tail_len
  cols=$(term_cols)
  # What the suffix actually costs: a space, the seconds, and the "s".
  tail_len=$(( ${#secs} + 2 ))

  prefix="$CURRENT_PREFIX"
  room=$(( cols - ${#prefix} - tail_len ))
  if [ "$room" -lt ${#note} ]; then
    prefix="$CURRENT_PREFIX_SHORT"
    room=$(( cols - ${#prefix} - tail_len ))
  fi

  [ "$room" -lt 8 ] && room=8
  if [ ${#note} -gt "$room" ]; then note="${note:0:$((room - 3))}..."; fi

  # Pad to the width of the terminal, because \r only moves the cursor - it does not
  # erase. A new line one character shorter than the last leaves that character
  # standing, which is where the stray "30ss" came from: the previous row ended in
  # "31s", this one in "30s", and the old trailing "s" was never overwritten. Byte
  # counters change width constantly ("9.9MB / 1.9GB" -> "10MB / 1.9GB"), so this is
  # every second, not an edge case.
  #
  # Spaces rather than the ANSI erase-to-end-of-line: NO_COLOR blanks every escape
  # this script emits, and an erase sequence that ignored that would be the one piece
  # of ANSI left in a deliberately plain output.
  local line pad
  line="${prefix}${note} ${secs}s"
  pad=$(( cols - ${#line} ))
  [ "$pad" -lt 0 ] && pad=0
  printf '\r%s%s%s %ss%s%*s' "$prefix" "$DIM" "$note" "$secs" "$RESET" "$pad" ''
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
  local pid=$! start base rc note
  start=$(date +%s)
  # Time the CHECK, not this command. A check that runs several commands in sequence
  # (check 3 builds three images and pulls a fourth) otherwise restarts its clock at
  # every one, and the row counts up, snaps back to 0s, and counts up again - which
  # reads as the thing having crashed and restarted.
  base="${PROGRESS_EPOCH:-$start}"
  while kill -0 "$pid" 2>/dev/null; do
    note=$(progress_note "$log")
    # Say WHICH image, or the phase words alone ("starting", "working", "step 12/12")
    # look like noise from nowhere - they belong to a sub-step the row never named.
    [ -n "${STEP_NOTE_PREFIX:-}" ] && note="${STEP_NOTE_PREFIX} ${note}"
    progress_draw "$(( $(date +%s) - base ))" "$note"
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
#
# Sourced through a CR-stripping copy rather than directly. The audience is mostly
# Windows, .env gets opened in Notepad, and it comes back CRLF - at which point every
# value carries a trailing \r that is invisible in every error message it causes.
#
# STRIPPING IS NOT THE FIX, AND ON ITS OWN IT MAKES THINGS WORSE. This script is not
# the only thing that reads .env: `docker compose` reads the real file and hands the
# real value to the container. Strip here and nowhere else and the result is the worst
# possible outcome - the check passes, the credential looks perfect, and Claude asks
# the attendee to log in anyway with all six checks green behind them. So the file is
# also TESTED for CRLF further down, and that is a hard failure with an explicit fix.
ENV_HAS_CRLF=0
if [ -f .env ]; then
  if tr -d '\n' < .env | grep -q "$(printf '\r')"; then ENV_HAS_CRLF=1; fi
  ENV_CLEAN="$(mktemp)"
  tr -d '\r' < .env > "$ENV_CLEAN"
  set -a
  # shellcheck disable=SC1091
  . "$ENV_CLEAN"
  set +a
  rm -f "$ENV_CLEAN"
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
    # --force: a plain fetch will not update a tag that already exists locally, so a
    # republished rung would never reach a returning attendee. See checkpoint.sh.
    run_logged "$LOG_DIR/01-clone.log" git -C "$APP_DIR" fetch --tags --force --quiet || true
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
  # Build the images the WORKSHOP uses, not just the check's own. This step exists
  # to move every download to the night before, and it only does that if it fetches
  # what the morning will fetch: `up -d` otherwise sat there pulling ~2 GB while a
  # room waited, having "passed" a check that warmed a different image entirely.
  #
  # Ordered cheapest-signal-first. The check's own image shares its base layer with
  # the workshop's (see verify/Dockerfile), so by the time the second build runs the
  # expensive part is already in the local cache.
  # A log PER sub-step. They shared one, and since run_logged truncates its log on
  # entry, each build wiped the previous one's output while the note reader was still
  # reading it - so the row flipped between "starting", "working" and a step counter
  # belonging to whichever build had last emptied the file.
  BUILD_OK=1
  STEP_NOTE_PREFIX="check image:"
  run_logged "$LOG_DIR/03-build.log" compose build verify-agent || BUILD_OK=0

  if [ "$BUILD_OK" -eq 1 ]; then
    # The container every attendee lives in all day.
    STEP_NOTE_PREFIX="workshop container:"
    run_logged "$LOG_DIR/03-build-workshop.log" \
      workshop_compose build claude-container || BUILD_OK=0
  fi
  if [ "$BUILD_OK" -eq 1 ]; then
    # Not --quiet: the byte counters are the only thing that moves during a pull, and
    # they are what progress_note reads to keep the row alive.
    STEP_NOTE_PREFIX="postgres:"
    run_logged "$LOG_DIR/03-pull-db.log" workshop_compose pull db || BUILD_OK=0
  fi
  if [ "$BUILD_OK" -eq 1 ]; then
    # Part 3's image. Not needed until the afternoon, which is exactly why it is
    # fetched now: a 2 GB pull is worst when it lands in the middle of an exercise.
    STEP_NOTE_PREFIX="part 3 agent:"
    run_logged "$LOG_DIR/03-build-agent.log" \
      workshop_compose --profile l4 build autonomous-agent || BUILD_OK=0
  fi
  STEP_NOTE_PREFIX=""

  if [ "$BUILD_OK" -eq 1 ]; then
    pass_check "check + workshop + agent, $(( $(date +%s) - BUILD_START ))s"
  else
    fail_check "a container image failed to build" \
"this is almost always a network problem - check your connection,
                        then re-run  ./verify-setup.sh
                        the failing step names its own log in $LOG_DIR/:
                        03-build.log, 03-build-workshop.log,
                        03-pull-db.log, 03-build-agent.log"
  fi
fi

# --------------------------------------------------------- 4: Claude Code auth

if [ "$FAILED" -eq 0 ]; then
  start_check "Claude Code CLI + auth"
  # TWO credentials, and the attendee tells us which they have. The guide presents
  # them as a pair of exclusive accordions rather than a list of options, because a
  # list of options is what produced the failure the prefix guards below exist to
  # catch. Here we accept either and validate whichever is present.
  #
  # When this grows to other providers (Cursor CLI, Codex), each gets its own branch
  # here and its own section in the guide - never an extra unexplained line in .env.
  if [ "$ENV_HAS_CRLF" -eq 1 ]; then
    fail_check ".env has Windows line endings (CRLF)" \
"every value in it ends with an invisible carriage return, including
                        your credential - and a credential with \\r on the end is not
                        your credential. Docker passes the broken value straight to
                        the container, so Claude asks you to log in even though
                        everything here looks correct.
                        This happens when .env is saved from Notepad. Fix it with:
                          sed -i 's/\\r\$//' .env
                        or re-save the file from your editor as LF / Unix line
                        endings, then re-run  ./verify-setup.sh"
  elif [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    fail_check "no credential found - .env has neither CLAUDE_CODE_OAUTH_TOKEN nor ANTHROPIC_API_KEY" \
"if you have a Claude SUBSCRIPTION, on your own machine run
                          claude setup-token
                        and paste the sk-ant-oat01- value it prints into .env as
                          CLAUDE_CODE_OAUTH_TOKEN
                        if you have an API KEY from console.anthropic.com, paste it
                        into .env as
                          ANTHROPIC_API_KEY
                        no .env yet?  cp .env.example .env
                        then re-run  ./verify-setup.sh"
  # THE ONE THAT COST AN ATTENDEE AN HOUR. A credential in the other line is
  # non-empty, the right shape and about the right length, and `claude --version`
  # still runs - so this check passed and Claude then asked them to log in, with
  # nothing anywhere pointing at the cause. The prefix is the only tell.
  elif [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && \
       case "$CLAUDE_CODE_OAUTH_TOKEN" in sk-ant-oat01-*) false ;; *) true ;; esac; then
    fail_check "CLAUDE_CODE_OAUTH_TOKEN is not a setup-token value" \
"that line takes a token starting  sk-ant-oat01-
                        what is in it starts  $(printf '%.13s' "$CLAUDE_CODE_OAUTH_TOKEN")
                        if that is  sk-ant-api03-  it is an API KEY, not a
                        setup-token - move it to ANTHROPIC_API_KEY and leave
                        CLAUDE_CODE_OAUTH_TOKEN empty. Both start sk-ant- and both
                        are about 108 characters; the prefix is the only difference.
                        then re-run  ./verify-setup.sh"
  elif [ -n "${ANTHROPIC_API_KEY:-}" ] && \
       case "$ANTHROPIC_API_KEY" in sk-ant-api03-*) false ;; *) true ;; esac; then
    fail_check "ANTHROPIC_API_KEY is not an API key" \
"that line takes a key starting  sk-ant-api03-
                        what is in it starts  $(printf '%.13s' "$ANTHROPIC_API_KEY")
                        if that is  sk-ant-oat01-  it came from  claude setup-token
                        - move it to CLAUDE_CODE_OAUTH_TOKEN and leave
                        ANTHROPIC_API_KEY empty.
                        then re-run  ./verify-setup.sh"
  elif ! run_logged "$LOG_DIR/04-claude.log" \
        compose run --rm --no-deps verify-agent claude --version; then
    fail_check "the Claude Code CLI did not start inside the container" \
"check $LOG_DIR/04-claude.log for the error
                        if it mentions authentication, re-run  claude setup-token
                        and refresh the value in .env"
  # THE CHECK THAT ACTUALLY CHECKS. Everything above proves the value is present, is
  # the right shape, and that the CLI runs - and `claude --version` makes no network
  # call at all, so every one of those passed for an attendee whose credential was
  # rejected the moment they tried to use it. Six green checks and then a login
  # prompt. One real round trip is the only thing that distinguishes a credential
  # that exists from one that works, and it costs a handful of tokens.
  elif ! STEP_NOTE_PREFIX="authenticating " run_logged "$LOG_DIR/04-auth.log" \
        compose run --rm --no-deps verify-agent claude -p "Reply with the two characters: OK"; then
    fail_check "the credential was rejected - Claude could not authenticate" \
"the value in .env is present and the right shape, but Claude will not
                        accept it. The usual causes, in order:
                          - the token has expired or been revoked; run
                            claude setup-token  again on your own machine
                          - it was truncated on the way into .env - check there is no
                            line break or stray quote around it
                          - .env was saved with Windows line endings (see above)
                        the exact error is in $LOG_DIR/04-auth.log"
  else
    CLAUDE_VERSION=$(tr -d '\r' < "$LOG_DIR/04-claude.log" | tail -1 | awk '{print $1}')
    pass_check "claude ${CLAUDE_VERSION:-ok}, credential authenticated"
  fi
fi

# ------------------------------------------------------------ 5: Site reachable

if [ "$FAILED" -eq 0 ]; then
  start_check "Workshop site responds"
  # THE port - the one the workshop stack itself publishes, not a stand-in. Proving
  # some unrelated port is free predicts nothing about the day; 5173 is Vite's
  # default and therefore the port an attendee is most likely to already be using.
  # One variable governs the check and the stack, so an override set once in .env
  # carries through the whole workshop and no command has to change.
  PORT="${WORKSHOP_PORT:-5173}"
  if ! run_logged "$LOG_DIR/05-web.log" compose up -d verify-web; then
    fail_check "port $PORT is already in use on your machine - this is the port the workshop needs" \
"if the workshop stack is already running, that is what is holding it:
                          docker compose -f docker-compose.workshop.yml down
                        otherwise something else on your machine has it - another
                        Vite project is the usual answer, since 5173 is its default.
                        Pick a different port, and KEEP it for the workshop:
                          echo WORKSHOP_PORT=5174 >> .env
                        then re-run  ./verify-setup.sh"
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
"something may be holding port $PORT without Docker noticing.
                        Pick a different port, and KEEP it for the workshop:
                          echo WORKSHOP_PORT=5174 >> .env
                        then re-run  ./verify-setup.sh"
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
    # What the browser stamped onto the image. Read back out of the log because the
    # container that knew it is already gone - see the verdict block below.
    SHOT_HOST=$(tr -d '\r' < "$LOG_DIR/06-screenshot.log" | sed -n 's/^VERIFY_HOST=//p' | tail -1)
    SHOT_STAMP=$(tr -d '\r' < "$LOG_DIR/06-screenshot.log" | sed -n 's/^VERIFY_STAMP=//p' | tail -1)
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
  say "   \"ENVIRONMENT OK\" and match this:"
  say ""
  # The container is destroyed as soon as the check finishes, so its hostname cannot
  # be looked up afterwards. Printing it here is what turns "it should show your
  # container name" from an instruction into something an attendee can actually
  # perform - and it lands in verify-report.txt too, so a pasted report and a
  # screenshot can be told to be from the same run rather than assumed to be.
  say "       Container:  ${BOLD}${SHOT_HOST:-(not reported)}${RESET}"
  say "       Taken at:   ${BOLD}${SHOT_STAMP:-(not reported)}${RESET}"
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
