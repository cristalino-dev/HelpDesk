#!/bin/bash
# One-time Ubuntu server setup.
# Run from your local machine:
#   bash setup-server.sh
# Or pipe directly:
#   ssh -i ~/Downloads/alon.pem ubuntu@18.195.248.157 'bash -s' < setup-server.sh

set -e

echo "=== Installing Node.js 22 LTS ==="
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "=== Installing PM2 ==="
sudo npm install -g pm2

echo "=== Creating app directory ==="
mkdir -p /home/ubuntu/helpdesk

echo "=== Configuring PM2 to start on boot ==="
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# PM2 will print a command starting with "sudo env PATH=...". Run it.

echo ""
echo "Server ready. Now run deploy.sh from your local machine."
