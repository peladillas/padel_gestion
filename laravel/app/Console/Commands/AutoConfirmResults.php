<?php

namespace App\Console\Commands;

use App\Services\Tournament\PlayerResultService;
use Illuminate\Console\Command;

class AutoConfirmResults extends Command
{
    protected $signature = 'tournaments:auto-confirm';

    protected $description = 'Confirma los resultados propuestos por jugadores que llevan 24h sin respuesta del rival';

    public function handle(PlayerResultService $results): int
    {
        $count = $results->autoConfirmExpired();

        $this->info("Resultados auto-confirmados: {$count}");

        return self::SUCCESS;
    }
}
