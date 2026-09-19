<?php

use App\Enums\Role;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\TournamentParticipant;
use App\Models\TournamentRoundRole;
use App\Models\User;
use App\Services\Tournament\GenericEngine;
use Illuminate\Support\Facades\Hash;

/**
 * Validates that the generic configurable engine can reproduce the exact
 * scenario the user described as "breaking any pattern" — 6 fixed pairs,
 * where each round 2 pairs are pulled out to "cocina" (a non-playing
 * role) instead of playing, with rotation constraints ensuring every
 * pair cooks exactly once per 3-round cycle and never two rounds in a
 * row — using ONLY config (roles + rotationConstraints), no
 * CimaPadel-specific code.
 */
function makeParticipantPair(TournamentInstance $tournament, string $label): array
{
    $players = [];

    foreach ([1, 2] as $n) {
        $user = User::create([
            'email' => "{$label}{$n}@test.local",
            'password' => Hash::make('x'),
            'username' => "{$label}{$n}",
            'isActivated' => true,
            'role' => Role::PLAYER,
        ]);
        $players[] = Player::create(['userId' => $user->id, 'name' => "{$label} {$n}", 'level' => 1]);
    }

    $p1 = TournamentParticipant::create([
        'tournamentId' => $tournament->id,
        'playerId' => $players[0]->id,
        'partnerId' => $players[1]->id,
    ]);
    $p2 = TournamentParticipant::create([
        'tournamentId' => $tournament->id,
        'playerId' => $players[1]->id,
        'partnerId' => $players[0]->id,
    ]);

    return [$p1->id, $p2->id];
}

test('cocina role rotates exactly once per 3-round cycle across 6 fixed pairs, never two rounds running', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Test CimaPadel-like',
        'structure' => 'generic',
        'pairingSystem' => 'fixed_pairs',
        'matchFormat' => 'sets_completos',
        'createdBy' => (string) \Illuminate\Support\Str::uuid(),
        'config' => [
            'roles' => [
                ['key' => 'jugador', 'playsMatch' => true],
                ['key' => 'cocina', 'playsMatch' => false, 'slotsPerRound' => 2],
            ],
            'rotationConstraints' => [
                ['type' => 'max_role_count_per_cycle', 'role' => 'cocina', 'cycleLength' => 3, 'max' => 1],
                ['type' => 'no_consecutive_role', 'role' => 'cocina'],
            ],
            'matchGenerator' => ['type' => 'round_robin', 'pairingMode' => 'fixed_pairs'],
            'scoring' => ['win' => 3, 'draw' => 1, 'loss' => 0],
        ],
    ]);

    // 6 couples = 12 participants.
    $couples = [];
    for ($i = 1; $i <= 6; $i++) {
        $couples[] = makeParticipantPair($tournament, "couple{$i}");
    }
    $allParticipantIds = array_merge(...$couples);

    // couple index lookup, for asserting cooking is always a WHOLE couple.
    $coupleOf = [];
    foreach ($couples as $idx => $pair) {
        foreach ($pair as $pid) {
            $coupleOf[$pid] = $idx;
        }
    }

    $engine = app(GenericEngine::class);

    $cookingCouplesByRound = [];

    for ($round = 1; $round <= 9; $round++) {
        $matches = $engine->generateRound($tournament, $allParticipantIds);

        // 2 couples cook (4 participants), 4 couples play (8
        // participants / 2 per team / 2 teams per match = 2 matches).
        expect($matches)->toHaveCount(2);

        $roundRoles = TournamentRoundRole::where('tournament_id', $tournament->id)
            ->where('round', $round)
            ->get();

        expect($roundRoles)->toHaveCount(12); // every participant gets SOME role

        $cookingParticipants = $roundRoles->where('role', 'cocina')->pluck('participant_id')->all();
        expect($cookingParticipants)->toHaveCount(4);

        // Cooking must be whole couples, never a lone member.
        $cookingCouples = array_unique(array_map(fn ($pid) => $coupleOf[$pid], $cookingParticipants));
        expect($cookingCouples)->toHaveCount(2, 'cocina must be assigned to whole couples, not individuals');

        foreach ($cookingCouples as $coupleIdx) {
            $members = $couples[$coupleIdx];
            $bothCooking = collect($members)->every(fn ($pid) => in_array($pid, $cookingParticipants, true));
            expect($bothCooking)->toBeTrue("both members of couple {$coupleIdx} must share the cocina role");
        }

        $cookingCouplesByRound[$round] = $cookingCouples;
    }

    // Every couple cooks EXACTLY once across each non-overlapping 3-round
    // cycle (1-3, 4-6, 7-9) — 6 couples, 2 slots/round × 3 rounds = 6
    // slots = exact cover.
    foreach ([[1, 3], [4, 6], [7, 9]] as [$start, $end]) {
        $cooked = [];
        for ($r = $start; $r <= $end; $r++) {
            $cooked = array_merge($cooked, $cookingCouplesByRound[$r]);
        }
        sort($cooked);
        expect($cooked)->toBe([0, 1, 2, 3, 4, 5], "every couple must cook exactly once in rounds {$start}-{$end}");
    }

    // No couple cooks two rounds in a row.
    for ($round = 2; $round <= 9; $round++) {
        $overlap = array_intersect($cookingCouplesByRound[$round], $cookingCouplesByRound[$round - 1]);
        expect($overlap)->toBeEmpty("no couple may cook in both round {$round} and ".($round - 1));
    }
});

test('individual pairing mode assigns the default role to everyone when there are no special roles', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Plain round robin',
        'structure' => 'generic',
        'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos',
        'createdBy' => (string) \Illuminate\Support\Str::uuid(),
        'config' => [
            'roles' => [['key' => 'jugador', 'playsMatch' => true]],
            'rotationConstraints' => [],
            'matchGenerator' => ['type' => 'round_robin', 'pairingMode' => 'individual'],
        ],
    ]);

    $ids = [];

    for ($i = 1; $i <= 4; $i++) {
        $user = User::create([
            'email' => "solo{$i}@test.local",
            'password' => Hash::make('x'),
            'username' => "solo{$i}",
            'isActivated' => true,
            'role' => Role::PLAYER,
        ]);
        $player = Player::create(['userId' => $user->id, 'name' => "Solo {$i}", 'level' => 1]);
        $ids[] = TournamentParticipant::create([
            'tournamentId' => $tournament->id,
            'playerId' => $player->id,
        ])->id;
    }

    $engine = app(GenericEngine::class);
    $matches = $engine->generateRound($tournament, $ids);

    expect($matches)->toHaveCount(2);

    $roles = TournamentRoundRole::where('tournament_id', $tournament->id)->pluck('role')->unique();
    expect($roles->all())->toBe(['jugador']);
});
