#!/bin/bash
set -e
SRC=/mnt/c/Users/logad/proyectos/padel/bonapinta_padel
DST=/home/logad/bonapinta_padel

echo "== rsync (excluding vendor/node_modules/dist/logs/caches — regenerated natively) =="
time rsync -a \
  --exclude 'laravel/vendor' \
  --exclude 'frontend/node_modules' \
  --exclude 'backend/node_modules' \
  --exclude 'frontend/dist' \
  --exclude 'laravel/storage/logs' \
  --exclude 'laravel/storage/framework/cache' \
  --exclude 'laravel/storage/framework/sessions' \
  --exclude 'laravel/storage/framework/views' \
  --exclude 'laravel/storage/framework/testing' \
  --exclude 'laravel/bootstrap/cache' \
  --exclude 'laravel/.phpunit.cache' \
  --exclude '*.log' \
  "$SRC/" "$DST/"

echo "== done. size of new copy: =="
du -sh "$DST"
echo "== git status in new copy (should match original) =="
cd "$DST" && git status --porcelain | wc -l
