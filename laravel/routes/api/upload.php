<?php

use App\Http\Controllers\Api\UploadController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Upload routes — mirrors backend/src/api/routes/upload.routes.js.
|--------------------------------------------------------------------------
*/

Route::prefix('upload')->middleware('jwt.auth')->group(function () {
    Route::post('/avatar', [UploadController::class, 'avatar']);
    Route::delete('/avatar', [UploadController::class, 'deleteAvatar']);
});
