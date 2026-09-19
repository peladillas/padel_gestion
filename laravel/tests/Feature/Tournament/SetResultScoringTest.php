<?php

use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\TournamentMatch;
use App\Models\TournamentParticipant;
use App\Models\User;
use App\Services\Tournament\TournamentService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

// "No alcanza con gana/empata/pierde" — setResult() now requires real
// games-per-set (validated against the tournament's best-of, default 3)
// or an explicit retirement with a reason. outcome is derived server-side,
// never trusted from the caller.
function makeScoringMatch(?int $bestOf = null): TournamentMatch
{
    $config = ['roles' => [['key' => 'jugador', 'playsMatch' => true]], 'rotationConstraints' => []];
    if ($bestOf !== null) {
        $config['bestOf'] = $bestOf;
    }

    $tournament = TournamentInstance::create([
        'name' => 'Scoring test', 'structure' => 'generic', 'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos', 'status' => 'active', 'createdBy' => (string) Str::uuid(),
        'config' => $config,
    ]);

    $user1 = User::create(['email' => 'sc-'.Str::random(8).'@test.local', 'password' => Hash::make('x'), 'username' => 'sc1'.substr(md5(Str::random()), 0, 8), 'isActivated' => true, 'role' => Role::PLAYER]);
    $user2 = User::create(['email' => 'sc-'.Str::random(8).'@test.local', 'password' => Hash::make('x'), 'username' => 'sc2'.substr(md5(Str::random()), 0, 8), 'isActivated' => true, 'role' => Role::PLAYER]);
    $p1 = Player::create(['userId' => $user1->id, 'name' => 'Sc One', 'level' => 1]);
    $p2 = Player::create(['userId' => $user2->id, 'name' => 'Sc Two', 'level' => 1]);
    $pp1 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $p1->id]);
    $pp2 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $p2->id]);

    return TournamentMatch::create([
        'tournamentId' => $tournament->id, 'round' => 1,
        'group' => json_encode(['team1' => [$pp1->id], 'team2' => [$pp2->id]]),
        'status' => 'pending',
    ]);
}

test('a 2-0 sweep decides a best-of-3 match for the winning team', function () {
    $match = makeScoringMatch();
    $updated = app(TournamentService::class)->setResult($match, [
        'sets' => [['t1' => 6, 't2' => 4], ['t1' => 6, 't2' => 2]],
    ]);

    expect($updated->status)->toBe('completed');
    expect($updated->result['outcome'])->toBe('team1');
    expect($updated->result['played'])->toBeTrue();
    expect($updated->wasPlayed())->toBeTrue();
});

test('a split-sets match needs the deciding third set in a best-of-3', function () {
    $match = makeScoringMatch();

    expect(fn () => app(TournamentService::class)->setResult($match, [
        'sets' => [['t1' => 6, 't2' => 4], ['t1' => 3, 't2' => 6]],
    ]))->toThrow(ApiException::class, 'Partido incompleto');

    $updated = app(TournamentService::class)->setResult($match, [
        'sets' => [['t1' => 6, 't2' => 4], ['t1' => 3, 't2' => 6], ['t1' => 4, 't2' => 6]],
    ]);
    expect($updated->result['outcome'])->toBe('team2');
});

test('a set tied in games is rejected', function () {
    $match = makeScoringMatch();

    expect(fn () => app(TournamentService::class)->setResult($match, [
        'sets' => [['t1' => 6, 't2' => 6]],
    ]))->toThrow(ApiException::class, 'no puede terminar en empate');
});

test('an incomplete set (missing games) is rejected', function () {
    $match = makeScoringMatch();

    expect(fn () => app(TournamentService::class)->setResult($match, [
        'sets' => [['t1' => 6, 't2' => null]],
    ]))->toThrow(ApiException::class, 'incompleto');
});

test('a retirement hands the match to the opponent and marks it not played', function () {
    $match = makeScoringMatch();
    $updated = app(TournamentService::class)->setResult($match, [
        'retired' => ['team' => 'team1', 'reason' => 'Lesión de rodilla'],
    ]);

    expect($updated->result['outcome'])->toBe('team2');
    expect($updated->result['played'])->toBeFalse();
    expect($updated->wasPlayed())->toBeFalse();
    expect($updated->result['retired']['reason'])->toBe('Lesión de rodilla');
});

test('a retirement without a reason is rejected', function () {
    $match = makeScoringMatch();

    expect(fn () => app(TournamentService::class)->setResult($match, [
        'retired' => ['team' => 'team1', 'reason' => ''],
    ]))->toThrow(ApiException::class, 'motivo del abandono');
});

test('setResult rejects a payload with neither sets nor a retirement', function () {
    $match = makeScoringMatch();

    expect(fn () => app(TournamentService::class)->setResult($match, []))
        ->toThrow(ApiException::class, 'Debés indicar los sets jugados o un abandono.');
});

test('a tournament configured for best-of-5 needs 3 sets to decide, not 2', function () {
    $match = makeScoringMatch(bestOf: 5);

    expect(fn () => app(TournamentService::class)->setResult($match, [
        'sets' => [['t1' => 6, 't2' => 4], ['t1' => 6, 't2' => 3]],
    ]))->toThrow(ApiException::class, 'mejor de 5');

    $updated = app(TournamentService::class)->setResult($match, [
        'sets' => [['t1' => 6, 't2' => 4], ['t1' => 6, 't2' => 3], ['t1' => 6, 't2' => 2]],
    ]);
    expect($updated->result['outcome'])->toBe('team1');
});
