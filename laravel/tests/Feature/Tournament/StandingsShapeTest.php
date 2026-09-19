<?php

use App\Enums\Role;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\TournamentMatch;
use App\Models\TournamentParticipant;
use App\Models\User;
use App\Services\Tournament\GenericEngine;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * calculateStandings() must aggregate ONE row per couple (not per
 * individual participant) for fixed_pairs tournaments, with real Player
 * objects embedded — this is what the pre-existing, reused-as-is
 * TournamentView.jsx expects (`s.player1.name`, `s.participant.player.name`).
 */
test('standings aggregate per couple for fixed_pairs, with player objects embedded', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Standings shape test',
        'structure' => 'generic',
        'pairingSystem' => 'fixed_pairs',
        'matchFormat' => 'sets_completos',
        'createdBy' => (string) Str::uuid(),
        'config' => [
            'roles' => [['key' => 'jugador', 'playsMatch' => true]],
            'rotationConstraints' => [],
            'matchGenerator' => ['type' => 'round_robin', 'pairingMode' => 'fixed_pairs'],
            'scoring' => ['win' => 3, 'draw' => 1, 'loss' => 0],
        ],
    ]);

    $couples = [];
    for ($i = 1; $i <= 2; $i++) {
        $players = [];
        foreach ([1, 2] as $n) {
            $user = User::create(['email' => "sc{$i}{$n}@test.local", 'password' => Hash::make('x'), 'username' => "sc{$i}{$n}", 'isActivated' => true, 'role' => Role::PLAYER]);
            $players[] = Player::create(['userId' => $user->id, 'name' => "Couple{$i} Member{$n}", 'level' => 1]);
        }
        $p1 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $players[0]->id, 'partnerId' => $players[1]->id]);
        $p2 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $players[1]->id, 'partnerId' => $players[0]->id]);
        $couples[] = [$p1->id, $p2->id];
    }

    // One completed match: couple 1 (team1) beats couple 2 (team2).
    TournamentMatch::create([
        'tournamentId' => $tournament->id,
        'round' => 1,
        'group' => json_encode(['team1' => $couples[0], 'team2' => $couples[1]]),
        'status' => 'completed',
        'result' => ['outcome' => 'team1'],
    ]);

    $engine = app(GenericEngine::class);
    $result = $engine->calculateStandings($tournament);

    expect($result['standings'])->toHaveCount(2); // one row PER COUPLE, not per participant
    expect($result['completedMatches'])->toBe(1);

    $winner = collect($result['standings'])->firstWhere('points', 3);
    expect($winner['type'])->toBe('pair');
    expect($winner['player1'])->not->toBeNull();
    expect($winner['player2'])->not->toBeNull();
    expect([$winner['player1']->name, $winner['player2']->name])
        ->toEqualCanonicalizing(['Couple1 Member1', 'Couple1 Member2']);
    expect($winner['won'])->toBe(1);

    $loser = collect($result['standings'])->firstWhere('points', 0);
    expect($loser['lost'])->toBe(1);
});
