<?php

namespace App\Http\Middleware;

use App\Enums\Role;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mirrors backend/src/api/middleware/superAdmin.middleware.js.
 */
class RequireSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->role !== Role::SUPER_ADMIN) {
            return response()->json(['error' => 'Acceso restringido a super administradores'], 403);
        }

        return $next($request);
    }
}
