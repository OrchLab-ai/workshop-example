#!/usr/bin/env bash
#
# Prove the app looks the same to the agent as it does to you.
#
# WHY THIS EXISTS
# Two bugs reached a real workshop run because every check in the suite used curl,
# and curl falls back to IPv4 when IPv6 refuses a connection. Headless Chromium does
# not. So the app was verifiably up by every measure the environment check had — and
# the agent, looking at the same URL from inside the same container, saw nothing.
#
# The bug that hurts is not "the app is down". It is "the app is up, and the agent
# cannot see it", because every signal says healthy and the attendee debugs the page.
#
# So this drives a REAL browser against the REAL app from both vantage points:
#
#   outside  a sibling container reaching the app over the compose network, which is
#            the vantage an attendee's own browser has
#   inside   the workshop container itself, at the same URL the agent is told to use
#            in activity 3 — the exact path that failed
#
# The two must agree. Disagreement is the whole point: a pass on one and a failure on
# the other localises the fault to addressing rather than to the app.
#
# Not part of ./verify-setup.sh on purpose. That runs on a cold machine before the app
# exists; this needs the app up, so it belongs beside the running stack.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

COMPOSE_FILE="docker-compose.workshop.yml"
PORT="${WORKSHOP_PORT:-5173}"
SHOTS="screenshots"

RED=$'\033[31m'; GREEN=$'\033[32m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
pass() { printf '   %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
fail() { printf '   %s✗%s %s\n' "$RED" "$RESET" "$1"; }

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

printf '\n%sTWO-VANTAGE APP CHECK%s\n' "$BOLD" "$RESET"
printf '   Does the agent see the same app you do?\n\n'

mkdir -p "$SHOTS"
rm -f "$SHOTS/verify-outside.png" "$SHOTS/verify-inside.png"

# ------------------------------------------------------------------ is it even up?
if ! compose ps --status running --services 2>/dev/null | grep -qx 'claude-container'; then
  fail "claude-container is not running"
  printf '\n   Start the stack first:  ./workshop/up.sh\n\n'
  exit 1
fi

# -------------------------------------------------------------------- outside view
printf '   %sOUTSIDE%s  a sibling container, over the compose network\n' "$BOLD" "$RESET"
OUT_LOG="$(compose --profile check run --rm -T verify-views 2>&1)"
OUT_RC=$?
if [ "$OUT_RC" -ne 0 ]; then
  fail "outside view failed"
  printf '%s\n' "$OUT_LOG" | sed 's/^/      /'
  printf '\n   The app is not reachable even from outside. This is the app being down,\n'
  printf '   not an addressing problem. Check: docker compose -f %s logs claude-container\n\n' "$COMPOSE_FILE"
  exit 1
fi
OUT_TITLE=$(printf '%s' "$OUT_LOG" | sed -n 's/^VIEW_TITLE=//p' | tail -1)
OUT_HEAD=$(printf '%s' "$OUT_LOG" | sed -n 's/^VIEW_HEADING=//p' | tail -1)
OUT_LINKS=$(printf '%s' "$OUT_LOG" | sed -n 's/^VIEW_LINKS=//p' | tail -1)
pass "verify-outside.png  \"${OUT_HEAD:-$OUT_TITLE}\""

# --------------------------------------------------------------------- inside view
#
# Runs where the agent runs, at the URL activity 3 hands the agent. VERIFY_REQUIRE_FROM
# points playwright resolution at the repo's own node_modules, because the script is
# mounted outside the repo tree so it never appears in an attendee's `git status`.
printf '   %sINSIDE%s   the workshop container, at the agent'"'"'s own URL\n' "$BOLD" "$RESET"
IN_LOG="$(compose exec -T \
  -e VERIFY_URL="http://localhost:${PORT}/" \
  -e VERIFY_OUT="/screenshots/verify-inside.png" \
  -e VERIFY_LABEL="inside" \
  -e VERIFY_REQUIRE_FROM="/workspace/repo/package.json" \
  claude-container node /usr/local/bin/app-views.mjs 2>&1)"
IN_RC=$?
if [ "$IN_RC" -ne 0 ]; then
  fail "inside view failed — the agent cannot see the app you can"
  printf '%s\n' "$IN_LOG" | sed 's/^/      /'
  cat <<EOF

   ${BOLD}The outside view passed and the inside view did not.${RESET}
   That is an ADDRESSING fault, not a broken app. The usual cause is localhost
   resolving to IPv6 only inside the container while Vite binds --host 0.0.0.0,
   which is IPv4 and only IPv4. Confirm it:

      docker compose -f $COMPOSE_FILE exec claude-container getent hosts localhost

   A ::1 line with no 127.0.0.1 line beside it is the bug. The fix is the
   extra_hosts entry on claude-container in $COMPOSE_FILE.

EOF
  exit 1
fi
IN_TITLE=$(printf '%s' "$IN_LOG" | sed -n 's/^VIEW_TITLE=//p' | tail -1)
IN_HEAD=$(printf '%s' "$IN_LOG" | sed -n 's/^VIEW_HEADING=//p' | tail -1)
IN_LINKS=$(printf '%s' "$IN_LOG" | sed -n 's/^VIEW_LINKS=//p' | tail -1)
pass "verify-inside.png   \"${IN_HEAD:-$IN_TITLE}\""

# ------------------------------------------------------------------------- compare
#
# Fingerprints, not pixels. Fonts, scrollbar width and animation timing all differ
# between two containers, so a pixel diff would go red for reasons nobody can act on.
# What must agree is that both views loaded the same application.
printf '\n   %sCOMPARE%s\n' "$BOLD" "$RESET"
MISMATCH=0
[ "$OUT_TITLE" = "$IN_TITLE" ] && pass "title matches" || { fail "title differs: outside=\"$OUT_TITLE\" inside=\"$IN_TITLE\""; MISMATCH=1; }
[ "$OUT_HEAD" = "$IN_HEAD" ]   && pass "heading matches" || { fail "heading differs: outside=\"$OUT_HEAD\" inside=\"$IN_HEAD\""; MISMATCH=1; }
[ "$OUT_LINKS" = "$IN_LINKS" ] && pass "link count matches ($OUT_LINKS)" || { fail "link count differs: outside=$OUT_LINKS inside=$IN_LINKS"; MISMATCH=1; }

if [ "$MISMATCH" -ne 0 ]; then
  cat <<EOF

   ${RED}Both views loaded, but they are not the same page.${RESET}
   Compare them yourself — they are side by side on your machine:

      $SHOTS/verify-outside.png
      $SHOTS/verify-inside.png

   A likely cause is the two vantage points reaching different API state: the
   client renders an empty shell when /v1 is unreachable, and an empty shell
   still counts as a page that loaded.

EOF
  exit 1
fi

cat <<EOF

   ${GREEN}${BOLD}BOTH VIEWS AGREE.${RESET} The agent sees the app you see.

      $SHOTS/verify-outside.png
      $SHOTS/verify-inside.png

EOF
