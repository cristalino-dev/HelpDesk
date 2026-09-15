#!/bin/bash
# deploy-test.sh -- deploy this checkout to the TESTING environment (the dev
# copy), then check it. The PowerShell twin is deploy-test.ps1.
#
# The testing environment is the dev copy of the helpdesk: the same server as
# production, but its own directory, pm2 app, port and database (helpdesk_dev,
# a copy of production's data), and mail only ever to MAIL_REDIRECT_TO.
# Address: https://dev-helpdesk.cristalino.co.il. This script cannot deploy
# production.
#
# In order: say what will ship (branch, commit, uncommitted changes -- the
# working tree is what deploys); run the tests, which the server build does
# not; deploy with `deploy.sh dev`; ask the testing environment which version
# it runs (GET /api/v1) and fail unless it is this checkout's lib/version.ts.
#
# The key, as for deploy.sh: DEPLOY_KEY, else ../CrisRouter/alon.pem.
set -eo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DOMAIN=dev-helpdesk.cristalino.co.il
SERVER="${DEPLOY_HOST:-18.195.248.157}"
SKIP_TESTS=0
CHECK_ONLY=0

usage() {
  cat <<'EOF'
Deploy this checkout to the testing environment (the dev copy), then check it.

  bash deploy-test.sh               run the tests, deploy, check the version
  bash deploy-test.sh --skip-tests  deploy without running the tests first
  bash deploy-test.sh --check-only  deploy nothing; report the running version
EOF
}

for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=1 ;;
    --check-only) CHECK_ONLY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 1 ;;
  esac
done

step() { printf '\n== %s\n' "$1"; }
fail() { echo "$1" >&2; exit 1; }

VERSION=$(sed -n 's/export const VERSION = "\(.*\)"/\1/p' "$ROOT/lib/version.ts" | head -1)
[ -n "$VERSION" ] || fail "Could not read VERSION from $ROOT/lib/version.ts."

# Which version the testing environment runs, and how it was reached: the real
# address first, then the server's IP with the dev host name, for as long as
# DNS has no record for it. GET /api/v1 answers {"appVersion": ...} (v3.89).
# Sets RUNNING and VIA; returns non-zero when neither answers with a version.
RUNNING=""
VIA=""
app_version() { sed -n 's/.*"appVersion":"\([^"]*\)".*/\1/p'; }
probe() {
  RUNNING=$(curl -s -m 10 -H "Accept: application/json" "https://$DOMAIN/api/v1" 2>/dev/null | app_version || true)
  if [ -n "$RUNNING" ]; then VIA="https://$DOMAIN"; return 0; fi
  RUNNING=$(curl -s -m 10 -H "Accept: application/json" -H "Host: $DOMAIN" "http://$SERVER/api/v1" 2>/dev/null | app_version || true)
  if [ -n "$RUNNING" ]; then VIA="http://$SERVER with Host: $DOMAIN (no DNS record yet)"; return 0; fi
  return 1
}

echo "Testing environment: https://$DOMAIN (the dev copy - never production)"

if [ "$CHECK_ONLY" = 1 ]; then
  probe || fail "The testing environment did not answer with a version."
  echo "It runs version $RUNNING - reached via $VIA"
  if [ "$RUNNING" != "$VERSION" ]; then echo "This checkout is version $VERSION."; fi
  exit 0
fi

# -- 1. What will ship ----------------------------------------------------------
BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
COMMIT=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || true)
DIRTY=$( (git -C "$ROOT" status --porcelain 2>/dev/null || true) | wc -l | tr -d ' ')
if [ -n "$BRANCH" ]; then echo "Shipping: $BRANCH @ $COMMIT, version $VERSION"; else echo "Shipping: version $VERSION"; fi
if [ "$DIRTY" -gt 0 ]; then echo "  including $DIRTY uncommitted change(s) - the working tree is what deploys"; fi

# -- 2. Tests: the server build does not run them -------------------------------
if [ "$SKIP_TESTS" = 1 ]; then
  echo "  --skip-tests: not running the tests"
else
  step "Tests (npx jest --ci) - the server build does not run them"
  (cd "$ROOT" && npx jest --ci) || fail "The tests failed - nothing was deployed."
fi

# -- 3. Deploy --------------------------------------------------------------------
step "Deploy (deploy.sh dev)"
bash "$ROOT/deploy.sh" dev

# -- 4. Check ---------------------------------------------------------------------
step "Check: does the testing environment run $VERSION?"
for attempt in 1 2 3 4 5 6; do
  if probe && [ "$RUNNING" = "$VERSION" ]; then break; fi
  if [ "$attempt" -lt 6 ]; then sleep 5; fi
done
[ -n "$RUNNING" ] || fail "Deployed, but the testing environment did not answer with a version."
[ "$RUNNING" = "$VERSION" ] || fail "Deployed, but the testing environment runs $RUNNING, not $VERSION."

echo "The testing environment runs version $VERSION - reached via $VIA. Took ${SECONDS}s."
case "$VIA" in
  https://*) ;;
  *) echo "No DNS record for $DOMAIN yet. To open it in a browser, map it to $SERVER in your hosts file and use http://." ;;
esac
