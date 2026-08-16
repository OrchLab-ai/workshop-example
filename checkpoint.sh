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
set -uo pipefail

MANIFEST="checkpoints/manifest.txt"
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

tag_exists() { git rev-parse -q --verify "refs/tags/$1" >/dev/null 2>&1; }

# Where are we? Prefer the work/ branch name — it is what the attendee chose —
# and fall back to the nearest tag behind HEAD.
current_checkpoint() {
  local branch
  branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)
  case "$branch" in
    work/cp-*) printf '%s' "${branch#work/}"; return 0 ;;
  esac
  git describe --tags --abbrev=0 --match 'cp-*' 2>/dev/null || true
}

# ---------------------------------------------------------------------- guards

git rev-parse --git-dir >/dev/null 2>&1 || die "This is not a git repository."

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
    when=$(git log -1 --format='%ar' "$branch" 2>/dev/null)
    what=$(git log -1 --format='%s' "$branch" 2>/dev/null)
    printf '\n   %s   %s\n' "${BOLD}${branch}${RESET}" "${DIM}${when}${RESET}"
    printf '      %s\n' "${DIM}${what}${RESET}"
    printf '      %s\n' "look at it:  git show ${branch}"
    printf '      %s\n' "go back to it:  git checkout ${branch}"
  done < <(git for-each-ref --format='%(refname:short)' --sort=-committerdate 'refs/heads/wip/*')
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
    printf '   %s\n\n' "${DIM}Start with  ./verify.sh  then  ./checkpoint.sh --list${RESET}"
    exit 0
  fi
  if idx=$(index_of "$CURRENT"); then
    printf '   %s  %s\n' "${BOLD}${CURRENT}${RESET}" "${TITLES[$idx]}"
    printf '   %s%s%s\n' "$DIM" "${STATES[$idx]}" "$RESET"
    printf '\n   Next up: %s\n' "${BOLD}${NEXTS[$idx]}${RESET}"
  else
    printf '   %s\n' "${BOLD}${CURRENT}${RESET}"
  fi
  if [ -n "$(git status --porcelain)" ]; then
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
  git fetch --tags --quiet >/dev/null 2>&1
fi
if ! tag_exists "$TARGET"; then
  printf '\n   %s\n' "${AMBER}${BOLD}${TARGET} has not been published yet.${RESET}"
  printf '   %s\n' "It is on the ladder, but the tag does not exist in this repo."
  printf '   %s\n\n' "${DIM}Run  ./checkpoint.sh --list  to see what is available.${RESET}"
  exit 1
fi

PARKED=""
if [ -n "$(git status --porcelain)" ]; then
  PARKED="wip/$(date +%Y%m%d-%H%M%S)"
  git checkout -q -b "$PARKED" 2>/dev/null || die "Could not create the wip branch — resolve your git state first."
  git add -A
  git commit -q -m "wip: parked before jumping to $TARGET" || PARKED=""
fi

WORK="work/$TARGET"
ACTION="started"
if git rev-parse -q --verify "refs/heads/$WORK" >/dev/null 2>&1; then
  if [ "$FRESH" -eq 1 ]; then
    git checkout -q "$TARGET" || die "Could not check out $TARGET."
    git branch -q -D "$WORK"
    git checkout -q -b "$WORK" "$TARGET" || die "Could not recreate $WORK."
    ACTION="restarted from the tag"
  else
    git checkout -q "$WORK" || die "Could not switch to $WORK."
    ACTION="resumed (your earlier commits are still here)"
  fi
else
  git checkout -q -b "$WORK" "$TARGET" || die "Could not create $WORK from $TARGET."
fi

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
