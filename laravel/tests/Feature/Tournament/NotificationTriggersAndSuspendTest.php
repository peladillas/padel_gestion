<?php

use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\TournamentMatch;
use App\Models\TournamentParticipant;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\Tournament\TournamentService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

function makeTournamentUser(string $email): array
{
    $user = User::create([
        'email' => $email,
        'password' => Hash::make('x'),
        'username' => 'u'.substr(md5($email), 0, 10),
        'isActivated' => true,
        'role' => Role::PLAYER,
    ]);
    $player = Player::create(['userId' => $user->id, 'name' => ucfirst(explode('@', $email)[0]), 'level' => 1]);

    return [$user, $player];
}

test('adding a participant notifies that player', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Notif enroll test', 'structure' => 'generic', 'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos', 'status' => 'draft', 'createdBy' => (string) Str::uuid(), 'config' => [],
    ]);
    [$user, $player] = makeTournamentUser('trigger-enroll@test.local');

    app(TournamentService::class)->addParticipant($tournament, ['playerId' => $player->id]);

    $notifications = app(NotificationService::class)->listForUser($user->id);
    expect($notifications)->toHaveCount(1);
    expect($notifications[0]->type)->toBe('tournament_enrolled');
});

test('setting a result notifies every participant in that match', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Notif result test', 'structure' => 'generic', 'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos', 'status' => 'active', 'createdBy' => (string) Str::uuid(), 'config' => [],
    ]);
    [$u1, $p1] = makeTournamentUser('trigger-r1@test.local');
    [$u2, $p2] = makeTournamentUser('trigger-r2@test.local');
    $pp1 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $p1->id]);
    $pp2 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $p2->id]);
    $match = TournamentMatch::create([
        'tournamentId' => $tournament->id, 'round' => 1,
        'group' => json_encode(['team1' => [$pp1->id], 'team2' => [$pp2->id]]),
        'status' => 'pending',
    ]);

    app(TournamentService::class)->setResult($match, ['sets' => [['t1' => 6, 't2' => 4], ['t1' => 6, 't2' => 3]]]);

    expect(app(NotificationService::class)->listForUser($u1->id))->toHaveCount(1);
    expect(app(NotificationService::class)->listForUser($u2->id))->toHaveCount(1);
    expect(app(NotificationService::class)->listForUser($u1->id)[0]->type)->toBe('match_result_set');
});

test('a suspended match rejects setResult', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Suspend blocks result', 'structure' => 'generic', 'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos', 'status' => 'active', 'createdBy' => (string) Str::uuid(), 'config' => [],
    ]);
    [, $p1] = makeTournamentUser('trigger-s1@test.local');
    [, $p2] = makeTournamentUser('trigger-s2@test.local');
    $pp1 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $p1->id]);
    $pp2 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $p2->id]);
    $match = TournamentMatch::create([
        'tournamentId' => $tournament->id, 'round' => 1,
        'group' => json_encode(['team1' => [$pp1->id], 'team2' => [$pp2->id]]),
        'status' => 'suspended',
    ]);

    expect(fn () => app(TournamentService::class)->setResult($match, ['sets' => [['t1' => 6, 't2' => 4], ['t1' => 6, 't2' => 3]]]))
        ->toThrow(ApiException::class);
});

test('suspending an active tournament notifies all participants and blocks a second suspend', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Suspend tournament test', 'structure' => 'generic', 'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos', 'status' => 'active', 'createdBy' => (string) Str::uuid(), 'config' => [],
    ]);
    [$u1, $p1] = makeTournamentUser('trigger-t1@test.local');
    [$u2, $p2] = makeTournamentUser('trigger-t2@test.local');
    TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $p1->id]);
    TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $p2->id]);

    $updated = app(TournamentService::class)->suspendTournament($tournament);

    expect($updated->status)->toBe('suspended');
    expect(app(NotificationService::class)->listForUser($u1->id)[0]->type)->toBe('tournament_suspended');
    expect(app(NotificationService::class)->listForUser($u2->id))->toHaveCount(1);

    expect(fn () => app(TournamentService::class)->suspendTournament($updated))->toThrow(ApiException::class);
});

test('a draft tournament cannot be suspended', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Draft cant suspend', 'structure' => 'generic', 'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos', 'status' => 'draft', 'createdBy' => (string) Str::uuid(), 'config' => [],
    ]);

    expect(fn () => app(TournamentService::class)->suspendTournament($tournament))->toThrow(ApiException::class);
});

test('resuming a suspended tournament brings it back to active and notifies', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Resume tournament test', 'structure' => 'generic', 'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos', 'status' => 'active', 'createdBy' => (string) Str::uuid(), 'config' => [],
    ]);
    [$u1, $p1] = makeTournamentUser('trigger-res1@test.local');
    TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $p1->id]);

    $service = app(TournamentService::class);
    $suspended = $service->suspendTournament($tournament);
    $resumed = $service->resumeTournament($suspended);

    expect($resumed->status)->toBe('active');
    $notifications = app(NotificationService::class)->listForUser($u1->id);
    expect(collect($notifications)->pluck('type')->all())->toEqualCanonicalizing(['tournament_suspended', 'tournament_resumed']);

    expect(fn () => $service->resumeTournament($resumed))->toThrow(ApiException::class);
});

test('suspending and resuming a match notifies its participants and round-trips status correctly', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Suspend match test', 'structure' => 'generic', 'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos', 'status' => 'active', 'createdBy' => (string) Str::uuid(), 'config' => [],
    ]);
    [$u1, $p1] = makeTournamentUser('trigger-m1@test.local');
    [$u2, $p2] = makeTournamentUser('trigger-m2@test.local');
    $pp1 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $p1->id]);
    $pp2 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $p2->id]);
    $match = TournamentMatch::create([
        'tournamentId' => $tournament->id, 'round' => 1,
        'group' => json_encode(['team1' => [$pp1->id], 'team2' => [$pp2->id]]),
        'status' => 'pending',
    ]);

    $service = app(TournamentService::class);
    $suspended = $service->suspendMatch($match);
    expect($suspended->status)->toBe('suspended');

    $resumed = $service->resumeMatch($suspended);
    expect($resumed->status)->toBe('pending');

    expect(collect(app(NotificationService::class)->listForUser($u1->id))->pluck('type')->all())
        ->toEqualCanonicalizing(['match_suspended', 'match_resumed']);
    expect(app(NotificationService::class)->listForUser($u2->id))->toHaveCount(2);
});

test('a completed match cannot be suspended', function () {
    $tournament = TournamentInstance::create([
        'name' => 'Completed cant suspend', 'structure' => 'generic', 'pairingSystem' => 'individual',
        'matchFormat' => 'sets_completos', 'status' => 'active', 'createdBy' => (string) Str::uuid(), 'config' => [],
    ]);
    [, $p1] = makeTournamentUser('trigger-c1@test.local');
    [, $p2] = makeTournamentUser('trigger-c2@test.local');
    $pp1 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $p1->id]);
    $pp2 = TournamentParticipant::create(['tournamentId' => $tournament->id, 'playerId' => $p2->id]);
    $match = TournamentMatch::create([
        'tournamentId' => $tournament->id, 'round' => 1,
        'group' => json_encode(['team1' => [$pp1->id], 'team2' => [$pp2->id]]),
        'status' => 'completed', 'result' => ['outcome' => 'team1', 'played' => true, 'completedAt' => now()->toIso8601String()],
    ]);

    expect(fn () => app(TournamentService::class)->suspendMatch($match))->toThrow(ApiException::class);
});
