#!/usr/bin/env bash
#
# OrchLab Workshop — Checkpoint navigator
#
#   ./checkpoint.sh 4          jump to the state after activity 4
#   ./checkpoint.sh --list     see the whole ladder
#   ./checkpoint.sh --status   where am I?
#
# The point of this script is that falling behind in one exercise must never
# lock you out of the next one. Your in-progress work is committed to a wip/
# branch before anything moves, so nothing you have written is ever discarded —
# even if you have not committed it yourself.
#
# EVERY git operation here runs against app/, not against this repository. The
# ladder lives in the app repo and this one stays at HEAD, so that improving the
# guide, the environment check or this very script cannot invalidate a
# checkpoint. The manifest is the exception: it is guide content, not app state,
# so it stays here. See checkpoints/README.md.
#
set -uo pipefail

MANIFEST="checkpoints/manifest.txt"
APP_DIR="${WORKSHOP_APP_DIR:-app}"
FRESH=0

cd "$(dirname "$0")" || exit 1

# ---------------------------------------------------------------- presentation

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; AMBER=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; AMBER=''; RED=''; RESET=''
fi

die() { printf '%s\n' "${RED}${BOLD}$1${RESET}" >&2; exit 1; }

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

usage() {
  cat <<'USAGE'
Usage: ./checkpoint.sh [N | cp-NN] [--fresh]
       ./checkpoint.sh --list
       ./checkpoint.sh --status

  N | cp-NN   Jump to that checkpoint. Your uncommitted work is committed to a
              wip/ branch first, and you land on a work/cp-NN branch you can
              commit to freely.
  --fresh     Discard an existing work/cp-NN branch and start that checkpoint
              again from the tag. Your work is still parked to wip/ first.
  --list      Show the full ladder and which checkpoints are published.
  --status    Show where you currently are.
  --parked    List work parked by earlier jumps, and how to get it back.
  --help      This message.

All of this operates on the app clone in ./app, never on this repository:
the ladder is the app repo's tags, and this repo always stays at HEAD.
USAGE
}
# ------------------------------------------------------------------- manifest

[ -f "$MANIFEST" ] || die "Cannot find $MANIFEST — are you in the workshop-example repo?"

TAGS=(); TITLES=(); STATES=(); NEXTS=()
while IFS='|' read -r f_tag f_title f_state f_next; do
  [ -n "${f_tag:-}" ] || continue
  TAGS+=("$(trim "$f_tag")")
  TITLES+=("$(trim "${f_title:-}")")
  STATES+=("$(trim "${f_state:-}")")
  NEXTS+=("$(trim "${f_next:-}")")
done < <(grep -v '^[[:space:]]*#' "$MANIFEST" | grep -v '^[[:space:]]*$')

[ "${#TAGS[@]}" -gt 0 ] || die "$MANIFEST has no checkpoints in it."

index_of() {
  local want="$1" i=0
  while [ "$i" -lt "${#TAGS[@]}" ]; do
    [ "${TAGS[$i]}" = "$want" ] && { printf '%s' "$i"; return 0; }
    i=$((i + 1))
  done
  return 1
}

# Every git command below goes through here. The ladder is the app repo's, so a
# bare `git` in this script would ask THIS repository about tags it does not have.
app_git() { git -C "$APP_DIR" "$@"; }

tag_exists() { app_git rev-parse -q --verify "refs/tags/$1" >/dev/null 2>&1; }

# Where are we? Prefer the work/ branch name — it is what the attendee chose —
# and fall back to the nearest tag behind HEAD.
current_checkpoint() {
  local branch
  branch=$(app_git symbolic-ref --quiet --short HEAD 2>/dev/null || true)
  case "$branch" in
    work/cp-*) printf '%s' "${branch#work/}"; return 0 ;;
  esac
  app_git describe --tags --abbrev=0 --match 'cp-*' 2>/dev/null || true
}

# --------------------------------------------------------------------- parsing

TARGET=""
for arg in "$@"; do
  case "$arg" in
    --fresh) FRESH=1 ;;
    --list|-l) MODE=list ;;
    --status|-s) MODE=status ;;
    --parked|-p) MODE=parked ;;
    --help|-h) usage; exit 0 ;;
    --*) die "Unknown option: $arg" ;;
    [0-9]) TARGET="cp-0$arg" ;;
    [0-9][0-9]) TARGET="cp-$arg" ;;
    cp-*) TARGET="$arg" ;;
    *) die "Don't understand \"$arg\". Try  ./checkpoint.sh --list" ;;
  esac
done
MODE="${MODE:-${TARGET:+jump}}"
MODE="${MODE:-status}"

# ---------------------------------------------------------------------- guards

# Placed AFTER parsing so that --help still works on a machine where the app
# has not been cloned yet — which is exactly the machine whose owner needs it.
# The app is cloned, not submoduled, so it can simply be absent — and an absent
# app/ is the one failure this design introduces. Diagnose it by name. Saying
# "this is not a git repository" would send someone to check the wrong repo.
if [ ! -d "$APP_DIR" ] || [ -z "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
  printf '\n   %s\n' "${AMBER}${BOLD}The app is not cloned yet.${RESET}"
  printf '   %s\n' "The checkpoints live in the application repository, and ${BOLD}${APP_DIR}/${RESET} is"
  printf '   %s\n\n' "$([ -d "$APP_DIR" ] && printf 'empty.' || printf 'not there.')"
  printf '   %s\n' "Run the environment check — it clones the app for you:"
  printf '   %s\n\n' "${BOLD}./verify-setup.sh${RESET}"
  exit 1
fi
# Presence of app/.git, not `git -C app rev-parse` — rev-parse WALKS UP the
# directory tree and would find THIS repo's .git, calling a bare unzipped
# folder a valid clone.
if [ ! -e "$APP_DIR/.git" ] || ! app_git rev-parse --git-dir >/dev/null 2>&1; then
  printf '\n   %s\n' "${RED}${BOLD}${APP_DIR}/ exists but is not a git repository.${RESET}"
  printf '   %s\n' "The checkpoint ladder is git tags, so there is nothing here to jump between."
  printf '   %s\n' "If you downloaded a ZIP rather than cloning, move that folder aside and run:"
  printf '   %s\n\n' "${BOLD}./verify-setup.sh${RESET}"
  exit 1
fi

# ----------------------------------------------------------------------- list

if [ "$MODE" = "list" ]; then
  CURRENT=$(current_checkpoint)
  printf '\n%s\n' "${BOLD}   WORKSHOP CHECKPOINTS${RESET}"
  printf '%s\n\n' "${DIM}   Jump to any published checkpoint with  ./checkpoint.sh N${RESET}"
  i=0
  while [ "$i" -lt "${#TAGS[@]}" ]; do
    tag="${TAGS[$i]}"
    if tag_exists "$tag"; then
      state="${GREEN}published${RESET}"
    else
      state="${AMBER}not published${RESET}"
    fi
    marker="  "
    [ "$tag" = "$CURRENT" ] && marker="${GREEN}->${RESET}"
    printf '   %b %s  %-28s %b\n' "$marker" "${BOLD}${tag}${RESET}" "${TITLES[$i]}" "$state"
    printf '        %s%s%s\n' "$DIM" "${STATES[$i]}" "$RESET"
    i=$((i + 1))
  done
  printf '\n'
  exit 0
fi

# --------------------------------------------------------------------- parked

if [ "$MODE" = "parked" ]; then
  printf '\n%s\n' "${BOLD}   PARKED WORK${RESET}"
  found=0
  while IFS= read -r branch; do
    [ -n "$branch" ] || continue
    found=1
    when=$(app_git log -1 --format='%ar' "$branch" 2>/dev/null)
    what=$(app_git log -1 --format='%s' "$branch" 2>/dev/null)
    printf '\n   %s   %s\n' "${BOLD}${branch}${RESET}" "${DIM}${when}${RESET}"
    printf '      %s\n' "${DIM}${what}${RESET}"
    printf '      %s\n' "look at it:     git -C ${APP_DIR} show ${branch}"
    printf '      %s\n' "go back to it:  git -C ${APP_DIR} checkout ${branch}"
  done < <(app_git for-each-ref --format='%(refname:short)' --sort=-committerdate 'refs/heads/wip/*')
  if [ "$found" -eq 0 ]; then
    printf '\n   %s\n' "Nothing parked — you have not lost anything."
  fi
  printf '\n'
  exit 0
fi

# --------------------------------------------------------------------- status

if [ "$MODE" = "status" ]; then
  CURRENT=$(current_checkpoint)
  printf '\n'
  if [ -z "$CURRENT" ]; then
    printf '   %s\n' "You are not on a checkpoint yet."
    printf '   %s\n\n' "${DIM}Start with  ./verify-setup.sh  then  ./checkpoint.sh --list${RESET}"
    exit 0
  fi
  if idx=$(index_of "$CURRENT"); then
    printf '   %s  %s\n' "${BOLD}${CURRENT}${RESET}" "${TITLES[$idx]}"
    printf '   %s%s%s\n' "$DIM" "${STATES[$idx]}" "$RESET"
    printf '\n   Next up: %s\n' "${BOLD}${NEXTS[$idx]}${RESET}"
  else
    printf '   %s\n' "${BOLD}${CURRENT}${RESET}"
  fi
  if [ -n "$(app_git status --porcelain)" ]; then
    printf '   %s\n' "${AMBER}You have uncommitted work — it will be parked safely if you jump.${RESET}"
  fi
  printf '\n'
  exit 0
fi

# ----------------------------------------------------------------------- jump

idx=$(index_of "$TARGET") || die "No checkpoint called \"$TARGET\". Try  ./checkpoint.sh --list"

if ! tag_exists "$TARGET"; then
  # It may simply not have been fetched yet — try once before giving up, so an
  # attendee with a stale clone is not told a real checkpoint doesn't exist.
  # --force because a plain `fetch --tags` REFUSES to update a tag that already
  # exists locally. Rungs get republished — a checkpoint found to be carrying a
  # defect is corrected by moving its tag — and without this, the one person who
  # most needs the correction (somebody who already cloned) is the one person who
  # silently never receives it, while fresh clones get the fixed rung. The ladder
  # has to be correctable or it is not a safety net.
  app_git fetch --tags --force --quiet >/dev/null 2>&1
fi
if ! tag_exists "$TARGET"; then
  printf '\n   %s\n' "${AMBER}${BOLD}${TARGET} has not been published yet.${RESET}"
  printf '   %s\n' "It is on the ladder, but the tag does not exist in the app repo yet."
  printf '   %s\n\n' "${DIM}Run  ./checkpoint.sh --list  to see what is available.${RESET}"
  exit 1
fi

PARKED=""
if [ -n "$(app_git status --porcelain)" ]; then
  PARKED="wip/$(date +%Y%m%d-%H%M%S)"
  app_git checkout -q -b "$PARKED" 2>/dev/null || die "Could not create the wip branch — resolve your git state first."
  # Silenced: on Windows `git add` warns "LF will be replaced by CRLF" once per
  # file, and a jump that parks a dozen files scrolls that wall past an attendee
  # who has just been told nothing is wrong. If the add genuinely fails, the
  # commit below fails too and PARKED is cleared — which is the signal that matters.
  app_git add -A >/dev/null 2>&1
  # -c user.*, rather than relying on the attendee's global git identity. A laptop
  # set up this morning often has neither user.name nor user.email, and a commit
  # that fails here loses the very work this branch exists to protect. The values
  # are only ever used on wip/ commits in the app clone.
  app_git -c user.name='Workshop Attendee' -c user.email='attendee@workshop.local' \
    commit -q -m "wip: parked before jumping to $TARGET" || PARKED=""
fi

WORK="work/$TARGET"
ACTION="started"
if app_git rev-parse -q --verify "refs/heads/$WORK" >/dev/null 2>&1; then
  if [ "$FRESH" -eq 1 ]; then
    app_git checkout -q "$TARGET" || die "Could not check out $TARGET."
    app_git branch -q -D "$WORK"
    app_git checkout -q -b "$WORK" "$TARGET" || die "Could not recreate $WORK."
    ACTION="restarted from the tag"
  else
    app_git checkout -q "$WORK" || die "Could not switch to $WORK."
    ACTION="resumed (your earlier commits are still here)"
  fi
else
  app_git checkout -q -b "$WORK" "$TARGET" || die "Could not create $WORK from $TARGET."
fi

# CLEAR COMPILED OUTPUT. A jump is a whole-tree checkout, but dist/ is gitignored,
# so git leaves it exactly where it was — full of the PREVIOUS rung's build. tsc -b
# regenerates what the current source produces and never deletes what it no longer
# does, so the orphans survive indefinitely.
#
# That bites hardest in the direction attendees actually travel. Build at cp-01, jump
# back to cp-00, and dist/__tests__ still holds the compiled proposals tests, which
# fail against a tree where Proposal does not exist. The failure names files that are
# not in the repository, so it reads as a broken checkpoint rather than as stale
# output — and the ladder exists precisely so that a jump is never the thing that
# breaks.
#
# Only dist. node_modules is expensive and correct across rungs; the lockfile is what
# governs it, and start-app.sh reinstalls when that changes.
app_git rev-parse --show-toplevel >/dev/null 2>&1 &&
  rm -rf "$APP_DIR"/packages/*/dist "$APP_DIR"/dist 2>/dev/null || true

printf '\n   %s  %s\n' "${GREEN}${BOLD}${TARGET}${RESET}" "${TITLES[$idx]}"
printf '   %s%s%s\n\n' "$DIM" "${STATES[$idx]}" "$RESET"
printf '   Branch:   %s  %s\n' "${BOLD}${WORK}${RESET}" "${DIM}(${ACTION})${RESET}"
if [ -n "$PARKED" ]; then
  printf '   Parked:   %s %s\n' "${BOLD}${PARKED}${RESET}" "${DIM}— your previous work is committed there, nothing lost${RESET}"
fi
printf '   Next up:  %s\n' "${BOLD}${NEXTS[$idx]}${RESET}"
if [ "$FRESH" -eq 0 ] && [ "$ACTION" = "resumed (your earlier commits are still here)" ]; then
  printf '   %s\n' "${DIM}To start this checkpoint over from scratch:  ./checkpoint.sh ${TARGET} --fresh${RESET}"
fi
printf '\n'
