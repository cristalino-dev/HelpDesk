#!/bin/bash
# scripts/setup-dev.sh — one-time setup of the dev copy on the server (v3.86).
#
# Run from a checkout, once, AFTER the dev database exists
# (python scripts/create-dev-db.py) and BEFORE the first `bash deploy.sh dev`:
#
#   DEV_DATABASE_URL='postgresql://helpdesk_dev:…@<host>:5432/helpdesk_dev?sslmode=require' \
#   MAIL_REDIRECT_TO='you@cristalino.co.il' \
#   DEPLOY_KEY=… bash scripts/setup-dev.sh
#
# (create-dev-db.py writes DEV_DATABASE_URL into .env.dev; `set -a; . ./.env.dev; set +a` loads it.)
#
# On the server it:
#   • refuses if the dev port is already taken — other apps run on this box;
#   • makes /home/ubuntu/helpdesk-dev with logs/ and uploads/;
#   • writes the dev copy's env files from production's, with its own database,
#     its own URLs and secrets, mail redirected to MAIL_REDIRECT_TO, and the DEV
#     switch on (NEXT_PUBLIC_APP_ENV=dev). Existing dev env files are left alone;
#   • adds an nginx site for dev-helpdesk.cristalino.co.il → 127.0.0.1:<port>,
#     with the 10 MB body limit uploads need.
# It never writes to production's directory or production's nginx site.
#
# The certificate comes after DNS points at the server:
#   sudo certbot --nginx -d dev-helpdesk.cristalino.co.il

set -e
LOCAL="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="${DEPLOY_HOST:-18.195.248.157}"
USER="${DEPLOY_USER:-ubuntu}"
KEY="${DEPLOY_KEY:-$LOCAL/../CrisRouter/alon.pem}"
PORT="${DEPLOY_PORT:-3100}"

# DEV_DATABASE_URL: from the environment, or from .env.dev, where
# scripts/create-dev-db.py writes it — so the secret never has to be typed.
if [ -z "$DEV_DATABASE_URL" ] && [ -f "$LOCAL/.env.dev" ]; then
  DEV_DATABASE_URL=$(sed -n 's/^DEV_DATABASE_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$LOCAL/.env.dev" | head -1)
fi
: "${DEV_DATABASE_URL:?set DEV_DATABASE_URL to the dev database connection string (or run scripts/create-dev-db.py)}"
: "${MAIL_REDIRECT_TO:?set MAIL_REDIRECT_TO to the one address the dev copy may mail}"
case "$DEV_DATABASE_URL" in
  */helpdesk_dev|*/helpdesk_dev\?*) ;;
  *) echo "DEV_DATABASE_URL does not name the helpdesk_dev database — refusing." >&2; exit 1 ;;
esac

# The values travel on ssh's stdin, never on a command line.
{
  printf "DEV_DATABASE_URL='%s'\nMAIL_REDIRECT_TO='%s'\nPORT='%s'\n" "$DEV_DATABASE_URL" "$MAIL_REDIRECT_TO" "$PORT"
  sed -n '/^# ---- remote part ----$/,$p' "$0"
} | ssh -i "$KEY" -o StrictHostKeyChecking=no "$USER@$SERVER" bash
exit 0

# ---- remote part ----
set -e
PROD=/home/ubuntu/helpdesk
DEV=/home/ubuntu/helpdesk-dev
DOMAIN=dev-helpdesk.cristalino.co.il

if ss -ltn | grep -q ":$PORT "; then
  echo "Port $PORT is already in use on this server. Pick another with DEPLOY_PORT (and use it for deploy.sh dev too)." >&2
  exit 1
fi

mkdir -p "$DEV/logs" "$DEV/uploads"

# ── Env files: production's, minus what must differ ─────────────────────────
DIFFERS='^(DATABASE_URL|NEXTAUTH_URL|AUTH_URL|NEXT_PUBLIC_APP_URL|AUTH_SECRET|AUTOMATION_API_KEY|NEXT_PUBLIC_APP_ENV|MAIL_REDIRECT_TO|INGEST_ENABLED|INGEST_SECRET)='
if [ -f "$DEV/.env" ] || [ -f "$DEV/.env.local" ]; then
  echo "Dev env files already exist — left as they are."
else
  touch "$DEV/.env" "$DEV/.env.local"
  [ -f "$PROD/.env" ] && grep -v -E "$DIFFERS" "$PROD/.env" > "$DEV/.env" || true
  [ -f "$PROD/.env.local" ] && grep -v -E "$DIFFERS" "$PROD/.env.local" > "$DEV/.env.local" || true
  # DATABASE_URL goes in .env: the Prisma CLI (migrate deploy) reads only that file.
  {
    echo ""
    echo "# ── dev copy (v3.86), written by scripts/setup-dev.sh ──"
    echo "DATABASE_URL=\"$DEV_DATABASE_URL\""
  } >> "$DEV/.env"
  {
    echo ""
    echo "# ── dev copy (v3.86), written by scripts/setup-dev.sh ──"
    echo "NEXT_PUBLIC_APP_ENV=dev"
    echo "MAIL_REDIRECT_TO=$MAIL_REDIRECT_TO"
    echo "NEXTAUTH_URL=https://$DOMAIN"
    echo "NEXT_PUBLIC_APP_URL=https://$DOMAIN"
    echo "AUTH_SECRET=$(openssl rand -base64 32)"
    echo "AUTOMATION_API_KEY=$(openssl rand -hex 24)"
  } >> "$DEV/.env.local"
  chmod 600 "$DEV/.env" "$DEV/.env.local"
  echo "Dev env files written (database, URLs and secrets are the dev copy's own)."
fi

# ── nginx site ──────────────────────────────────────────────────────────────
SITE=/etc/nginx/sites-available/helpdesk-dev
if [ -f "$SITE" ]; then
  echo "nginx site $SITE already exists — left as it is."
else
  sudo tee "$SITE" > /dev/null <<NGINX
# dev-helpdesk.cristalino.co.il — the dev copy of the helpdesk (v3.86).
# Written by scripts/setup-dev.sh. certbot adds the 443 server block.
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
  sudo ln -sf "$SITE" /etc/nginx/sites-enabled/helpdesk-dev
  sudo nginx -t
  sudo systemctl reload nginx
  echo "nginx site added for $DOMAIN → 127.0.0.1:$PORT."
fi

echo ""
echo "Next: bash deploy.sh dev   — then:  python scripts/refresh-dev-db.py"
echo "Once DNS resolves:  sudo certbot --nginx -d $DOMAIN"
