<?php

use App\Enums\Role;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\TournamentParticipant;
use App\Models\User;
use App\Services\Tournament\GenericEngine;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

// Inlined rather than shared with other test files — Pest test files can
// be run individually, and top-level helper functions from other files
// wouldn't be defined yet in that case.
function makeSoloParticipantForRepeatTest(TournamentInstance $tournament, string $label): string
{
    $user = User::create([
        'email' => "{$label}@test.local",
        'password' => Hash::make('x'),
        'username' => $label,
        'isActivated' => true,
        'role' => Role::PLAYER,
    ]);
    $player = Player::create(['userId' => $user->id, 'name' => $label, 'level' => 1]);

    return TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $player->id])->id;
}

function makeParticipantPairForRepeatTest(TournamentInstance $tournament, string $label): array
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

    $p1 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $players[0]->id, 'partnerId' => $players[1]->id]);
    $p2 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $players[1]->id, 'partnerId' => $players[0]->id]);

    return [$p1->id, $p2->id];
}

test('round robin avoids repeat opponents within the configured window when possible', function () {
    $tournament = TournamentInstance::create([
        'name' => 'No repeat test',
        'structure' => 'generic',
        'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos',
        'createdBy' => (string) Str::uuid(),
        'config' => [
            'roles' => [['key' => 'jugador', 'playsMatch' => true]],
            'rotationConstraints' => [],
            'matchGenerator' => ['type' => 'round_robin', 'pairingMode' => 'individual', 'avoidRepeatsWithinRounds' => 3],
        ],
    ]);

    $ids = [];
    for ($i = 1; $i <= 6; $i++) {
        $ids[] = makeSoloParticipantForRepeatTest($tournament, "r{$i}");
    }

    $engine = app(GenericEngine::class);

    $seenPairs = [];

    for ($round = 1; $round <= 3; $round++) {
        $matches = $engine->generateRound($tournament, $ids);

        foreach ($matches as $m) {
            $g = json_decode($m->group, true);
            $a = $g['team1'][0];
            $b = $g['team2'][0];
            $key = min($a, $b).'|'.max($a, $b);

            expect($seenPairs)->not->toHaveKey($key, "pair {$key} repeated within the 3-round avoidance window");
            $seenPairs[$key] = true;
        }
    }
});

test('round robin avoids repeats across ALL history by default, with no avoidRepeatsWithinRounds configured', function () {
    // Regression test for a real bug: the seeded round_robin_generic
    // type never sets avoidRepeatsWithinRounds, so every round after the
    // first used to fall back to pairSequentially() — re-pairing the
    // exact same fixed unit order every time, i.e. identical matches
    // forever. Confirmed against a real tournament that kept generating
    // the same fecha over and over.
    $tournament = TournamentInstance::create([
        'name' => 'Default config repeat test',
        'structure' => 'generic',
        'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos',
        'createdBy' => (string) Str::uuid(),
        'config' => [
            'roles' => [['key' => 'jugador', 'playsMatch' => true]],
            'rotationConstraints' => [],
            'matchGenerator' => ['type' => 'round_robin', 'pairingMode' => 'individual'], // no avoidRepeatsWithinRounds — matches the real seeded type
        ],
    ]);

    $ids = [];
    for ($i = 1; $i <= 6; $i++) {
        $ids[] = makeSoloParticipantForRepeatTest($tournament, "d{$i}");
    }

    $engine = app(GenericEngine::class);
    $pairKeysByRound = [];

    for ($round = 1; $round <= 5; $round++) {
        $matches = $engine->generateRound($tournament, $ids);

        $keys = $matches->map(function ($m) {
            $g = json_decode($m->group, true);
            $a = $g['team1'][0];
            $b = $g['team2'][0];

            return min($a, $b).'|'.max($a, $b);
        })->sort()->values()->all();

        $pairKeysByRound[$round] = $keys;
    }

    // The bug produced identical pairings in every round — assert that
    // no longer happens for any two rounds within the 5-round window.
    for ($r1 = 1; $r1 <= 5; $r1++) {
        for ($r2 = $r1 + 1; $r2 <= 5; $r2++) {
            expect($pairKeysByRound[$r1])->not->toBe($pairKeysByRound[$r2],
                "round {$r1} and round {$r2} produced identical pairings — the repeat bug is back");
        }
    }

    // With 6 individual units, a full round-robin cycle is exactly 5
    // rounds (n-1) with zero repeats — verify that actually held here.
    $seenPairs = [];
    foreach ($pairKeysByRound as $keys) {
        foreach ($keys as $key) {
            expect($seenPairs)->not->toHaveKey($key, "pair {$key} repeated before the full round-robin cycle completed");
            $seenPairs[$key] = true;
        }
    }
    expect($seenPairs)->toHaveCount(15); // C(6,2) = every possible pairing exactly once
});

test('a couple with one absent member and no substitute sits out entirely; a substitute keeps them available', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Absence test',
        'structure' => 'generic',
        'pairingSystem' => 'fixed_pairs',
        'matchFormat' => 'sets_completos',
        'createdBy' => (string) Str::uuid(),
        'config' => [
            'roles' => [['key' => 'jugador', 'playsMatch' => true]],
            'rotationConstraints' => [],
            'matchGenerator' => ['type' => 'round_robin', 'pairingMode' => 'fixed_pairs'],
        ],
    ]);

    // 5 couples: one drops out entirely (no substitute), leaving 4 —
    // an even number of COUPLES, since fixed_pairs matches are couple vs
    // couple (2 couples per match), not participant vs participant.
    $couples = [];
    for ($i = 1; $i <= 5; $i++) {
        $couples[] = makeParticipantPairForRepeatTest($tournament, "abscouple{$i}");
    }
    $allIds = array_merge(...$couples);

    // Couple 1: member 0 absent, no substitute -> whole couple sits out.
    TournamentParticipant::whereKey($couples[0][0])->update(['status' => 'absent']);

    // Couple 2: member 0 absent WITH a substitute -> still available.
    $subUser = User::create(['email' => 'sub@test.local', 'password' => Hash::make('x'), 'username' => 'sub.player', 'isActivated' => true, 'role' => Role::PLAYER]);
    $subPlayer = Player::create(['userId' => $subUser->id, 'name' => 'Substitute', 'level' => 1]);
    TournamentParticipant::whereKey($couples[1][0])->update(['status' => 'absent', 'substituteId' => $subPlayer->id]);

    $engine = app(GenericEngine::class);
    $matches = $engine->generateRound($tournament, $allIds);

    // Couple 1 out entirely; couples 2,3,4,5 available = 4 couples = 2
    // complete matches (couple vs couple).
    expect($matches)->toHaveCount(2);

    $playingIds = $matches->flatMap(fn ($m) => array_merge(json_decode($m->group, true)['team1'], json_decode($m->group, true)['team2']))->all();

    expect($playingIds)->not->toContain($couples[0][0]);
    expect($playingIds)->not->toContain($couples[0][1]);
    expect($playingIds)->toContain($couples[1][0]); // absent but substituted — still counted
    expect($playingIds)->toContain($couples[1][1]);
});
