#!/bin/bash
set -e

# Which copy to deploy (v3.86): production by default, or the dev copy on the
# same server with `bash deploy.sh dev` (or DEPLOY_TARGET=dev).
TARGET="${1:-${DEPLOY_TARGET:-prod}}"
case "$TARGET" in
  prod|production)
    TARGET=prod
    DEFAULT_DIR=/home/ubuntu/helpdesk
    APP_NAME=helpdesk
    APP_PORT="${DEPLOY_PORT:-3000}"
    APP_DOMAIN=helpdesk.cristalino.co.il
    ;;
  dev)
    DEFAULT_DIR=/home/ubuntu/helpdesk-dev
    APP_NAME=helpdesk-dev
    APP_PORT="${DEPLOY_PORT:-3100}"
    APP_DOMAIN=dev-helpdesk.cristalino.co.il
    ;;
  *)
    echo "Unknown target: $TARGET (use prod or dev)" >&2
    exit 1
    ;;
esac

# Overridable so the same script runs from a laptop and from CI. Defaults are
# the values this has always used, so an existing local checkout is unaffected.
SERVER="${DEPLOY_HOST:-18.195.248.157}"
USER="${DEPLOY_USER:-ubuntu}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-$DEFAULT_DIR}"
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
echo "Deploying version $VERSION to $TARGET ($APP_DOMAIN)..."

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
#
# Never to the dev copy (v3.86): a laptop's .env points at the PRODUCTION
# database, and shipped to dev it would make dev write to production. The dev
# copy keeps the env files scripts/setup-dev.sh wrote on the server.
ENV_FILES=()
if [ "$TARGET" = dev ]; then
  echo "  dev target: .env files are not shipped — the dev copy keeps its own"
else
  if [ -f "$LOCAL/.env" ]; then ENV_FILES+=(.env); fi
  if [ -f "$LOCAL/.env.local" ]; then ENV_FILES+=(.env.local); fi
  if [ ${#ENV_FILES[@]} -eq 0 ]; then
    echo "  no local .env/.env.local — the server keeps its existing ones"
  fi
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
scp -i "$KEY" -o StrictHostKeyChecking=no "$TMPTAR" "$USER@$SERVER:/tmp/$APP_NAME-src.tar.gz"
scp -i "$KEY" -o StrictHostKeyChecking=no "$MAINT_TMP" "$USER@$SERVER:$REMOTE_DIR/maintenance.html"
rm "$TMPTAR" "$MAINT_TMP"

# ── Build (app still running) then swap (seconds of downtime) ────────────────
# The old app keeps serving from .next while the new build goes into
# .next-staging (see distDir in next.config.ts). Only after a SUCCESSFUL
# build do we stop the app, run migrations, swap the build dirs and restart.
# A failed build therefore leaves the live site completely untouched.
echo "Building on server (app keeps running)..."
# The server side lives in scripts/deploy-remote.sh, shared with deploy.ps1.
# The lines in front of it tell it which copy it is deploying.
{
  printf "APP_DIR='%s'\nAPP_NAME='%s'\nAPP_PORT='%s'\nAPP_DOMAIN='%s'\nDEPLOY_TARGET='%s'\n" \
    "$REMOTE_DIR" "$APP_NAME" "$APP_PORT" "$APP_DOMAIN" "$TARGET"
  cat "$LOCAL/scripts/deploy-remote.sh"
} | ssh -i "$KEY" -o StrictHostKeyChecking=no "$USER@$SERVER" bash

echo ""
echo "Done! https://$APP_DOMAIN (port $APP_PORT on $SERVER)"
