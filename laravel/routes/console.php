<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Player-proposed results auto-confirm after 24h without an answer. Needs
// `php artisan schedule:work` (or a per-minute cron running schedule:run)
// in production — see docker/README in the deployment guide.
Schedule::command('tournaments:auto-confirm')->everyTenMinutes()->withoutOverlapping();
