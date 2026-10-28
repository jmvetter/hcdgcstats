#!/usr/bin/env bash
# Copies the code from this checkout to the server, builds it there and
# restarts the site. Your settings and database on the server are untouched.
#   deploy/deploy.sh                      # uses the defaults below
#   SERVER=1.2.3.4 deploy/deploy.sh
set -euo pipefail

SERVER="${SERVER:-44.196.166.160}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/hcdgcstats-lightsail}"
SSH="ssh -i $SSH_KEY ubuntu@$SERVER"
APP_DIR=/opt/hcdgcstats
STAGING=/home/ubuntu/hcdgcstats-src

cd "$(dirname "$0")/.."

echo "==> Uploading code to $SERVER"
rsync -az --delete -e "ssh -i $SSH_KEY" \
  --exclude .git --exclude node_modules --exclude .next --exclude data \
  --exclude '.env*' --exclude .claude --exclude .DS_Store \
  ./ "ubuntu@$SERVER:$STAGING/"

echo "==> Installing dependencies and building (a few minutes on a small server)"
$SSH "sudo rsync -a --delete \
        --exclude node_modules --exclude .next --exclude '.env*' \
        $STAGING/ $APP_DIR/ \
      && sudo chown -R hcdgc:hcdgc $APP_DIR \
      && cd $APP_DIR \
      && sudo -u hcdgc pnpm install --frozen-lockfile --reporter=append-only \
      && sudo -u hcdgc env NODE_OPTIONS=--max-old-space-size=1536 pnpm build"

echo "==> Restarting"
$SSH "sudo systemctl restart hcdgcstats && sleep 3 && systemctl is-active hcdgcstats"
