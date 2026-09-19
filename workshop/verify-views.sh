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

# BY IP, NOT BY SERVICE NAME.
#
# Vite 6 checks the Host header against server.allowedHosts and answers anything it
# does not recognise with 403 Blocked request. `http://claude-container:5173/` is
# exactly that case — the browser sends Host: claude-container, which is not in the
# list, so the check failed against a perfectly healthy app.
#
# An IP literal is allowed by default, so resolving the container's address keeps this
# vantage genuinely OUTSIDE (a different container, over the network) without having
# to weaken allowedHosts in the app — which lives in app/ and is rewound by
# ./checkpoint.sh, so it could not carry the setting anyway.
CID="$(compose ps -q claude-container 2>/dev/null)"
APP_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$CID" 2>/dev/null)"
if [ -z "${APP_IP:-}" ]; then
  fail "could not resolve claude-container's address on the compose network"
  printf '\n   docker inspect returned nothing for container: %s\n\n' "${CID:-<none>}"
  exit 1
fi

OUT_LOG="$(compose --profile check run --rm -T \
  -e VERIFY_URL="http://${APP_IP}:${PORT}/" \
  verify-views 2>&1)"
OUT_RC=$?
if [ "$OUT_RC" -ne 0 ]; then
  fail "outside view failed"
  printf '%s\n' "$OUT_LOG" | sed 's/^/      /'
  printf '\n   Outside is the vantage least likely to be an addressing fault, so this\n'
  printf '   usually is the app itself. Unless the error above says 403 — that is\n'
  printf '   Vite refusing the Host header, and the app is fine.\n\n'
  printf '   Check: docker compose -f %s logs claude-container\n\n' "$COMPOSE_FILE"
  exit 1
fi
OUT_TITLE=$(printf '%s' "$OUT_LOG" | sed -n 's/^VIEW_TITLE=//p' | tail -1)
OUT_HEAD=$(printf '%s' "$OUT_LOG" | sed -n 's/^VIEW_HEADING=//p' | tail -1)
OUT_LINKS=$(printf '%s' "$OUT_LOG" | sed -n 's/^VIEW_LINKS=//p' | tail -1)
pass "verify-outside.png  \"${OUT_HEAD:-$OUT_TITLE}\""

# --------------------------------------------------------------------- inside view
#
# Runs where the agent runs, at the URL activity 3 hands the agent, driving the same
# browser the agent drives — app-views.mjs prefers @playwright/mcp's playwright-core,
# which is the copy app/autonomous/Dockerfile downloads a chromium for. No module path
# is passed: the repo's own playwright is a different build with no browser installed,
# so naming it here would break the check rather than help it.
printf '   %sINSIDE%s   the workshop container, at the agent'"'"'s own URL\n' "$BOLD" "$RESET"

# IS THE CHECKER EVEN IN THERE?
#
# app-views.mjs reaches the container through a bind mount, and a bind mount added to
# the compose file does not appear in a container that was created before it. The
# symptom is node exiting 1 with MODULE_NOT_FOUND — the same exit code a genuine
# navigation failure produces, which is how the first version of this script came to
# blame IPv6 for a missing file. Ask the question directly instead of inferring it.
if ! compose exec -T claude-container test -f /usr/local/bin/app-views.mjs 2>/dev/null; then
  fail "the view checker is not mounted in claude-container"
  cat <<EOF

   This container was created before the mount was added to $COMPOSE_FILE, and
   bind mounts are fixed at creation. Recreate it — no rebuild, and your work in
   app/ is untouched because it lives on the host:

      docker compose -f $COMPOSE_FILE up -d --force-recreate claude-container

   Then run this again.

EOF
  exit 1
fi

IN_LOG="$(compose exec -T \
  -e VERIFY_URL="http://localhost:${PORT}/" \
  -e VERIFY_OUT="/screenshots/verify-inside.png" \
  -e VERIFY_LABEL="inside" \
  claude-container node /usr/local/bin/app-views.mjs 2>&1)"
IN_RC=$?
if [ "$IN_RC" -ne 0 ]; then
  fail "inside view failed — the agent cannot see the app you can"
  printf '%s\n' "$IN_LOG" | sed 's/^/      /'

  # Only the reporter's own FAIL line proves the page could not be loaded. Anything
  # else — node not starting, playwright not resolving — is the check being broken,
  # not the app being unreachable, and saying otherwise sends the reader after a
  # fault that is not there.
  if [ "$IN_RC" -eq 2 ] || ! printf '%s' "$IN_LOG" | grep -q '^FAIL inside'; then
    cat <<EOF

   ${BOLD}The checker did not run.${RESET} That is this script being broken, not the
   app being unreachable — the error above is from node, before any browser
   opened. Nothing is proven about the app either way.

EOF
    exit 1
  fi

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
