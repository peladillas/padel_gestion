<?php

use App\Http\Controllers\Api\AvailabilityController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Availability routes — mirrors backend/src/api/routes/availability.routes.js.
|--------------------------------------------------------------------------
*/

Route::prefix('availability')->middleware('jwt.auth')->group(function () {
    Route::get('/', [AvailabilityController::class, 'show']);
    Route::put('/', [AvailabilityController::class, 'update']);
    Route::get('/player/{playerId}', [AvailabilityController::class, 'showForPlayer']);
});
