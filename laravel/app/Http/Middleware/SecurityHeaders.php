<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The bits of Express's `helmet()` that matter for a JSON API + static
 * uploads. HSTS is deliberately left to Nginx (which terminates TLS);
 * sending it from PHP would also fire on plain-HTTP dev servers.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'no-referrer');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        // Lets the SPA (same site) embed uploaded avatars but nobody else hotlink them cross-site.
        $response->headers->set('Cross-Origin-Resource-Policy', 'same-site');

        if (str_starts_with($request->path(), 'api/')) {
            // API responses carry personal data — never let a shared cache keep them.
            $response->headers->set('Cache-Control', 'no-store');
        }

        return $response;
    }
}
