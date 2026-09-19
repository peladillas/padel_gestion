#!/bin/bash
# `set -e`: a failed build now aborts BEFORE nginx is restarted (the old
# script always printed "Frontend deployed!" even when the build failed,
# leaving the previous JS bundle talking to a newer API).
set -e
echo "Building frontend..."
cd /var/www/bonapinta/frontend
docker run --rm -v /var/www/bonapinta/frontend:/app -w /app node:20-slim sh -c "npm ci && npm run build"
cd /var/www/bonapinta
docker-compose restart frontend
echo "Frontend deployed!"
