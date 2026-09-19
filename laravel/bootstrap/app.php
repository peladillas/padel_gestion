<?php

use App\Exceptions\ApiException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Behind Nginx (Docker network), every request would otherwise
        // appear to come from the proxy's IP — which makes per-IP rate
        // limits hit ALL users at once (the exact 429 outage documented in
        // the old CLAUDE.md). Equivalent of Express's `trust proxy`.
        // NB: the wildcard only works as the plain string '*' (an array
        // ['*'] is matched literally by Symfony and trusts nobody), so
        // only split into a list when specific proxy IPs/CIDRs are given.
        $trusted = trim((string) env('TRUSTED_PROXIES', '*'));
        $middleware->trustProxies(at: in_array($trusted, ['*', '**'], true)
            ? $trusted
            : array_values(array_filter(array_map('trim', explode(',', $trusted)))));

        $middleware->append(\App\Http\Middleware\SecurityHeaders::class);

        // Global per-IP limit (Express: 500 req / 15 min) on every /api route.
        $middleware->throttleApi('api');

        $middleware->alias([
            'jwt.auth' => \App\Http\Middleware\JwtAuthenticate::class,
            'jwt.optional' => \App\Http\Middleware\OptionalJwtAuthenticate::class,
            'jwt.admin' => \App\Http\Middleware\RequireAdmin::class,
            'jwt.superadmin' => \App\Http\Middleware\RequireSuperAdmin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Mirrors backend/src/api/middleware/error.middleware.js: services
        // throw ApiException with a status + optional extra fields
        // (expired, suggestions, etc.) and this turns it into the exact
        // same JSON error body the Express routes returned.
        $exceptions->render(function (ApiException $e, Request $request) {
            return response()->json($e->toResponseArray(), $e->status());
        });
    })->create();
