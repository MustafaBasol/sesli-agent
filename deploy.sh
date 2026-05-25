#!/usr/bin/env bash
# ============================================================
# deploy.sh — Hostinger VPS deploy scripti
# VPS'te bir kez çalıştır: bash deploy.sh
# ============================================================
set -euo pipefail

APP_DIR="/opt/sesli-agent"
REPO_URL="https://github.com/MustafaBasol/sesli-agent.git"
BRANCH="main"

echo "▶ Repo güncelleniyor..."
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

# .env.local yoksa oluşturulmasını iste
if [ ! -f ".env.local" ]; then
  echo ""
  echo "⚠️  .env.local bulunamadı!"
  echo "   Aşağıdaki komutu çalıştırıp değerleri doldurun:"
  echo "   cp .env.example .env.local && nano .env.local"
  echo ""
  exit 1
fi

echo "▶ Docker image build ediliyor..."
docker compose build --no-cache

echo "▶ Konteyner yeniden başlatılıyor..."
docker compose up -d --force-recreate

echo "▶ Eski image'lar temizleniyor..."
docker image prune -f

echo ""
echo "✅ Deploy tamamlandı! Uygulama http://localhost:3000 adresinde çalışıyor."
echo "   Nginx varsa: proxy_pass http://localhost:3000;"
