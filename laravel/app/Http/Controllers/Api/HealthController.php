<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Liveness + database probe for Docker/Nginx (Express's /api/health
 * equivalent; deploy-backend.sh curls it). Unauthenticated and free of
 * user data on purpose. A controller rather than a route closure so
 * `php artisan route:cache` works in production.
 */
class HealthController extends Controller
{
    public function __invoke()
    {
        try {
            DB::select('select 1');
        } catch (\Throwable) {
            return response()->json(['status' => 'error', 'app' => 'bonapinta', 'db' => 'down'], 503);
        }

        return response()->json(['status' => 'ok', 'app' => 'bonapinta', 'db' => 'up']);
    }
}
