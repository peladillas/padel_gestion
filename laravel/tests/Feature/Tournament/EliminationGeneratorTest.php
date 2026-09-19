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

function makeSoloParticipant(TournamentInstance $tournament, string $label): string
{
    $user = User::create([
        'email' => "{$label}@test.local",
        'password' => Hash::make('x'),
        'username' => $label,
        'isActivated' => true,
        'role' => Role::PLAYER,
    ]);
    $player = Player::create(['userId' => $user->id, 'name' => $label, 'level' => 1]);

    return TournamentParticipant::create([
        'tournamentId' => $tournament->id,
        'playerId' => $player->id,
    ])->id;
}

test('elimination bracket gives byes to fill a non-power-of-2 field and advances winners round by round', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Bracket test',
        'structure' => 'generic',
        'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos',
        'createdBy' => (string) Str::uuid(),
        'config' => [
            'roles' => [['key' => 'jugador', 'playsMatch' => true]],
            'rotationConstraints' => [],
            'matchGenerator' => ['type' => 'elimination', 'pairingMode' => 'individual', 'advancesFromPreviousRound' => true],
        ],
    ]);

    // 5 participants -> next power of 2 is 8 -> 3 byes, 1 real match round 1.
    $ids = [];
    for ($i = 1; $i <= 5; $i++) {
        $ids[] = makeSoloParticipant($tournament, "p{$i}");
    }

    $engine = app(GenericEngine::class);

    $round1 = $engine->generateRound($tournament, $ids);
    expect($round1)->toHaveCount(4); // 3 byes + 1 real match

    $byes = $round1->filter(fn ($m) => ($m->result['bye'] ?? false) === true);
    $realMatches = $round1->reject(fn ($m) => ($m->result['bye'] ?? false) === true);
    expect($byes)->toHaveCount(3);
    expect($realMatches)->toHaveCount(1);
    expect($byes->first()->status)->toBe('completed');
    expect($realMatches->first()->status)->toBe('pending');

    // Complete the one real match so round 2 can be generated.
    $match = $realMatches->first();
    $match->update(['status' => 'completed', 'result' => ['outcome' => 'team1']]);

    // Calling generateRound again should now advance: 3 bye-winners +
    // 1 match-winner = 4 units -> 2 matches for round 2.
    $round2 = $engine->generateRound($tournament, $ids);
    expect($round2)->toHaveCount(2);
    expect($round2->every(fn ($m) => $m->round === 2))->toBeTrue();
    expect(TournamentMatch::where('tournamentId', $tournament->id)->where('round', 2)->where('status', 'pending')->count())->toBe(2);

    // Complete both semifinal-equivalent matches.
    foreach ($round2 as $m) {
        $m->update(['status' => 'completed', 'result' => ['outcome' => 'team1']]);
    }

    $round3 = $engine->generateRound($tournament, $ids);
    expect($round3)->toHaveCount(1); // the final
    expect($round3->first()->round)->toBe(3);
});

test('generating past the final leaves no more matches once a single champion remains', function () {
    // Real bug found against live data (torneo "enano al hombro"):
    // EliminationGenerator::advance() used to keep producing a
    // pointless bye for the sole remaining unit forever, with no stop
    // condition — this is the regression test for the fix.
    $tournament = TournamentInstance::create([
        'name' => 'Champion stop test',
        'structure' => 'generic',
        'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos',
        'createdBy' => (string) Str::uuid(),
        'config' => [
            'roles' => [['key' => 'jugador', 'playsMatch' => true]],
            'rotationConstraints' => [],
            'matchGenerator' => ['type' => 'elimination', 'pairingMode' => 'individual', 'advancesFromPreviousRound' => true],
        ],
    ]);

    $ids = [makeSoloParticipant($tournament, 'ch1'), makeSoloParticipant($tournament, 'ch2')];
    $engine = app(GenericEngine::class);

    $final = $engine->generateRound($tournament, $ids);
    expect($final)->toHaveCount(1);
    $final->first()->update(['status' => 'completed', 'result' => ['outcome' => 'team1']]);

    expect(fn () => $engine->generateRound($tournament, $ids))
        ->toThrow(\App\Exceptions\ApiException::class, 'El torneo ya tiene campeón');

    expect($tournament->fresh()->status)->toBe('completed');
    expect(TournamentMatch::where('tournamentId', $tournament->id)->count())->toBe(1); // no phantom bye added
});

test('generating the next round is rejected while the previous round still has an undecided match', function () {
    // Real bug found against live data: generating round 2 while round
    // 1's real match was still pending silently dropped that match's
    // eventual winner from the bracket forever (advance() treats a
    // null winner as "not advancing", permanently — there is no way to
    // retroactively insert them into a later round).
    $tournament = TournamentInstance::create([
        'name' => 'Undecided round blocks next',
        'structure' => 'generic',
        'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos',
        'createdBy' => (string) Str::uuid(),
        'config' => [
            'roles' => [['key' => 'jugador', 'playsMatch' => true]],
            'rotationConstraints' => [],
            'matchGenerator' => ['type' => 'elimination', 'pairingMode' => 'individual', 'advancesFromPreviousRound' => true],
        ],
    ]);

    $ids = [];
    for ($i = 1; $i <= 4; $i++) {
        $ids[] = makeSoloParticipant($tournament, "u{$i}");
    }

    $engine = app(GenericEngine::class);
    $round1 = $engine->generateRound($tournament, $ids); // 2 real matches, both pending

    expect($round1)->toHaveCount(2);

    // Leave both round-1 matches undecided and try to advance anyway.
    expect(fn () => $engine->generateRound($tournament, $ids))
        ->toThrow(\App\Exceptions\ApiException::class, 'Hay partidos sin resultado en la fecha anterior');

    // Still no round 2 persisted.
    expect(TournamentMatch::where('tournamentId', $tournament->id)->where('round', 2)->count())->toBe(0);
});

test('elimination bracket needs no byes for an exact power of 2', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Bracket power of 2',
        'structure' => 'generic',
        'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos',
        'createdBy' => (string) Str::uuid(),
        'config' => [
            'roles' => [['key' => 'jugador', 'playsMatch' => true]],
            'rotationConstraints' => [],
            'matchGenerator' => ['type' => 'elimination', 'pairingMode' => 'individual', 'advancesFromPreviousRound' => true],
        ],
    ]);

    $ids = [];
    for ($i = 1; $i <= 8; $i++) {
        $ids[] = makeSoloParticipant($tournament, "q{$i}");
    }

    $engine = app(GenericEngine::class);
    $round1 = $engine->generateRound($tournament, $ids);

    expect($round1)->toHaveCount(4);
    expect($round1->every(fn ($m) => ($m->result['bye'] ?? false) === false))->toBeTrue();
});
