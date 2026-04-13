#!/bin/bash
set -e

SERVER="18.195.248.157"
USER="ubuntu"
KEY="$HOME/Downloads/alon.pem"
REMOTE_DIR="/home/ubuntu/helpdesk"
LOCAL="$(cd "$(dirname "$0")" && pwd)"

chmod 600 "$KEY"

# Read version
VERSION=$(grep 'APP_VERSION' "$LOCAL/lib/version.ts" | grep -oP '"[^"]+"' | tr -d '"')
echo "Deploying version $VERSION..."

# Create tar archive
echo "Archiving source files..."
TMPTAR=$(mktemp /tmp/helpdesk-src.XXXXXX.tar.gz)
tar -czf "$TMPTAR" \
  -C "$LOCAL" \
  app components lib prisma public types auth.ts \
  package.json package-lock.json tsconfig.json \
  .env .env.local ecosystem.config.js next.config.ts

SIZE=$(du -sh "$TMPTAR" | cut -f1)
echo "Archive: $SIZE — uploading..."

# Upload
scp -i "$KEY" -o StrictHostKeyChecking=no "$TMPTAR" "$USER@$SERVER:/tmp/helpdesk-src.tar.gz"
rm "$TMPTAR"

# Build and restart on server
echo "Building on server..."
ssh -i "$KEY" -o StrictHostKeyChecking=no "$USER@$SERVER" bash << 'ENDSSH'
  set -e

  # Stop app
  pm2 stop helpdesk 2>/dev/null || true

  # Clear old source
  rm -rf /home/ubuntu/helpdesk/app \
         /home/ubuntu/helpdesk/components \
         /home/ubuntu/helpdesk/lib \
         /home/ubuntu/helpdesk/types \
         /home/ubuntu/helpdesk/.next

  # Extract
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

  echo "Starting app..."
  pm2 start ecosystem.config.js
  pm2 save

  echo ""
  echo "=== Port 3000 ==="
  ss -tlnp | grep :3000 || echo "Not yet listening"
ENDSSH

echo ""
echo "Done! http://$SERVER.nip.io:3000"
