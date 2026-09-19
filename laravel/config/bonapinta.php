<?php

return [
    // Same env var names as backend/src/config/index.js — kept identical
    // so the same root .env can (eventually) feed both services during
    // the dual-stack migration window.
    'jwt_secret' => env('JWT_SECRET'),
    'jwt_expiry' => env('JWT_EXPIRY', '7d'),

    'frontend_url' => env('FRONTEND_URL', 'https://bonapinta.com'),

    // Rate limiting is on everywhere except APP_ENV=local unless overridden.
    'rate_limits_enabled' => filter_var(env('RATE_LIMITS_ENABLED', env('APP_ENV') !== 'local'), FILTER_VALIDATE_BOOLEAN),

    'resend_api_key' => env('RESEND_API_KEY'),
    'email_from' => env('EMAIL_FROM', 'noreply@bonapinta.com'),

    // Availability is intentionally not season-scoped in the UI — this
    // mirrors the hardcoded SEASON_ID in
    // backend/src/services/AvailabilityService.js. Do not expose
    // Season/League management because of this constant.
    'default_season_id' => env('BONAPINTA_DEFAULT_SEASON_ID', '1f481f07-1eda-48ed-84f2-3e808004b3ad'),

    // Mirrors Express's /app/uploads (bind-mounted from ./backend/uploads
    // in docker-compose.yml) and the `/uploads` static-serving path.
    // Locally defaults under storage/app so it works without any Docker
    // volume; set UPLOADS_PATH when this is containerized for real so it
    // points at the same bind-mounted host directory Express used.
    'uploads_path' => env('UPLOADS_PATH', storage_path('app/uploads')),
];
