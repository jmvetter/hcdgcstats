#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 server (e.g. Lightsail). Run as root:
#   ssh ubuntu@SERVER 'sudo bash -s' < deploy/setup-server.sh HOSTNAME
# HOSTNAME is the web address Caddy gets an HTTPS certificate for, e.g.
# 44-196-166-160.sslip.io or stats.example.org. Safe to re-run.
set -euo pipefail

HOSTNAME="${1:?usage: setup-server.sh HOSTNAME}"
NODE_MAJOR=26
PNPM_VERSION=12.9.1
APP_USER=hcdgc
APP_DIR=/opt/hcdgcstats
DATA_DIR=/var/lib/hcdgcstats

echo "==> Swap (lets the Next.js build fit on a 1 GB server)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q curl xz-utils rsync sqlite3 libatomic1 debian-keyring debian-archive-keyring apt-transport-https gnupg

echo "==> Node.js ${NODE_MAJOR} (official build, checksum verified)"
if ! node --version 2>/dev/null | grep -q "^v${NODE_MAJOR}\."; then
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64) arch=arm64 ;;
    *) echo "unsupported architecture $(uname -m)"; exit 1 ;;
  esac
  base="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  tmp=$(mktemp -d)
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file=$(grep -oE "node-v[0-9.]+-linux-${arch}\.tar\.xz" "$tmp/SHASUMS256.txt" | head -1)
  curl -fsSL "$base/$file" -o "$tmp/$file"
  (cd "$tmp" && grep " $file\$" SHASUMS256.txt | sha256sum -c -)
  tar -xJf "$tmp/$file" -C /usr/local --strip-components=1
  rm -rf "$tmp"
fi
node --version

echo "==> pnpm ${PNPM_VERSION}"
npm install -g --silent "pnpm@${PNPM_VERSION}"

echo "==> Caddy (HTTPS reverse proxy, from Caddy's official apt repository)"
if ! command -v caddy >/dev/null; then
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi
cat > /etc/caddy/Caddyfile <<EOF
${HOSTNAME} {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload caddy || systemctl restart caddy

echo "==> App user and directories"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$DATA_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"
chmod 750 "$DATA_DIR"

echo "==> systemd service"
cat > /etc/systemd/system/hcdgcstats.service <<EOF
[Unit]
Description=HCDGC Stats (Next.js)
After=network.target

[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
# Settings (ADMIN_PASSWORD, PDGA_*, DATABASE_PATH) live in ${APP_DIR}/.env.production.local
ExecStart=${APP_DIR}/node_modules/.bin/next start -p 3000 -H 127.0.0.1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable hcdgcstats >/dev/null

echo "==> Done. Next: deploy the app with deploy/deploy.sh"
