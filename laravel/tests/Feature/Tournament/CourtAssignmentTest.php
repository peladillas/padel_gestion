<?php

use App\Models\Club;
use App\Models\Court;
use App\Models\TournamentCourt;
use App\Models\TournamentType;
use App\Services\Tournament\TournamentService;

beforeEach(function () {
    TournamentType::updateOrCreate(['key' => 'round_robin_generic'], [
        'label' => 'RR', 'engine' => 'configurable', 'is_active' => true,
        'default_config_schema' => [
            'roles' => [['key' => 'jugador', 'playsMatch' => true]], 'rotationConstraints' => [],
            'matchGenerator' => ['type' => 'round_robin', 'pairingMode' => 'individual'],
            'scoring' => ['win' => 3, 'draw' => 1, 'loss' => 0],
        ],
    ]);
});

/** Active individual tournament with $players enrolled and the given club courts assigned in order. */
function courtTournament(string $prefix, int $players, array $courtSpecs): array
{
    [$creator] = parityUser("{$prefix}-c@test.local");
    $club = Club::create(['name' => "Club {$prefix}", 'slug' => "club-{$prefix}"]);
    $t = app(TournamentService::class)->create($creator, ['typeKey' => 'round_robin_generic', 'name' => 'Pistas', 'pairingMode' => 'individual', 'clubId' => $club->id]);

    foreach (range(1, $players) as $i) {
        [, $p] = parityUser("{$prefix}-p{$i}@test.local");
        parityEnroll($t, $p);
    }

    $courts = [];
    foreach ($courtSpecs as $i => [$name, $active]) {
        $courts[$name] = Court::create(['clubId' => $club->id, 'name' => $name, 'isActive' => $active]);
        TournamentCourt::create(['tournamentId' => $t->id, 'courtId' => $courts[$name]->id, 'displayOrder' => $i]);
    }

    app(TournamentService::class)->startTournament($t);

    return [$t, $courts, app(TournamentService::class)];
}

test('a round\'s matches get the tournament courts in the admin\'s order', function () {
    [$t, $courts, $svc] = courtTournament('ca1', 4, [['Central', true], ['Pista 2', true]]);

    $matches = $svc->generateRound($t)->values();

    expect($matches)->toHaveCount(2);
    expect($matches[0]->fresh()->courtId)->toBe($courts['Central']->id);
    expect($matches[1]->fresh()->courtId)->toBe($courts['Pista 2']->id);
});

test('with fewer courts than matches the extra matches stay without a court', function () {
    [$t, $courts, $svc] = courtTournament('ca2', 6, [['Central', true]]);

    $matches = $svc->generateRound($t)->values();

    expect($matches)->toHaveCount(3);
    expect($matches->pluck('courtId')->all())->toBe([$courts['Central']->id, null, null]);
});

test('inactive courts are skipped', function () {
    [$t, $courts, $svc] = courtTournament('ca3', 4, [['Cerrada', false], ['Abierta', true]]);

    $matches = $svc->generateRound($t)->values();

    expect($matches[0]->fresh()->courtId)->toBe($courts['Abierta']->id);
    expect($matches[1]->fresh()->courtId)->toBeNull();
});

test('no courts configured leaves every match without a court', function () {
    [$t, , $svc] = courtTournament('ca4', 4, []);

    expect($svc->generateRound($t)->pluck('courtId')->filter()->all())->toBe([]);
});

test('the assigned court is exposed in the player\'s matches', function () {
    [$t, $courts, $svc] = courtTournament('ca5', 2, [['Central', true]]);
    $svc->generateRound($t);
    $someone = \App\Models\Player::whereHas('user', fn ($q) => $q->where('email', 'ca5-p1@test.local'))->first();

    $rows = $this->getJson('/api/tournament-instances/my-matches', parityAuth($someone->user))->assertOk()->json();

    expect($rows[0]['court']['name'])->toBe('Central');
});
