<?php

use App\Http\Controllers\Api\PlayerController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Player routes — mirrors backend/src/api/routes/players.routes.js.
|
| Route ORDER matters here exactly like in Express: literal segments
| (/search, /club-players, /invite, /import...) must be registered before
| the generic /{id} routes, or Laravel's first-match router would treat
| e.g. "search" as an {id} value.
|--------------------------------------------------------------------------
*/

Route::prefix('players')->middleware('jwt.auth')->group(function () {
    Route::put('/me', [PlayerController::class, 'updateMe']);
    Route::put('/me/privacy', [PlayerController::class, 'updatePrivacy']);
    Route::put('/me/club', [PlayerController::class, 'updateMyClub']);

    Route::middleware('jwt.admin')->group(function () {
        Route::post('/invite', [PlayerController::class, 'invite']);
        Route::get('/club-players', [PlayerController::class, 'clubPlayers']);
        Route::get('/club-members', [PlayerController::class, 'clubMembers']);
        Route::post('/club-players', [PlayerController::class, 'createClubPlayer']);
    });

    Route::get('/search', [PlayerController::class, 'search']);
});

// Public profile — optional auth (anonymous visitors allowed).
Route::get('/players/{id}/public', [PlayerController::class, 'publicProfile'])
    ->middleware('jwt.optional');

Route::prefix('players')->middleware('jwt.auth')->group(function () {
    Route::get('/', [PlayerController::class, 'index']);
    Route::get('/{id}', [PlayerController::class, 'show']);

    Route::middleware('jwt.admin')->group(function () {
        Route::put('/{id}', [PlayerController::class, 'update']);
        Route::put('/{id}/password', [PlayerController::class, 'updatePassword']);
        Route::delete('/{id}', [PlayerController::class, 'destroy']);
        Route::put('/{id}/restore', [PlayerController::class, 'restore']);
        Route::post('/import', [PlayerController::class, 'import']);
    });
});
