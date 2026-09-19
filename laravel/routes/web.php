<?php

use App\Http\Controllers\Api\UploadController;
use Illuminate\Support\Facades\Route;

Route::view('/', 'welcome');

// Mirrors Express's `app.use('/uploads', express.static('/app/uploads'))`
// (server.js:40) — deliberately NOT under /api, matching the exact same
// top-level mount point production Nginx proxies to today
// (nginx/default.conf's `^~ /uploads/` block).
Route::get('/uploads/{path}', [UploadController::class, 'serveUpload'])
    ->where('path', '.*');
