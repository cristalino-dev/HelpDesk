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

  # Install cron entries (idempotent — removes old entries then re-adds)
  (crontab -l 2>/dev/null | grep -v "send-digest.sh" | grep -v "run-sweep.sh" | grep -v "run-ingest.sh"; \
   echo "TZ=Asia/Jerusalem 0 9 * * * /home/ubuntu/helpdesk/send-digest.sh"; \
   echo "*/5 * * * * /home/ubuntu/helpdesk/run-sweep.sh"; \
   echo "*/2 * * * * /home/ubuntu/helpdesk/run-ingest.sh") | crontab -
  echo "Digest, Sweep & Ingest crons installed"

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
