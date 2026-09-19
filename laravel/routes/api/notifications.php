<?php

use App\Http\Controllers\Api\NotificationController;
use Illuminate\Support\Facades\Route;

Route::middleware('jwt.auth')->prefix('notifications')->group(function () {
    Route::get('/', [NotificationController::class, 'index']);
    Route::get('/unread-count', [NotificationController::class, 'unreadCount']);
    Route::put('/read-all', [NotificationController::class, 'markAllRead']);
    Route::put('/{id}/read', [NotificationController::class, 'markRead']);
    Route::put('/{id}/archive', [NotificationController::class, 'archive']);
    Route::put('/{id}/unarchive', [NotificationController::class, 'unarchive']);
});
