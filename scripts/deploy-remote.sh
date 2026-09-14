#!/bin/bash
# scripts/deploy-remote.sh — the server side of a deploy.
#
# Piped to `bash` over ssh by deploy.sh and deploy.ps1. It lives in its own
# file so those two entry points cannot drift apart: refresh source, install
# deps and regenerate the Prisma client only when their inputs changed, build
# into .next-staging while the old app keeps serving, then stop, migrate, swap
# and restart. A failed build leaves the live site untouched.
#
# Not run directly — it assumes it is executing on the server, in the app dir.

  set -e
  cd /home/ubuntu/helpdesk

  # ── Refresh source (runtime only reads .next/node_modules/public) ──────────
  # Removing app/, components/ etc. under a running `next start` is safe —
  # they are build-time inputs. .next is NOT touched here.
  rm -rf app components lib types scripts prisma
  tar -xzf /tmp/helpdesk-src.tar.gz -C /home/ubuntu/helpdesk
  rm /tmp/helpdesk-src.tar.gz

  # ── Dependencies: skip npm install when package-lock.json is unchanged ──────
  echo "Checking dependencies..."
  LOCK_HASH=$(md5sum package-lock.json | cut -d' ' -f1)
  if [ "$LOCK_HASH" = "$(cat .deploy-lock-hash 2>/dev/null)" ] && [ -d node_modules ]; then
    echo "  package-lock.json unchanged — skipping npm install"
  else
    echo "  Installing dependencies..."
    npm install --no-audit --no-fund 2>&1 | tail -3
    echo "$LOCK_HASH" > .deploy-lock-hash
  fi

  # ── Prisma client: regenerate only when the schema changed ──────────────────
  SCHEMA_HASH=$(md5sum prisma/schema.prisma | cut -d' ' -f1)
  if [ "$SCHEMA_HASH" = "$(cat .deploy-schema-hash 2>/dev/null)" ] && [ -d node_modules/.prisma/client ]; then
    echo "Prisma schema unchanged — skipping client generate"
  else
    echo "Generating Prisma client..."
    ./node_modules/.bin/prisma generate
    echo "$SCHEMA_HASH" > .deploy-schema-hash
  fi

  # ── Build into .next-staging while the old app keeps serving ────────────────
  echo "Building Next.js into .next-staging..."
  rm -rf .next-staging
  NEXT_DIST_DIR=.next-staging ./node_modules/.bin/next build

  # ── SWAP WINDOW — everything below is the only downtime ─────────────────────
  echo "Build OK — swapping (downtime starts now)..."
  pm2 stop helpdesk 2>/dev/null || true

  # Free port 3000 (orphaned maintenance server from a failed deploy, etc.)
  fuser -k 3000/tcp 2>/dev/null || true

  # Maintenance page for the few seconds of migration + swap
  MAINT_PID=""
  if [ -f maintenance-server.js ]; then
    node maintenance-server.js &
    MAINT_PID=$!
  fi

  echo "Running database migrations..."
  ./node_modules/.bin/prisma migrate deploy

  # Atomic-ish swap of the build output
  rm -rf .next
  mv .next-staging .next

  if [ -n "$MAINT_PID" ]; then
    kill "$MAINT_PID" 2>/dev/null || true
  fi

  echo "Starting app..."
  pm2 start ecosystem.config.js
  pm2 save
  echo "Swap done — downtime over."

  # ── Daily digest cron (09:00 Israel time) ────────────────────────────────
  echo "Setting up daily digest cron..."
  mkdir -p /home/ubuntu/helpdesk/logs

  # Write wrapper script that reads the secret at runtime
  cat > /home/ubuntu/helpdesk/send-digest.sh << 'CRONSCRIPT'
#!/bin/bash
# This box's cron runs on UTC and has no per-crontab timezone (no CRON_TZ in
# crontab(5)), so the entry fires at 06:00 AND 07:00 UTC and this lets exactly
# one of them through: whichever is 09:00 in Israel, on either side of DST.
[ "$(TZ=Asia/Jerusalem date +%H)" = "09" ] || exit 0
# Read DIGEST_SECRET from the deployed .env.local at runtime
SECRET=$(grep -E '^DIGEST_SECRET=' /home/ubuntu/helpdesk/.env.local 2>/dev/null \
  | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
if [ -z "$SECRET" ]; then
  echo "[digest] DIGEST_SECRET not set — skipping" >> /home/ubuntu/helpdesk/logs/digest.log
  exit 0
fi
RESULT=$(curl -sf -X POST "http://localhost:3000/api/admin/digest" \
  -H "x-digest-secret: ${SECRET}" \
  -H "Content-Type: application/json" 2>&1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ${RESULT}" >> /home/ubuntu/helpdesk/logs/digest.log
CRONSCRIPT
  chmod +x /home/ubuntu/helpdesk/send-digest.sh

  # ── Ticket urgency sweep cron (every 5 minutes) ─────────────────────────
  echo "Setting up ticket urgency sweep cron..."
  cat > /home/ubuntu/helpdesk/run-sweep.sh << 'SWEEPSCRIPT'
#!/bin/bash
# Read SWEEP_SECRET or fall back to DIGEST_SECRET from the deployed .env.local
SECRET=$(grep -E '^SWEEP_SECRET=' /home/ubuntu/helpdesk/.env.local 2>/dev/null \
  | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
if [ -z "$SECRET" ]; then
  SECRET=$(grep -E '^DIGEST_SECRET=' /home/ubuntu/helpdesk/.env.local 2>/dev/null \
    | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
fi
if [ -z "$SECRET" ]; then
  echo "[sweep] Neither SWEEP_SECRET nor DIGEST_SECRET is set — skipping" >> /home/ubuntu/helpdesk/logs/sweep.log
  exit 0
fi
RESULT=$(curl -sf -X POST "http://localhost:3000/api/admin/sweep" \
  -H "x-sweep-secret: ${SECRET}" \
  -H "Content-Type: application/json" 2>&1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ${RESULT}" >> /home/ubuntu/helpdesk/logs/sweep.log
SWEEPSCRIPT
  chmod +x /home/ubuntu/helpdesk/run-sweep.sh

  # ── Email-to-ticket ingestion cron (every 2 minutes) ────────────────────
  echo "Setting up email ingestion cron..."
  cat > /home/ubuntu/helpdesk/run-ingest.sh << 'INGESTSCRIPT'
#!/bin/bash
# Prevent overlapping runs (a slow IMAP scan must not let the next cron tick
# start a second concurrent ingestion — that was the v3.34 duplication cause).
exec 9>/home/ubuntu/helpdesk/.ingest.lock
flock -n 9 || { echo "[$(date '+%Y-%m-%d %H:%M:%S')] previous run still active — skipping" >> /home/ubuntu/helpdesk/logs/ingest.log; exit 0; }
# Read INGEST_SECRET or fall back to DIGEST_SECRET from the deployed .env.local
SECRET=$(grep -E '^INGEST_SECRET=' /home/ubuntu/helpdesk/.env.local 2>/dev/null \
  | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
if [ -z "$SECRET" ]; then
  SECRET=$(grep -E '^DIGEST_SECRET=' /home/ubuntu/helpdesk/.env.local 2>/dev/null \
    | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs)
fi
if [ -z "$SECRET" ]; then
  echo "[ingest] Neither INGEST_SECRET nor DIGEST_SECRET is set — skipping" >> /home/ubuntu/helpdesk/logs/ingest.log
  exit 0
fi
RESULT=$(curl -sf -X POST "http://localhost:3000/api/admin/ingest-mail" \
  -H "x-ingest-secret: ${SECRET}" \
  -H "Content-Type: application/json" 2>&1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ${RESULT}" >> /home/ubuntu/helpdesk/logs/ingest.log
INGESTSCRIPT
  chmod +x /home/ubuntu/helpdesk/run-ingest.sh

  # Install cron entries (idempotent — removes old entries then re-adds).
  #
  # The `|| true` is load-bearing. This script runs under `set -e`, which the
  # ( … ) subshell inherits. On an EMPTY crontab the grep has nothing to print
  # and exits 1; set -e then killed the subshell before its echo lines ran, and
  # `crontab -` installed an empty crontab — while the pipeline's own status
  # (crontab's 0) let the script carry on and announce success. Once empty,
  # every deploy wrote it empty again: until v3.82 no digest, sweep or ingest
  # had run on this server at all.
  #
  # The digest line used to read "TZ=Asia/Jerusalem 0 9 * * * …", which cron
  # parses as an environment assignment, not a job. See send-digest.sh above.
  ( { crontab -l 2>/dev/null | grep -v -e "send-digest.sh" -e "run-sweep.sh" -e "run-ingest.sh" || true; }
    echo "0 6,7 * * * /home/ubuntu/helpdesk/send-digest.sh"
    echo "*/5 * * * * /home/ubuntu/helpdesk/run-sweep.sh"
    echo "*/2 * * * * /home/ubuntu/helpdesk/run-ingest.sh" ) | crontab -

  # Verify rather than announce — announcing is what hid this for months. A
  # missing entry is reported loudly but does not fail the deploy: the app has
  # already been swapped in and is serving.
  CRON_OK=1
  for job in send-digest.sh run-sweep.sh run-ingest.sh; do
    crontab -l 2>/dev/null | grep -q "$job" || { echo "ERROR: cron entry for $job is missing after install" >&2; CRON_OK=0; }
  done
  [ "$CRON_OK" = 1 ] && echo "Digest, Sweep & Ingest crons installed (verified)"

  # Entries do nothing without the daemon, and it was found stopped (dead since
  # a restart on 2026-08-29). Starting a system service is not this script's
  # decision to make, so it says so instead of guessing.
  if ! systemctl is-active --quiet cron; then
    echo "WARNING: the cron daemon is NOT running — digest, sweep and ingest will not fire."
    echo "         Start it with:  sudo systemctl start cron"
  fi

  # ── nginx body limit (v3.84) ─────────────────────────────────────────────
  # The helpdesk site is configured by hand on the server, not from this repo,
  # and attachments travel as base64 JSON: a 7 MB file is a ~9.4 MB request.
  # On nginx's 1 MB default every upload over ~750 KB is refused before the app
  # sees it, which is what happened on 2026-08-23. Say so rather than guess.
  NGINX_SITE=$(grep -l "server_name helpdesk.cristalino.co.il" /etc/nginx/sites-enabled/* 2>/dev/null | head -1 || true)
  if [ -n "$NGINX_SITE" ] && ! grep -q "client_max_body_size" "$NGINX_SITE"; then
    echo "WARNING: $NGINX_SITE has no client_max_body_size — uploads over ~750 KB will fail."
    echo "         Add 'client_max_body_size 10m;' to the helpdesk server block, then:"
    echo "         sudo nginx -t && sudo systemctl reload nginx"
  fi

  # ── Health check: wait for the app to actually answer ───────────────────
  echo ""
  echo "Waiting for app to come up..."
  for i in $(seq 1 30); do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login 2>/dev/null || echo 000)
    if [ "$CODE" = "200" ]; then
      echo "Health check OK (HTTP 200 after ${i}s)"
      break
    fi
    if [ "$i" = "30" ]; then
      echo "WARNING: app did not answer with 200 within 30s (last: $CODE)"
      exit 1
    fi
    sleep 1
  done
