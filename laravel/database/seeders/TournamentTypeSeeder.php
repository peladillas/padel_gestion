<?php

namespace Database\Seeders;

use App\Models\TournamentType;
use Illuminate\Database\Seeder;

/**
 * Seeds the `tournament_types` registry — the catalogue an admin picks
 * from when creating a tournament (see App\Models\TournamentType). Down
 * to a single type at the user's explicit request (previously also had
 * elimination_generic and rotation_with_roles_generic) — the underlying
 * MatchGenerator pieces those used (EliminationGenerator, round-robin
 * role rotation) are untouched and still reachable by hand-building a
 * TournamentInstance.config, just not offered as a preset anymore.
 */
class TournamentTypeSeeder extends Seeder
{
    public function run(): void
    {
        TournamentType::updateOrCreate(['key' => 'round_robin_generic'], [
            'label' => 'Round robin (genérico)',
            'description' => 'Todos contra todos, configurable: individual o parejas fijas, con o sin roles especiales.',
            'engine' => 'configurable',
            'default_config_schema' => [
                'roles' => [['key' => 'jugador', 'playsMatch' => true]],
                'rotationConstraints' => [],
                'matchGenerator' => ['type' => 'round_robin', 'pairingMode' => 'individual'],
                'scoring' => ['win' => 3, 'draw' => 1, 'loss' => 0],
                'bestOf' => 3,
            ],
        ]);
    }
}
