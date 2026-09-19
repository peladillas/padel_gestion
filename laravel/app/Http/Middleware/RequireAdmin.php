<?php

namespace App\Http\Middleware;

use App\Enums\Role;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mirrors backend/src/api/middleware/admin.middleware.js — ADMIN or
 * SUPER_ADMIN. Must run after JwtAuthenticate.
 */
class RequireAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $role = $request->user()?->role;

        if (! $role || ! in_array($role, [Role::ADMIN, Role::SUPER_ADMIN], true)) {
            return response()->json(['error' => 'Acceso restringido a administradores'], 403);
        }

        return $next($request);
    }
}
