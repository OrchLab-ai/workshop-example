#!/usr/bin/env bash
#
# Mirror each harness run's record to runs/ on the attendee's machine, every few seconds.
#
# WHY A MIRROR AND NOT A MOUNT OF /workspace/runs ITSELF
# A run folder holds the run's worktree, and the worktree holds a full node_modules that
# npm ci writes and the tests read. Over a bind mount (Docker Desktop on a Mac or Windows
# host) that is many times slower, and runs are already the longest thing in the day. So
# the runs stay in the container, and this copies across only what a person reads: the
# files at the top of each run folder (plan.md, result.md, run.log, the events, the
# screenshots) and a changes.diff of what the agent has changed so far. Never repo/.
#
# Read-only in effect: editing a file under runs/ on the host changes nothing in here.
# Started once by start-app.sh at boot; its log is /workspace/logs/mirror-runs.log.
set -uo pipefail

SRC="${WORKSHOP_RUNS_DIR:-/workspace/runs}"
DST="${WORKSHOP_RUNS_VIEW:-/workspace/runs-view}"
EVERY="${WORKSHOP_RUNS_EVERY:-3}"

[ -d "$DST" ] || { echo "mirror-runs: $DST is not mounted; nothing to do" >&2; exit 0; }

# Everything the agent has changed in a worktree since <base>: committed or not, tracked or
# new. node_modules and the like are left out by the repo's own .gitignore.
changes() { # changes <worktree> <base>
  git -C "$1" diff "$2" || return 1
  # --no-index exits 1 when the files differ, which for a new file is always.
  git -C "$1" ls-files --others --exclude-standard -z |
    while IFS= read -r -d '' f; do git -C "$1" diff --no-index /dev/null "$f"; done
  return 0
}

# The commit a run's worktree started from: the first entry in its branch's reflog, so the
# diff still shows the agent's work after the harness has committed it.
base() { # base <worktree>
  local b
  b=$(git -C "$1" symbolic-ref -q HEAD) &&
    git -C "$1" reflog show --format=%H "$b" 2>/dev/null | tail -n 1
}

while :; do
  for run in "$SRC"/*/; do
    [ -d "$run" ] || continue
    out="$DST/$(basename "$run")"
    # Every run once; after that, only runs written to in the last ten minutes.
    if [ -d "$out" ] && [ -z "$(find "$run" -maxdepth 1 -newermt '-10 minutes' -print -quit)" ]; then
      continue
    fi
    mkdir -p "$out"

    # The record: the files at the top of the run folder, copied when they change.
    find "$run" -maxdepth 1 -type f -exec cp -up {} "$out/" \;

    # The code, as a diff. Written to a temporary file first, so it is never seen half-done.
    work="${run}repo"
    from=$(base "$work")
    if [ -n "$from" ] && changes "$work" "$from" >"$out/.changes.diff.tmp" 2>/dev/null; then
      mv -f "$out/.changes.diff.tmp" "$out/changes.diff"
    else
      rm -f "$out/.changes.diff.tmp"
    fi
  done
  sleep "$EVERY"
done
