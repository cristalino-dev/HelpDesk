#!/bin/bash
# Run this AFTER opening ports 80 and 443 in the Lightsail firewall.
# Gets a Let's Encrypt SSL cert and configures nginx for HTTPS.

KEY="$HOME/Downloads/alon.pem"
SERVER="18.195.248.157"
EMAIL="alon@cristalino.co.il"

ssh -i "$KEY" -o StrictHostKeyChecking=no ubuntu@$SERVER \
  "sudo certbot --nginx -d helpdesk.cristalino.co.il --non-interactive --agree-tos -m $EMAIL"
