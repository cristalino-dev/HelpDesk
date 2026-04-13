#!/bin/bash
KEY="$HOME/Downloads/alon.pem"
SERVER="18.195.248.157"
USER="ubuntu"

ssh -i "$KEY" -o StrictHostKeyChecking=no "$USER@$SERVER" bash << 'ENDSSH'
  echo "=== PM2 status ==="
  pm2 status

  echo ""
  echo "=== Last 50 log lines ==="
  pm2 logs helpdesk --lines 50 --nostream 2>/dev/null || echo "No logs yet"

  echo ""
  echo "=== DB connectivity ==="
  nc -zv ls-5205fe3826e1ff3c5192aeba4b19e38bfeaca614.cfauk8yma4mq.eu-central-1.rds.amazonaws.com 5432 2>&1 \
    && echo "PostgreSQL: REACHABLE" || echo "PostgreSQL: CANNOT CONNECT"

  echo ""
  echo "=== Port 3000 ==="
  ss -tlnp | grep :3000 || echo "Nothing on :3000"
ENDSSH
