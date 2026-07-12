#!/bin/bash
set -e

SERVER="18.195.248.157"
USER="ubuntu"
REMOTE_DIR="/home/ubuntu/helpdesk"
LOCAL="$(cd "$(dirname "$0")" && pwd)"
KEY="$LOCAL/../CrisRouter/alon.pem"

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

cat > "$MAINT_TMP" << MAINTHTML
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>מערכת Helpdesk — עדכון</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(150deg, #16181D 0%, #1C1F26 55%, #0E1013 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      direction: rtl;
    }
    .card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 24px;
      padding: 44px 40px 36px;
      max-width: 440px;
      width: 90%;
      text-align: center;
      box-shadow: 0 24px 64px rgba(0,0,0,0.45);
    }
    .logo-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      margin-bottom: 26px;
    }
    .logo-icon {
      width: 34px; height: 34px;
      background: rgba(116,197,58,0.15);
      border: 1px solid rgba(116,197,58,0.3);
      border-radius: 9px;
      display: flex; align-items: center; justify-content: center;
    }
    .logo-text { font-size: 1rem; font-weight: 700; letter-spacing: -0.01em; }
    .gear {
      font-size: 2.8rem;
      display: inline-block;
      animation: spin 6s linear infinite;
      margin-bottom: 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 10px; letter-spacing: -0.02em; }
    .sub {
      font-size: 0.88rem;
      color: rgba(255,255,255,0.62);
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(116,197,58,0.12);
      border: 1px solid rgba(116,197,58,0.3);
      border-radius: 100px;
      padding: 7px 18px;
      font-size: 0.84rem;
      font-weight: 600;
      margin-bottom: 30px;
      color: #A5DB78;
    }
    .dot {
      width: 7px; height: 7px;
      background: #74C53A;
      border-radius: 50%;
      flex-shrink: 0;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%,100% { opacity: 1; transform: scale(1); }
      50%      { opacity: 0.4; transform: scale(0.7); }
    }
    .progress-wrap {
      background: rgba(255,255,255,0.1);
      border-radius: 99px;
      height: 5px;
      overflow: hidden;
      margin-bottom: 13px;
    }
    .progress-bar {
      height: 100%;
      width: 0%;
      border-radius: 99px;
      background: #74C53A;
      transition: width 1s linear;
    }
    .timer { font-size: 0.81rem; color: rgba(255,255,255,0.52); }
    .timer b { color: rgba(255,255,255,0.88); font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-row">
      <div class="logo-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M9 12h6M9 16h4M5 20h14a2 2 0 002-2V7a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2v13a2 2 0 002 2z"
            stroke="#74C53A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="logo-text">מערכת Helpdesk</span>
    </div>

    <div class="gear">⚙️</div>
    <h1>המערכת בעדכון</h1>
    <p class="sub">מתבצעת החלפה לגרסה חדשה.<br>הדף יתרענן אוטומטית תוך שניות.</p>

    <div class="badge">
      <span class="dot"></span>
      מעדכן לגרסה $VERSION
    </div>

    <div class="progress-wrap">
      <div class="progress-bar" id="pb"></div>
    </div>
    <p class="timer">מתרענן בעוד <b id="cd">15</b> שניות</p>
  </div>

  <script>
    // The swap window is seconds long — retry quickly and keep retrying.
    var TOTAL = 15;
    var n = TOTAL;
    var url = window.location.href;
    function tick() {
      n--;
      document.getElementById('cd').textContent = n;
      document.getElementById('pb').style.width = ((TOTAL - n) / TOTAL * 100) + '%';
      if (n <= 0) {
        window.location.replace(url);
      } else {
        setTimeout(tick, 1000);
      }
    }
    setTimeout(tick, 1000);
  </script>
</body>
</html>
MAINTHTML

# ── Create tar archive ───────────────────────────────────────────────────────
echo "Archiving source files..."
TMPTAR=$(mktemp /tmp/helpdesk-src.XXXXXX.tar.gz)
tar -czf "$TMPTAR" \
  -C "$LOCAL" \
  app components lib prisma public scripts types auth.ts \
  package.json package-lock.json tsconfig.json \
  .env .env.local ecosystem.config.js next.config.ts \
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
ssh -i "$KEY" -o StrictHostKeyChecking=no "$USER@$SERVER" bash << 'ENDSSH'
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
ENDSSH

echo ""
echo "Done! http://$SERVER:3000"
