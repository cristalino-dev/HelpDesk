#!/bin/bash
set -e

SERVER="18.195.248.157"
USER="ubuntu"
KEY="$HOME/Downloads/alon.pem"
REMOTE_DIR="/home/ubuntu/helpdesk"
LOCAL="$(cd "$(dirname "$0")" && pwd)"

chmod 600 "$KEY"

# ── Read version from lib/version.ts ────────────────────────────────────────
VERSION=$(grep -oP '"[0-9]+\.[0-9]+"' "$LOCAL/lib/version.ts" | head -1 | tr -d '"')
echo "Deploying version $VERSION..."

# ── Generate maintenance.html locally (version baked in) ────────────────────
# Uploaded to the server BEFORE the build starts so the maintenance server
# can serve it immediately after pm2 is stopped.
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      direction: rtl;
    }
    .card {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 24px;
      padding: 44px 40px 36px;
      max-width: 440px;
      width: 90%;
      text-align: center;
      box-shadow: 0 24px 64px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.15);
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
      background: rgba(255,255,255,0.15);
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
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 100px;
      padding: 7px 18px;
      font-size: 0.84rem;
      font-weight: 600;
      margin-bottom: 30px;
      color: rgba(255,255,255,0.9);
    }
    .dot {
      width: 7px; height: 7px;
      background: #34d399;
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
      background: linear-gradient(90deg, #60a5fa 0%, #a78bfa 100%);
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
            stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="logo-text">מערכת Helpdesk</span>
    </div>

    <div class="gear">⚙️</div>
    <h1>המערכת בעדכון</h1>
    <p class="sub">מתבצעת התקנה של גרסה חדשה.<br>הדף יתרענן אוטומטית ויחזור לעמוד המבוקש.</p>

    <div class="badge">
      <span class="dot"></span>
      מעדכן לגרסה $VERSION
    </div>

    <div class="progress-wrap">
      <div class="progress-bar" id="pb"></div>
    </div>
    <p class="timer">מתרענן בעוד <b id="cd">120</b> שניות</p>
  </div>

  <script>
    var n = 120;
    var url = window.location.href;
    function tick() {
      n--;
      document.getElementById('cd').textContent = n;
      document.getElementById('pb').style.width = ((120 - n) / 120 * 100) + '%';
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
  app components lib prisma public types auth.ts \
  package.json package-lock.json tsconfig.json \
  .env .env.local ecosystem.config.js next.config.ts \
  maintenance-server.js

SIZE=$(du -sh "$TMPTAR" | cut -f1)
echo "Archive: $SIZE — uploading..."

# ── Upload archive + maintenance page ────────────────────────────────────────
scp -i "$KEY" -o StrictHostKeyChecking=no "$TMPTAR" "$USER@$SERVER:/tmp/helpdesk-src.tar.gz"
scp -i "$KEY" -o StrictHostKeyChecking=no "$MAINT_TMP" "$USER@$SERVER:$REMOTE_DIR/maintenance.html"
rm "$TMPTAR" "$MAINT_TMP"

# ── Build and restart on server ──────────────────────────────────────────────
echo "Building on server..."
ssh -i "$KEY" -o StrictHostKeyChecking=no "$USER@$SERVER" bash << 'ENDSSH'
  set -e

  # Stop app
  pm2 stop helpdesk 2>/dev/null || true
  sleep 2

  # Start maintenance server if it exists from a previous deploy.
  # It reads /home/ubuntu/helpdesk/maintenance.html (already uploaded above)
  # on every request so the version badge is correct immediately.
  MAINT_PID=""
  if [ -f /home/ubuntu/helpdesk/maintenance-server.js ]; then
    node /home/ubuntu/helpdesk/maintenance-server.js &
    MAINT_PID=$!
    echo "Maintenance server started on port 3000 (PID $MAINT_PID)"
  else
    echo "No maintenance-server.js found — skipping maintenance page (first deploy?)"
  fi

  # Clear old source (maintenance.html and maintenance-server.js are NOT removed)
  rm -rf /home/ubuntu/helpdesk/app \
         /home/ubuntu/helpdesk/components \
         /home/ubuntu/helpdesk/lib \
         /home/ubuntu/helpdesk/types \
         /home/ubuntu/helpdesk/.next

  # Extract new source
  mkdir -p /home/ubuntu/helpdesk
  tar -xzf /tmp/helpdesk-src.tar.gz -C /home/ubuntu/helpdesk
  rm /tmp/helpdesk-src.tar.gz

  cd /home/ubuntu/helpdesk

  echo "Installing dependencies..."
  npm install 2>&1 | tail -3

  echo "Running database migrations..."
  npx prisma migrate deploy

  echo "Generating Prisma client..."
  npx prisma generate

  echo "Building Next.js..."
  npx next build

  # Stop maintenance server before handing port 3000 back to pm2
  if [ -n "$MAINT_PID" ]; then
    kill "$MAINT_PID" 2>/dev/null || true
    sleep 1
    echo "Maintenance server stopped"
  fi

  echo "Starting app..."
  pm2 start ecosystem.config.js
  pm2 save

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

  # Install cron entry (idempotent — removes old entry then re-adds)
  (crontab -l 2>/dev/null | grep -v "send-digest.sh"; \
   echo "TZ=Asia/Jerusalem 0 9 * * * /home/ubuntu/helpdesk/send-digest.sh") | crontab -
  echo "Digest cron installed: 09:00 Israel time daily"

  echo ""
  echo "=== Port 3000 ==="
  ss -tlnp | grep :3000 || echo "Not yet listening"
ENDSSH

echo ""
echo "Done! http://$SERVER:3000"
