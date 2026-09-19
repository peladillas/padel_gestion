<?php

use App\Http\Controllers\Api\ValorationController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Valoration routes — new build (see App\Services\ValorationService),
| TournamentMatch-only. The old `/valorations/match/:matchId` route
| (classic Match table) has no equivalent — that table was never ported.
|--------------------------------------------------------------------------
*/

Route::middleware('jwt.auth')->prefix('valorations')->group(function () {
    Route::get('/pending', [ValorationController::class, 'pending']);
    Route::get('/received', [ValorationController::class, 'received']);
    Route::post('/', [ValorationController::class, 'store']);
    Route::get('/player/{playerId}', [ValorationController::class, 'stats']);
    Route::get('/player/{playerId}/evolution', [ValorationController::class, 'evolution']);
});
