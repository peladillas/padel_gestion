<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Fail-fast preflight, run by the container entrypoint before serving
 * traffic: refuses to start a production instance with a config that
 * would be insecure or silently broken (debug on, weak/missing JWT
 * secret, emails going to the log instead of Resend, ...). Outside
 * production it only warns.
 */
class CheckProductionConfig extends Command
{
    protected $signature = 'bonapinta:check-config {--strict : Treat warnings as errors regardless of environment}';

    protected $description = 'Valida que la configuración sea segura y completa para producción';

    public function handle(): int
    {
        $production = app()->isProduction() || $this->option('strict');
        $problems = [];

        $jwt = (string) config('bonapinta.jwt_secret');
        if (strlen($jwt) < 32) {
            $problems[] = 'JWT_SECRET debe tener al menos 32 caracteres (genera uno: openssl rand -hex 32).';
        }

        if (! config('app.key')) {
            $problems[] = 'APP_KEY no está definida (php artisan key:generate --show).';
        }

        if (config('app.debug')) {
            $problems[] = 'APP_DEBUG=true expone trazas y variables de entorno; usa APP_DEBUG=false.';
        }

        if (config('mail.default') === 'log' || config('mail.default') === 'array') {
            $problems[] = 'MAIL_MAILER='.config('mail.default').': los emails (con enlaces de activación) irían al log en vez de enviarse. Usa MAIL_MAILER=resend.';
        }

        if (! config('bonapinta.resend_api_key')) {
            $problems[] = 'RESEND_API_KEY vacía: nadie recibiría emails de verificación, invitación ni recuperación.';
        }

        if (! str_starts_with((string) config('bonapinta.frontend_url'), 'https://')) {
            $problems[] = 'FRONTEND_URL debe ser https:// en producción (se usa en los enlaces de los emails).';
        }

        if (! config('bonapinta.rate_limits_enabled')) {
            $problems[] = 'Los rate limits están desactivados (RATE_LIMITS_ENABLED=false).';
        }

        try {
            DB::select('select 1');
        } catch (\Throwable $e) {
            $problems[] = 'No se puede conectar a la base de datos: '.$e->getMessage();
        }

        if (! is_dir(config('bonapinta.uploads_path')) || ! is_writable(config('bonapinta.uploads_path'))) {
            $problems[] = 'UPLOADS_PATH ('.config('bonapinta.uploads_path').') no existe o no es escribible.';
        }

        if (! $problems) {
            $this->info('Configuración OK.');

            return self::SUCCESS;
        }

        foreach ($problems as $problem) {
            $production ? $this->error("✗ {$problem}") : $this->warn("! {$problem}");
        }

        return $production ? self::FAILURE : self::SUCCESS;
    }
}
