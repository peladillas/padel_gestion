<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        $this->configureRateLimiting();
    }

    /**
     * Same limits Express had (server.js): 500 req/15min overall, 20
     * req/15min on login/register/2FA, 5 req/hour on password recovery.
     * Disabled by default only in the `local` environment so manual
     * testing isn't throttled (RATE_LIMITS_ENABLED overrides either way).
     */
    protected function configureRateLimiting(): void
    {
        $enabled = fn () => (bool) config('bonapinta.rate_limits_enabled');

        RateLimiter::for('api', fn (Request $r) => $enabled()
            ? Limit::perMinutes(15, 500)->by($r->ip())
            : Limit::none());

        RateLimiter::for('auth', fn (Request $r) => $enabled()
            ? Limit::perMinutes(15, 20)->by($r->ip())
            : Limit::none());

        RateLimiter::for('password-reset', fn (Request $r) => $enabled()
            ? Limit::perHour(5)->by($r->ip())
            : Limit::none());
    }
}
