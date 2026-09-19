#!/bin/bash
# Deploys the Laravel API (php-fpm + inner nginx + scheduler).
# Migrations run automatically in the api container's entrypoint, which
# also refuses to start if the production config is unsafe.
set -e
cd /var/www/bonapinta

echo "Deploying backend (Laravel)..."
docker-compose build api api-web scheduler
docker-compose up -d

echo "Waiting for the API to become healthy..."
for i in $(seq 1 30); do
  if curl -fsS https://bonapinta.com/api/health; then
    echo ""
    echo "Backend deployed!"
    exit 0
  fi
  sleep 3
done

echo ""
echo "ERROR: /api/health did not respond OK. Logs:"
docker-compose logs --tail 40 api
exit 1
