<?php

use App\Http\Controllers\Api\DashboardController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Dashboard routes — mirrors backend/src/api/routes/dashboard.routes.js.
|--------------------------------------------------------------------------
*/

Route::prefix('dashboard')->middleware('jwt.auth')->group(function () {
    Route::get('/admin', [DashboardController::class, 'admin'])->middleware('jwt.admin');
    Route::get('/player', [DashboardController::class, 'player']);
});
