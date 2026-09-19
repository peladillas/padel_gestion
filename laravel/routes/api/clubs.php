<?php

use App\Http\Controllers\Api\ClubController;
use App\Http\Controllers\Api\CourtController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Club routes — mirrors backend/src/api/routes/clubs.routes.js.
|--------------------------------------------------------------------------
*/

Route::prefix('clubs')->middleware('jwt.auth')->group(function () {
    Route::get('/public', [ClubController::class, 'publicList']);
    Route::get('/services', [ClubController::class, 'serviceCatalog']);
    Route::get('/directory', [ClubController::class, 'directory']);
    Route::get('/directory/{id}', [ClubController::class, 'card']);
    // Any logged-in user: what a booking screen asks (never exposes the admin's notes).
    Route::get('/directory/{id}/availability', [CourtController::class, 'availability']);
    Route::get('/court-catalog', [CourtController::class, 'catalog']);

    Route::middleware('jwt.admin')->group(function () {
        Route::get('/', [ClubController::class, 'index']);
        Route::get('/{id}', [ClubController::class, 'show']);
        Route::put('/{id}/profile', [ClubController::class, 'updateProfile']);
        Route::post('/{id}/logo', [ClubController::class, 'uploadLogo']);
        Route::delete('/{id}/logo', [ClubController::class, 'deleteLogo']);
        Route::get('/{id}/courts', [ClubController::class, 'courtsIndex']);
        Route::post('/{id}/courts/bulk', [CourtController::class, 'bulkStore']);
        Route::get('/{id}/court-blocks', [CourtController::class, 'blocksIndex']);
        Route::post('/{id}/court-blocks', [CourtController::class, 'blocksStore']);
        Route::put('/{id}/court-blocks/{blockId}', [CourtController::class, 'blocksUpdate']);
        Route::delete('/{id}/court-blocks/{blockId}', [CourtController::class, 'blocksDestroy']);
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
