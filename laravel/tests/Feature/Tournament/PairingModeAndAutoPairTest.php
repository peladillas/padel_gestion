<?php

use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\TournamentParticipant;
use App\Models\TournamentType;
use App\Models\User;
use App\Services\Tournament\TournamentService;
use Illuminate\Support\Facades\Hash;

// Other tournament tests build TournamentInstance rows directly,
// bypassing TournamentService::create() (and with it, ever needing a
// seeded tournament_types row). This file is the first to exercise
// create() itself, which does look one up — so seed the one type this
// file needs, matching TournamentTypeSeeder's real round_robin_generic
// entry closely enough for pairingMode override behavior to be
// representative.
beforeEach(function () {
    TournamentType::updateOrCreate(['key' => 'round_robin_generic'], [
        'label' => 'Round robin (genérico)',
        'engine' => 'configurable',
        'is_active' => true,
        'default_config_schema' => [
            'roles' => [['key' => 'jugador', 'playsMatch' => true]],
            'rotationConstraints' => [],
            'matchGenerator' => ['type' => 'round_robin', 'pairingMode' => 'individual'],
            'scoring' => ['win' => 3, 'draw' => 1, 'loss' => 0],
        ],
    ]);
});

function makePairingUser(string $email, int $level): array
{
    $user = User::create([
        'email' => $email,
        'password' => Hash::make('x'),
        'username' => 'pp'.substr(md5($email), 0, 10),
        'isActivated' => true,
        'role' => Role::PLAYER,
    ]);
    $player = Player::create(['userId' => $user->id, 'name' => ucfirst(explode('@', $email)[0]), 'level' => $level]);

    return [$user, $player];
}

test('creating a tournament defaults to fixed_pairs when nothing is specified', function () {
    [$creator] = makePairingUser('pm-creator1@test.local', 1);

    $tournament = app(TournamentService::class)->create($creator, [
        'typeKey' => 'round_robin_generic', // seeded default is 'individual'
        'name' => 'Default pairing test',
    ]);

    expect($tournament->pairingSystem)->toBe('fixed_pairs');
    expect($tournament->config['matchGenerator']['pairingMode'])->toBe('fixed_pairs');
});

test('an explicit pairingMode overrides the tournament type default', function () {
    [$creator] = makePairingUser('pm-creator2@test.local', 1);

    $tournament = app(TournamentService::class)->create($creator, [
        'typeKey' => 'round_robin_generic',
        'name' => 'Explicit individual',
        'pairingMode' => 'individual',
    ]);

    expect($tournament->pairingSystem)->toBe('individual');
});

test('starting a tournament is rejected while any active participant is unpaired in a fixed_pairs tournament', function () {
    [$creator] = makePairingUser('pm-creator3@test.local', 1);
    $tournament = app(TournamentService::class)->create($creator, [
        'typeKey' => 'round_robin_generic', 'name' => 'Incomplete pairing', 'pairingMode' => 'fixed_pairs',
    ]);
    [, $p1] = makePairingUser('pm-a@test.local', 5);
    [, $p2] = makePairingUser('pm-b@test.local', 5);
    [, $p3] = makePairingUser('pm-c@test.local', 5);
    [, $p4] = makePairingUser('pm-d@test.local', 5);

    $service = app(TournamentService::class);
    $service->addParticipant($tournament, ['playerId' => $p1->id]);
    $service->addParticipant($tournament, ['playerId' => $p2->id]);
    $service->addParticipant($tournament, ['playerId' => $p3->id]);
    $service->addParticipant($tournament, ['playerId' => $p4->id]);

    expect(fn () => $service->startTournament($tournament))->toThrow(ApiException::class);

    // Pair only two of the four — still one unpaired couple's worth short.
    $ids = TournamentParticipant::where('tournamentId', $tournament->id)->pluck('id', 'playerId');
    $service->pairParticipants($tournament, $ids[$p1->id], $ids[$p2->id]);

    expect(fn () => $service->startTournament($tournament))->toThrow(ApiException::class);

    $service->pairParticipants($tournament, $ids[$p3->id], $ids[$p4->id]);

    // Now fully paired — starting should succeed, and only then can a
    // round be generated (draft tournaments reject generateRound()).
    expect(fn () => $service->generateRound($tournament))->toThrow(ApiException::class, 'Iniciá el torneo antes de generar partidos.');

    $service->startTournament($tournament);
    $matches = $service->generateRound($tournament);
    expect($matches)->toHaveCount(1);
});

test('an absent participant without a partner does not block generating a round', function () {
    [$creator] = makePairingUser('pm-creator4@test.local', 1);
    $tournament = app(TournamentService::class)->create($creator, [
        'typeKey' => 'round_robin_generic', 'name' => 'Absent excluded', 'pairingMode' => 'fixed_pairs',
    ]);
    [, $p1] = makePairingUser('pm-e@test.local', 5);
    [, $p2] = makePairingUser('pm-f@test.local', 5);
    [, $p3] = makePairingUser('pm-g@test.local', 5);
    [, $p4] = makePairingUser('pm-h2@test.local', 5);
    [, $p5] = makePairingUser('pm-i2@test.local', 5);

    $service = app(TournamentService::class);
    foreach ([$p1, $p2, $p3, $p4, $p5] as $p) {
        $service->addParticipant($tournament, ['playerId' => $p->id]);
    }

    // Two complete couples (p1+p2, p4+p5) so round-robin actually has
    // someone to play against — plus one absent, unpaired straggler
    // (p3) that must NOT block generation.
    $ids = TournamentParticipant::where('tournamentId', $tournament->id)->pluck('id', 'playerId');
    $service->pairParticipants($tournament, $ids[$p1->id], $ids[$p2->id]);
    $service->pairParticipants($tournament, $ids[$p4->id], $ids[$p5->id]);
    $service->setSubstitute($tournament, $ids[$p3->id], null, 'injury', null);

    // p3 being absent-and-unpaired must not block starting either —
    // same rule as generateRound(), same assertFullyPaired() check.
    $service->startTournament($tournament);
    $matches = $service->generateRound($tournament);
    expect($matches)->toHaveCount(1);
});

test('auto-pairing balances by level (highest with lowest) and leaves one unpaired when odd', function () {
    [$creator] = makePairingUser('pm-creator5@test.local', 1);
    $tournament = app(TournamentService::class)->create($creator, [
        'typeKey' => 'round_robin_generic', 'name' => 'Auto pair test', 'pairingMode' => 'fixed_pairs',
    ]);

    // Distinct levels, no ties — keeps the expected pairing fully
    // deterministic (a tie at the median would make which of two
    // equal-level players sits out effectively random).
    [, $l1] = makePairingUser('pm-l1@test.local', 1);
    [, $l3] = makePairingUser('pm-l3@test.local', 3);
    [, $l5] = makePairingUser('pm-l5@test.local', 5);
    [, $l7] = makePairingUser('pm-l7@test.local', 7);
    [, $l10] = makePairingUser('pm-l10@test.local', 10);

    $service = app(TournamentService::class);
    foreach ([$l1, $l3, $l5, $l7, $l10] as $p) {
        $service->addParticipant($tournament, ['playerId' => $p->id]);
    }

    $result = $service->autoPairParticipants($tournament);

    expect($result['pairs'])->toBe(2);
    // Odd count (5) — the MEDIAN level (5) sits out, not the lowest.
    expect($result['unpaired'])->toBe($l5->name);

    $participants = TournamentParticipant::where('tournamentId', $tournament->id)->get()->keyBy('playerId');
    // Highest (10) paired with lowest (1); next-highest (7) with next-lowest (3).
    expect($participants[$l10->id]->partnerId)->toBe($l1->id);
    expect($participants[$l1->id]->partnerId)->toBe($l10->id);
    expect($participants[$l7->id]->partnerId)->toBe($l3->id);
    expect($participants[$l5->id]->partnerId)->toBeNull();
});

test('auto-pairing only touches unpaired participants, leaving existing pairs alone', function () {
    [$creator] = makePairingUser('pm-creator6@test.local', 1);
    $tournament = app(TournamentService::class)->create($creator, [
        'typeKey' => 'round_robin_generic', 'name' => 'Auto pair partial', 'pairingMode' => 'fixed_pairs',
    ]);
    [, $p1] = makePairingUser('pm-h@test.local', 5);
    [, $p2] = makePairingUser('pm-i@test.local', 5);
    [, $p3] = makePairingUser('pm-j@test.local', 5);
    [, $p4] = makePairingUser('pm-k@test.local', 5);

    $service = app(TournamentService::class);
    foreach ([$p1, $p2, $p3, $p4] as $p) {
        $service->addParticipant($tournament, ['playerId' => $p->id]);
    }
    $ids = TournamentParticipant::where('tournamentId', $tournament->id)->pluck('id', 'playerId');
    $service->pairParticipants($tournament, $ids[$p1->id], $ids[$p2->id]);

    $result = $service->autoPairParticipants($tournament);

    expect($result['pairs'])->toBe(1); // only p3+p4 needed pairing
    $participants = TournamentParticipant::where('tournamentId', $tournament->id)->get()->keyBy('playerId');
    expect($participants[$p1->id]->partnerId)->toBe($p2->id); // untouched
    expect($participants[$p3->id]->partnerId)->toBe($p4->id);
});
