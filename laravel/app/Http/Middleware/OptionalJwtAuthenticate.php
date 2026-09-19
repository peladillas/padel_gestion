<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\Auth\TokenService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mirrors backend/src/api/middleware/optional-auth.middleware.js — parses
 * the token the same way as JwtAuthenticate, but never rejects. Missing
 * or invalid token simply leaves the request unauthenticated
 * ($request->user() === null). Used only by the public player-profile
 * endpoint.
 */
class OptionalJwtAuthenticate
{
    public function __construct(protected TokenService $tokens) {}

    public function handle(Request $request, Closure $next): Response
    {
        $header = $request->header('Authorization', '');
        $token = explode(' ', $header)[1] ?? null;

        if ($token) {
            try {
                $payload = $this->tokens->verify($token);
                $request->attributes->set('jwt', $payload);
                $user = User::find($payload->userId);
                $request->setUserResolver(fn () => $user);
            } catch (\Throwable $e) {
                // swallow — anonymous access is allowed
            }
        }

        return $next($request);
    }
}
