<?php

use App\Http\Controllers\Api\AuthController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Auth routes — mirrors backend/src/api/routes/auth.routes.js exactly
| (same paths, same order, same middleware combination per route).
|
| Extra per-route rate limiters, same limits Express applied in
| server.js: `auth` (20 req/15min) on register/login/verify-2fa and
| `password-reset` (5 req/hour) on forgot-password. Defined in
| AppServiceProvider; off only in the `local` environment.
|--------------------------------------------------------------------------
*/

Route::prefix('auth')->group(function () {
    Route::get('/check-username/{username}', [AuthController::class, 'checkUsername']);
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:auth');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:auth');
    Route::post('/verify-2fa', [AuthController::class, 'verifyTwoFactor'])->middleware('throttle:auth');
    Route::post('/activate', [AuthController::class, 'activate']);

    Route::middleware(['jwt.auth', 'jwt.admin'])->group(function () {
        Route::post('/resend-invite/{userId}', [AuthController::class, 'resendInvite']);
        Route::post('/invite-codes', [AuthController::class, 'createInviteCode']);
        Route::get('/invite-codes', [AuthController::class, 'listInviteCodes']);
        Route::delete('/invite-codes/{id}', [AuthController::class, 'revokeInviteCode']);
    });

    Route::get('/invite-codes/validate/{token}', [AuthController::class, 'validateInviteCode']);
    Route::post('/register-with-invite', [AuthController::class, 'registerWithInvite']);
    Route::post('/verify-email', [AuthController::class, 'verifyEmail']);

    Route::middleware('jwt.auth')->group(function () {
        Route::get('/me', [AuthController::class, 'me']);
    });

    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:password-reset');
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);

    // Public (token-based, like verify-email/reset-password above) —
    // the confirmation link is mailed to the NEW address, which may
    // not be logged in on the device that opens it. The token itself
    // is the security boundary, not the JWT.
    Route::post('/confirm-email-change', [AuthController::class, 'confirmEmailChange']);

    Route::middleware('jwt.auth')->group(function () {
        Route::put('/password', [AuthController::class, 'changePassword']);
        Route::put('/username', [AuthController::class, 'updateUsername']);
        Route::put('/2fa', [AuthController::class, 'toggleTwoFactor']);
        Route::put('/phone', [AuthController::class, 'updatePhone']);
        Route::put('/email', [AuthController::class, 'updateEmail']);
    });
});
