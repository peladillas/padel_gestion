#!/bin/bash
echo "Rebuilding backend..."
cd /var/www/bonapinta
docker-compose build --no-cache backend
docker-compose up -d
sleep 15
echo "Health check:"
curl -s https://bonapinta.com/api/health
