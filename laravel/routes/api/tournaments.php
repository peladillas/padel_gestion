<?php

use App\Http\Controllers\Api\TournamentInstanceController;
use App\Http\Controllers\Api\TournamentMatchController;
use App\Http\Controllers\Api\TournamentTypeController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Tournament routes — new configurable-engine system, NOT a port of the
| old Express tournament-instances.routes.js. Every write action beyond
| creation is gated by TournamentInstance::canManage() inside the
| controller (club admin, super admin, or the tournament's own
| responsable — see App\Models\TournamentInstance).
|--------------------------------------------------------------------------
*/

// Public: the invite landing page shows the tournament before login.
// Throttled so invite tokens can't be enumerated.
Route::middleware('throttle:30,1')->get('/tournament-instances/join/{token}', [TournamentInstanceController::class, 'joinInfo']);

Route::middleware('jwt.auth')->group(function () {
    Route::get('/tournament-types', [TournamentTypeController::class, 'index']);

    Route::prefix('tournament-instances')->group(function () {
        Route::get('/', [TournamentInstanceController::class, 'index']);
        Route::post('/', [TournamentInstanceController::class, 'store']);
        // Must come before GET /{id} — a literal segment registered
        // after a same-method {id} route never matches (see
        // TournamentInstanceController::myMatches()'s docblock).
        Route::get('/my-matches', [TournamentInstanceController::class, 'myMatches']);
        Route::post('/join/{token}', [TournamentInstanceController::class, 'join']);
        Route::get('/{id}', [TournamentInstanceController::class, 'show']);
        Route::put('/{id}', [TournamentInstanceController::class, 'update']);
        Route::delete('/{id}', [TournamentInstanceController::class, 'destroy']);

        Route::post('/{id}/participants', [TournamentInstanceController::class, 'addParticipant']);
        Route::delete('/{id}/participants/{participantId}', [TournamentInstanceController::class, 'removeParticipant']);
        Route::put('/{id}/participants/pair', [TournamentInstanceController::class, 'pair']);
        Route::put('/{id}/participants/unpair', [TournamentInstanceController::class, 'unpair']);
        Route::post('/{id}/participants/auto-pair', [TournamentInstanceController::class, 'autoPair']);
        Route::put('/{id}/participants/{participantId}/substitute', [TournamentInstanceController::class, 'setSubstitute']);

        // Player-driven pairing (fixed_pairs, draft only)
        Route::post('/{id}/pair-request', [TournamentInstanceController::class, 'sendPairRequest']);
        Route::put('/{id}/pair-request/accept', [TournamentInstanceController::class, 'acceptPairRequest']);
        Route::put('/{id}/pair-request/reject', [TournamentInstanceController::class, 'rejectPairRequest']);
        Route::delete('/{id}/pair-request', [TournamentInstanceController::class, 'cancelPairRequest']);

        Route::post('/{id}/invite', [TournamentInstanceController::class, 'generateInvite']);
        Route::put('/{id}/invite', [TournamentInstanceController::class, 'updateInvite']);
        Route::put('/{id}/max-participants', [TournamentInstanceController::class, 'updateMaxParticipants']);
        Route::put('/{id}/result-mode', [TournamentInstanceController::class, 'updateResultMode']);
        Route::get('/{id}/courts', [TournamentInstanceController::class, 'getCourts']);
        Route::put('/{id}/courts', [TournamentInstanceController::class, 'setCourts']);
        Route::post('/{id}/reset', [TournamentInstanceController::class, 'reset']);
        Route::put('/{id}/archive', [TournamentInstanceController::class, 'archive']);

        Route::put('/{id}/start', [TournamentInstanceController::class, 'start']);
        Route::post('/{id}/rounds', [TournamentInstanceController::class, 'generateRound']);
        Route::get('/{id}/standings', [TournamentInstanceController::class, 'standings']);
        Route::get('/{id}/logs', [TournamentInstanceController::class, 'logs']);
        Route::put('/{id}/suspend', [TournamentInstanceController::class, 'suspend']);
        Route::put('/{id}/resume', [TournamentInstanceController::class, 'resume']);

        Route::put('/{id}/matches/{matchId}/result', [TournamentMatchController::class, 'setResult']);
        Route::put('/{id}/matches/{matchId}/propose', [TournamentMatchController::class, 'propose']);
        Route::put('/{id}/matches/{matchId}/accept', [TournamentMatchController::class, 'accept']);
        Route::put('/{id}/matches/{matchId}/reject', [TournamentMatchController::class, 'reject']);
        Route::put('/{id}/matches/{matchId}/suspend', [TournamentMatchController::class, 'suspend']);
        Route::put('/{id}/matches/{matchId}/resume', [TournamentMatchController::class, 'resume']);
    });
});
