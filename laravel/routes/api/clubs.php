<?php

use App\Http\Controllers\Api\ClubController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Club routes — mirrors backend/src/api/routes/clubs.routes.js.
|--------------------------------------------------------------------------
*/

Route::prefix('clubs')->middleware('jwt.auth')->group(function () {
    Route::get('/public', [ClubController::class, 'publicList']);

    Route::middleware('jwt.admin')->group(function () {
        Route::get('/', [ClubController::class, 'index']);
        Route::get('/{id}', [ClubController::class, 'show']);
        Route::get('/{id}/courts', [ClubController::class, 'courtsIndex']);
        Route::post('/{id}/courts', [ClubController::class, 'courtsStore']);
        Route::put('/{id}/courts/{courtId}', [ClubController::class, 'courtsUpdate']);
        Route::delete('/{id}/courts/{courtId}', [ClubController::class, 'courtsDestroy']);
    });

    Route::middleware('jwt.superadmin')->group(function () {
        Route::post('/', [ClubController::class, 'store']);
        Route::put('/{id}', [ClubController::class, 'update']);
        Route::delete('/{id}', [ClubController::class, 'destroy']);
        Route::post('/{id}/admins', [ClubController::class, 'storeAdmin']);
        Route::put('/{id}/admins/{playerId}', [ClubController::class, 'updateAdmin']);
        Route::delete('/{id}/admins/{playerId}', [ClubController::class, 'destroyAdmin']);
        Route::put('/{id}/tournament-types', [ClubController::class, 'updateTournamentTypes']);
    });
});
