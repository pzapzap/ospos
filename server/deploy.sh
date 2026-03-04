#!/usr/bin/env bash
set -euo pipefail

# ─── OSPOS Server — Hetzner Deployment Script ────────────────────────────────
#
# Usage:
#   1. SSH into your Hetzner box
#   2. Clone the repo (or scp the server/ directory)
#   3. cp .env.production.template .env   — fill in all values
#   4. bash deploy.sh
#
# Prerequisites: Ubuntu 22.04+ with internet access
# ──────────────────────────────────────────────────────────────────────────────

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "==> OSPOS Server Deployment"
echo "    Directory: $APP_DIR"
echo ""

# ─── 1. Install Docker if missing ────────────────────────────────────────────

if ! command -v docker &> /dev/null; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "    Docker installed."
else
  echo "==> Docker already installed: $(docker --version)"
fi

# ─── 2. Install Docker Compose plugin if missing ─────────────────────────────

if ! docker compose version &> /dev/null; then
  echo "==> Installing Docker Compose plugin..."
  apt-get update -qq && apt-get install -y -qq docker-compose-plugin
  echo "    Docker Compose installed."
else
  echo "==> Docker Compose already installed: $(docker compose version)"
fi

# ─── 3. Check .env exists ────────────────────────────────────────────────────

if [ ! -f .env ]; then
  echo ""
  echo "ERROR: .env file not found!"
  echo "  cp .env.production.template .env"
  echo "  Then fill in all required values."
  exit 1
fi

# ─── 4. Build and start ──────────────────────────────────────────────────────

echo ""
echo "==> Building containers..."
docker compose -f docker-compose.prod.yml build

echo ""
echo "==> Starting services..."
docker compose -f docker-compose.prod.yml up -d

# ─── 5. Wait for postgres, run migrations ─────────────────────────────────────

echo ""
echo "==> Waiting for PostgreSQL to be healthy..."
for i in {1..30}; do
  if docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U ospos &> /dev/null; then
    echo "    PostgreSQL is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: PostgreSQL did not become ready in time."
    exit 1
  fi
  sleep 1
done

echo ""
echo "==> Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T server node dist/db/migrate.js

echo ""
echo "==> Deployment complete!"
echo ""
echo "    Services running:"
docker compose -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "    Caddy will auto-provision SSL for api.ospos.app"
echo "    once DNS is pointed to this server's IP."
echo ""
echo "    Logs:   docker compose -f docker-compose.prod.yml logs -f"
echo "    Stop:   docker compose -f docker-compose.prod.yml down"
echo "    Update: git pull && bash deploy.sh"
