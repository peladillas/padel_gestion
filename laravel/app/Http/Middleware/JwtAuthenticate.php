<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\Auth\TokenService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mirrors backend/src/api/middleware/auth.middleware.js exactly, including
 * its leniency: it splits the Authorization header on a space and takes
 * the second token regardless of the scheme word (not strictly "Bearer"),
 * and it does NOT hit the DB — req.user is just the raw JWT payload. We
 * additionally resolve the User model (needed by Eloquent-based
 * controllers) but the auth decision itself only depends on the token.
 */
class JwtAuthenticate
{
    public function __construct(protected TokenService $tokens) {}

    public function handle(Request $request, Closure $next): Response
    {
        $header = $request->header('Authorization', '');
        $token = explode(' ', $header)[1] ?? null;

        if (! $token) {
            return response()->json(['error' => 'No autorizado'], 401);
        }

        try {
            $payload = $this->tokens->verify($token);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'Token inválido'], 401);
        }

        $request->attributes->set('jwt', $payload);

        $user = User::find($payload->userId);
        $request->setUserResolver(fn () => $user);

        return $next($request);
    }
}
