<?php

use App\Http\Controllers\Api\MessagingController;
use Illuminate\Support\Facades\Route;

Route::middleware('jwt.auth')->prefix('messages')->group(function () {
    Route::get('/conversations', [MessagingController::class, 'conversations']);
    Route::post('/conversations/user', [MessagingController::class, 'startUserConversation']);
    Route::post('/conversations/club', [MessagingController::class, 'startClubConversation']);
    Route::get('/conversations/{id}/messages', [MessagingController::class, 'messages']);
    Route::post('/conversations/{id}/messages', [MessagingController::class, 'sendMessage']);
    Route::get('/unread-count', [MessagingController::class, 'unreadCount']);
    Route::post('/block', [MessagingController::class, 'block']);
    Route::post('/unblock', [MessagingController::class, 'unblock']);
    Route::get('/blocked', [MessagingController::class, 'blocked']);
});
