<?php

use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\TournamentLog;
use App\Models\TournamentType;
use App\Models\User;
use App\Services\Tournament\TournamentService;
use Illuminate\Support\Facades\Hash;

// startTournament() is the new explicit checkpoint requested by the
// user ("todo esto antes de iniciar el torneo") — a draft tournament no
// longer silently flips to active on the first generateRound() call.
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

function makeStartUser(string $email): array
{
    $user = User::create([
        'email' => $email,
        'password' => Hash::make('x'),
        'username' => 'st'.substr(md5($email), 0, 10),
        'isActivated' => true,
        'role' => Role::PLAYER,
    ]);
    $player = Player::create(['userId' => $user->id, 'name' => ucfirst(explode('@', $email)[0]), 'level' => 1]);

    return [$user, $player];
}

test('starting a tournament requires at least 2 participants', function () {
    [$creator] = makeStartUser('start-creator1@test.local');
    $tournament = app(TournamentService::class)->create($creator, [
        'typeKey' => 'round_robin_generic', 'name' => 'Too few', 'pairingMode' => 'individual',
    ]);

    $service = app(TournamentService::class);

    expect(fn () => $service->startTournament($tournament))
        ->toThrow(ApiException::class, 'Mínimo 2 participantes');

    expect($tournament->fresh()->status)->toBe('draft');
});

test('starting a tournament twice is rejected once it is already active', function () {
    [$creator] = makeStartUser('start-creator2@test.local');
    [, $p1] = makeStartUser('start-a@test.local');
    [, $p2] = makeStartUser('start-b@test.local');

    $tournament = app(TournamentService::class)->create($creator, [
        'typeKey' => 'round_robin_generic', 'name' => 'Double start', 'pairingMode' => 'individual',
    ]);

    $service = app(TournamentService::class);
    $service->addParticipant($tournament, ['playerId' => $p1->id]);
    $service->addParticipant($tournament, ['playerId' => $p2->id]);

    $service->startTournament($tournament);
    expect($tournament->fresh()->status)->toBe('active');

    expect(fn () => $service->startTournament($tournament))
        ->toThrow(ApiException::class, 'Solo se puede iniciar un torneo en borrador.');
});

test('starting a tournament writes a tournament_started log entry with the acting user', function () {
    [$creator] = makeStartUser('start-creator3@test.local');
    [, $p1] = makeStartUser('start-c@test.local');
    [, $p2] = makeStartUser('start-d@test.local');

    $tournament = app(TournamentService::class)->create($creator, [
        'typeKey' => 'round_robin_generic', 'name' => 'Logged start', 'pairingMode' => 'individual',
    ]);

    $service = app(TournamentService::class);
    $service->addParticipant($tournament, ['playerId' => $p1->id]);
    $service->addParticipant($tournament, ['playerId' => $p2->id]);

    $service->startTournament($tournament, $creator);

    $log = TournamentLog::where('tournamentId', $tournament->id)->where('action', 'tournament_started')->first();

    expect($log)->not->toBeNull();
    expect($log->userId)->toBe($creator->id);
    expect($log->detail)->toBe('Torneo iniciado.');
});

test('creating a tournament writes a tournament_created log entry', function () {
    [$creator] = makeStartUser('start-creator4@test.local');

    $tournament = app(TournamentService::class)->create($creator, [
        'typeKey' => 'round_robin_generic', 'name' => 'Logged creation', 'pairingMode' => 'individual',
    ]);

    $log = TournamentLog::where('tournamentId', $tournament->id)->where('action', 'tournament_created')->first();

    expect($log)->not->toBeNull();
    expect($log->userId)->toBe($creator->id);
    expect($log->detail)->toContain('Logged creation');
});

test('adding and removing a participant writes log entries naming the player', function () {
    [$creator] = makeStartUser('start-creator5@test.local');
    [, $p1] = makeStartUser('start-e@test.local');

    $tournament = app(TournamentService::class)->create($creator, [
        'typeKey' => 'round_robin_generic', 'name' => 'Participant logs', 'pairingMode' => 'individual',
    ]);

    $service = app(TournamentService::class);
    $participant = $service->addParticipant($tournament, ['playerId' => $p1->id], $creator);

    $addedLog = TournamentLog::where('tournamentId', $tournament->id)->where('action', 'participant_added')->first();
    expect($addedLog)->not->toBeNull();
    expect($addedLog->detail)->toContain($p1->name);

    $service->removeParticipant($tournament, $participant->id, $creator);

    $removedLog = TournamentLog::where('tournamentId', $tournament->id)->where('action', 'participant_removed')->first();
    expect($removedLog)->not->toBeNull();
    expect($removedLog->detail)->toContain($p1->name);
});

test('updating a tournament only logs when a tracked field actually changes', function () {
    [$creator] = makeStartUser('start-creator6@test.local');

    $tournament = app(TournamentService::class)->create($creator, [
        'typeKey' => 'round_robin_generic', 'name' => 'Update logs', 'pairingMode' => 'individual',
    ]);

    $service = app(TournamentService::class);

    // No-op update (same name) — must not log.
    $service->update($tournament, ['name' => 'Update logs'], $creator);
    expect(TournamentLog::where('tournamentId', $tournament->id)->where('action', 'tournament_updated')->count())->toBe(0);

    // Real change — must log.
    $service->update($tournament, ['name' => 'Renamed'], $creator);
    $log = TournamentLog::where('tournamentId', $tournament->id)->where('action', 'tournament_updated')->first();
    expect($log)->not->toBeNull();
    expect($log->detail)->toContain('name');
});
