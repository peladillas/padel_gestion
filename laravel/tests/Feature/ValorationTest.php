<?php

use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\TournamentMatch;
use App\Models\TournamentParticipant;
use App\Models\User;
use App\Models\Valoration;
use App\Services\ValorationService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Sets up a 2v2 fixed_pairs match: team1 = [p1 + partner], team2 =
 * [rival1 + rival2]. Returns the 4 Player models (p1, partner, rival1,
 * rival2) plus the TournamentMatch, so tests can drive completedAt/
 * played directly on the match without going through setResult().
 */
function makeFixedPairsMatch(array $resultOverrides = []): array
{
    $tournament = TournamentInstance::create([
        'name' => 'Valoration test tournament',
        'structure' => 'generic',
        'pairingSystem' => 'fixed_pairs',
        'matchFormat' => 'sets_completos',
        'createdBy' => (string) Str::uuid(),
        'config' => [],
    ]);

    $players = [];
    foreach (['p1', 'partner', 'rival1', 'rival2'] as $key) {
        $user = User::create([
            'email' => "val-{$key}-".Str::random(6).'@test.local',
            'password' => Hash::make('x'),
            'username' => 'val-'.Str::random(8),
            'isActivated' => true,
            'role' => Role::PLAYER,
        ]);
        $players[$key] = Player::create(['userId' => $user->id, 'name' => ucfirst($key), 'level' => 1]);
    }

    $participants = [];
    foreach ($players as $key => $player) {
        $participants[$key] = TournamentParticipant::create([
            'tournamentId' => $tournament->id,
            'playerId' => $player->id,
        ]);
    }

    $participants['p1']->update(['partnerId' => $players['partner']->id]);
    $participants['partner']->update(['partnerId' => $players['p1']->id]);
    $participants['rival1']->update(['partnerId' => $players['rival2']->id]);
    $participants['rival2']->update(['partnerId' => $players['rival1']->id]);

    $match = TournamentMatch::create([
        'tournamentId' => $tournament->id,
        'round' => 1,
        'group' => json_encode([
            'team1' => [$participants['p1']->id, $participants['partner']->id],
            'team2' => [$participants['rival1']->id, $participants['rival2']->id],
        ]),
        'status' => 'completed',
        'result' => array_merge([
            'outcome' => 'team1',
            'played' => true,
            'completedAt' => now()->toIso8601String(),
        ], $resultOverrides),
    ]);

    return [$players, $match];
}

test('pending lists every other participant, including your own partner, not just the rival', function () {
    [$players, $match] = makeFixedPairsMatch();

    $pending = app(ValorationService::class)->pending($players['p1']);

    expect($pending)->toHaveCount(1);
    $names = collect($pending[0]['playersToRate'])->pluck('name')->all();
    expect($names)->toEqualCanonicalizing(['Partner', 'Rival1', 'Rival2']);
});

test('a match marked as not played never offers valorations, even though it has an outcome', function () {
    [$players, $match] = makeFixedPairsMatch(['played' => false]);

    $pending = app(ValorationService::class)->pending($players['p1']);
    expect($pending)->toBeEmpty();

    expect(fn () => app(ValorationService::class)->create($players['p1'], [
        'tournamentMatchId' => $match->id,
        'toPlayerId' => $players['rival1']->id,
        'ambiente' => 5,
    ]))->toThrow(ApiException::class);
});

test('the 7-day deadline is computed from result.completedAt, not the match createdAt', function () {
    [$players, $match] = makeFixedPairsMatch();

    // Backdate createdAt far beyond the window — completedAt (just now)
    // must be what governs the deadline, not this.
    $match->forceFill(['createdAt' => now()->subDays(30)])->save();

    $pending = app(ValorationService::class)->pending($players['p1']);
    expect($pending[0]['expired'])->toBeFalse();

    // Now push completedAt itself past the window.
    $result = $match->result;
    $result['completedAt'] = now()->subDays(8)->toIso8601String();
    $match->update(['result' => $result]);

    $pending = app(ValorationService::class)->pending($players['p1']);
    expect($pending[0]['expired'])->toBeTrue();

    expect(fn () => app(ValorationService::class)->create($players['p1'], [
        'tournamentMatchId' => $match->id,
        'toPlayerId' => $players['rival1']->id,
        'ambiente' => 5,
    ]))->toThrow(ApiException::class, 'El plazo de 7 días ha expirado');
});

test('you can rate your own doubles partner', function () {
    [$players, $match] = makeFixedPairsMatch();

    $val = app(ValorationService::class)->create($players['p1'], [
        'tournamentMatchId' => $match->id,
        'toPlayerId' => $players['partner']->id,
        'ambiente' => 5,
    ]);

    expect($val)->toBeArray();
    expect(Valoration::where('fromPlayerId', $players['p1']->id)->where('toPlayerId', $players['partner']->id)->exists())->toBeTrue();
});

test('rating the same player twice for the same match is rejected atomically, not via a racy pre-check', function () {
    [$players, $match] = makeFixedPairsMatch();

    app(ValorationService::class)->create($players['p1'], [
        'tournamentMatchId' => $match->id,
        'toPlayerId' => $players['rival1']->id,
        'smash' => 4,
    ]);

    expect(fn () => app(ValorationService::class)->create($players['p1'], [
        'tournamentMatchId' => $match->id,
        'toPlayerId' => $players['rival1']->id,
        'smash' => 2,
    ]))->toThrow(ApiException::class, 'Ya has valorado a este jugador en este partido');

    expect(Valoration::where('fromPlayerId', $players['p1']->id)->where('toPlayerId', $players['rival1']->id)->count())->toBe(1);
});

test('self-rating is rejected', function () {
    [$players, $match] = makeFixedPairsMatch();

    expect(fn () => app(ValorationService::class)->create($players['p1'], [
        'tournamentMatchId' => $match->id,
        'toPlayerId' => $players['p1']->id,
        'ambiente' => 5,
    ]))->toThrow(ApiException::class);
});

test('a non-participant cannot rate or be rated in the match', function () {
    [$players, $match] = makeFixedPairsMatch();

    $outsiderUser = User::create(['email' => 'val-outsider@test.local', 'password' => Hash::make('x'), 'username' => 'val-outsider', 'isActivated' => true, 'role' => Role::PLAYER]);
    $outsider = Player::create(['userId' => $outsiderUser->id, 'name' => 'Outsider', 'level' => 1]);

    expect(fn () => app(ValorationService::class)->create($outsider, [
        'tournamentMatchId' => $match->id,
        'toPlayerId' => $players['rival1']->id,
        'ambiente' => 5,
    ]))->toThrow(ApiException::class, 'No participaste en este partido');

    expect(fn () => app(ValorationService::class)->create($players['p1'], [
        'tournamentMatchId' => $match->id,
        'toPlayerId' => $outsider->id,
        'ambiente' => 5,
    ]))->toThrow(ApiException::class, 'El jugador valorado no participó');
});
