#!/bin/sh
# Container entrypoint for the Laravel API and scheduler.
# Fails fast on a bad config, migrates, then hands over to the real command.
set -e
cd /var/www/html

UPLOADS="${UPLOADS_PATH:-/var/www/uploads}"
mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache "$UPLOADS"
chown -R www-data:www-data storage bootstrap/cache
# Only the directory itself: the uploads volume can be large and is already owned by www-data after the first run.
chown www-data:www-data "$UPLOADS"

# Refuse to start an insecure/incomplete production config (see CheckProductionConfig).
php artisan bonapinta:check-config

# Only the API container migrates; the scheduler container starts after it is healthy.
if [ "$RUN_MIGRATIONS" = "1" ]; then
  php artisan migrate --force
  # Idempotent (updateOrCreate): keeps the tournament-type catalogue in sync with the code.
  php artisan db:seed --force --class=TournamentTypeSeeder
fi

php artisan config:cache
php artisan route:cache
php artisan event:cache
php artisan view:cache

exec "$@"
