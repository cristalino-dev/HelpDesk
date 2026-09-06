#!/bin/bash
set -e

# Overridable so the same script runs from a laptop and from CI. Defaults are
# the values this has always used, so an existing local checkout is unaffected.
SERVER="${DEPLOY_HOST:-18.195.248.157}"
USER="${DEPLOY_USER:-ubuntu}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/home/ubuntu/helpdesk}"
LOCAL="$(cd "$(dirname "$0")" && pwd)"
KEY="${DEPLOY_KEY:-$LOCAL/../CrisRouter/alon.pem}"

if [ ! -f "$KEY" ]; then
  echo "Deploy key not found: $KEY" >&2
  echo "Set DEPLOY_KEY to its path, e.g. DEPLOY_KEY=/c/Users/you/alon.pem ./deploy.sh" >&2
  exit 1
fi

chmod 600 "$KEY"

# ── Read version from lib/version.ts ────────────────────────────────────────
# sed is used instead of grep -P because grep's Perl mode has locale issues
# on some platforms (e.g. Git Bash on Windows).
VERSION=$(sed -n 's/export const VERSION = "\(.*\)"/\1/p' "$LOCAL/lib/version.ts" | head -1)
echo "Deploying version $VERSION..."

# ── Generate maintenance.html locally (version baked in) ────────────────────
# Only shown during the short swap window (see below) — the build itself now
# happens while the old app is still serving, so downtime is seconds.
echo "Generating maintenance page (v$VERSION)..."
MAINT_TMP=$(mktemp /tmp/helpdesk-maintenance.XXXXXX.html)

# The page itself lives in scripts/maintenance.template.html, shared with
# deploy.ps1 so the two entry points cannot drift.
sed "s/{{VERSION}}/$VERSION/g" "$LOCAL/scripts/maintenance.template.html" > "$MAINT_TMP"

# ── Create tar archive ───────────────────────────────────────────────────────
echo "Archiving source files..."
TMPTAR=$(mktemp /tmp/helpdesk-src.XXXXXX.tar.gz)
# .env and .env.local are gitignored, so a CI checkout does not have them.
# When they are absent we simply do not ship them and the server keeps the
# copies it already holds — which is also why CI never needs the app's secrets,
# only the SSH key. From a local checkout they are present and ship as before.
ENV_FILES=()
if [ -f "$LOCAL/.env" ]; then ENV_FILES+=(.env); fi
if [ -f "$LOCAL/.env.local" ]; then ENV_FILES+=(.env.local); fi
if [ ${#ENV_FILES[@]} -eq 0 ]; then
  echo "  no local .env/.env.local — the server keeps its existing ones"
fi

tar -czf "$TMPTAR" \
  -C "$LOCAL" \
  app components lib prisma public scripts types auth.ts \
  package.json package-lock.json tsconfig.json \
  ${ENV_FILES[@]+"${ENV_FILES[@]}"} ecosystem.config.js next.config.ts \
  maintenance-server.js

SIZE=$(du -sh "$TMPTAR" | cut -f1)
echo "Archive: $SIZE — uploading..."

# ── Upload archive + maintenance page ────────────────────────────────────────
scp -i "$KEY" -o StrictHostKeyChecking=no "$TMPTAR" "$USER@$SERVER:/tmp/helpdesk-src.tar.gz"
scp -i "$KEY" -o StrictHostKeyChecking=no "$MAINT_TMP" "$USER@$SERVER:$REMOTE_DIR/maintenance.html"
rm "$TMPTAR" "$MAINT_TMP"

# ── Build (app still running) then swap (seconds of downtime) ────────────────
# The old app keeps serving from .next while the new build goes into
# .next-staging (see distDir in next.config.ts). Only after a SUCCESSFUL
# build do we stop the app, run migrations, swap the build dirs and restart.
# A failed build therefore leaves the live site completely untouched.
echo "Building on server (app keeps running)..."
# The server side lives in scripts/deploy-remote.sh, shared with deploy.ps1.
ssh -i "$KEY" -o StrictHostKeyChecking=no "$USER@$SERVER" bash < "$LOCAL/scripts/deploy-remote.sh"

echo ""
echo "Done! http://$SERVER:3000"
