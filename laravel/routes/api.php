<?php

use Illuminate\Support\Facades\Route;

require __DIR__.'/api/auth.php';
require __DIR__.'/api/players.php';
require __DIR__.'/api/clubs.php';
require __DIR__.'/api/dashboard.php';
require __DIR__.'/api/upload.php';
require __DIR__.'/api/availability.php';
require __DIR__.'/api/tournaments.php';
require __DIR__.'/api/valorations.php';
require __DIR__.'/api/notifications.php';
require __DIR__.'/api/messaging.php';

Route::get('/health', \App\Http\Controllers\Api\HealthController::class);
