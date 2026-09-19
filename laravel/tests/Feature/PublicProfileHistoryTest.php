<?php

use App\Models\TournamentMatch;

/** a+b vs c+d, one completed 2-0 for team1 and one still pending. */
function historySetup(string $prefix): array
{
    $t = parityTournament(['name' => 'Liga historial', 'status' => 'active']);
    $u = [];
    $pl = [];
    $pp = [];

    foreach (['a', 'b', 'c', 'd'] as $k) {
        [$u[$k], $pl[$k]] = parityUser("{$prefix}-{$k}@test.local");
        $pp[$k] = parityEnroll($t, $pl[$k]);
    }

    $done = parityMatch($t, [$pp['a'], $pp['b']], [$pp['c'], $pp['d']], 'completed');
    $done->update(['result' => ['outcome' => 'team1', 'played' => true, 'sets' => [['t1' => 6, 't2' => 4], ['t1' => 6, 't2' => 3]], 'completedAt' => now()->subDay()->toIso8601String()]]);
    parityMatch($t, [$pp['a'], $pp['c']], [$pp['b'], $pp['d']], 'pending');

    return [$t, $u, $pl, $done];
}

test('the public profile lists finished tournament matches, from the viewed player\'s point of view', function () {
    [, $u, $pl, $done] = historySetup('ph1');
    $pl['a']->update(['isPublic' => true, 'showMatches' => true]);

    $res = $this->getJson("/api/players/{$pl['a']->id}/public")->assertOk();

    $matches = $res->json('matches');
    expect($matches)->toHaveCount(1);   // the pending one is not history
    expect($matches[0])->toMatchArray(['id' => $done->id, 'isTeam1' => true, 'tournamentName' => 'Liga historial', 'status' => 'completed']);
    expect($matches[0]['myTeam'])->toBe(['Ph1-a', 'Ph1-b']);
    expect($matches[0]['opponentTeam'])->toBe(['Ph1-c', 'Ph1-d']);
    expect($matches[0]['result']['outcome'])->toBe('team1');
});

test('the public history never leaks private bookkeeping', function () {
    [, , $pl] = historySetup('ph2');
    $pl['a']->update(['isPublic' => true, 'showMatches' => true]);

    $row = $this->getJson("/api/players/{$pl['a']->id}/public")->json('matches.0');

    foreach (['valoredPlayerIds', 'proposedByParticipant', 'confirmedByParticipants', 'expiresAt', 'resultMode'] as $private) {
        expect($row)->not->toHaveKey($private);
    }
});

test('showMatches=false hides the history from strangers but not from the owner', function () {
    [, $u, $pl] = historySetup('ph3');
    $pl['a']->update(['isPublic' => true, 'showMatches' => false]);

    $this->getJson("/api/players/{$pl['a']->id}/public")->assertOk()->assertJsonPath('matches', []);
    $this->getJson("/api/players/{$pl['a']->id}/public", parityAuth($u['a']))->assertOk()->assertJsonCount(1, 'matches');
    // another player is a stranger too
    $this->getJson("/api/players/{$pl['a']->id}/public", parityAuth($u['b']))->assertOk()->assertJsonPath('matches', []);
});

test('history is newest first', function () {
    [$t, , $pl, $first] = historySetup('ph4');
    $pl['a']->update(['isPublic' => true, 'showMatches' => true]);
    $second = TournamentMatch::where('tournamentId', $t->id)->where('status', 'pending')->first();
    $second->update(['status' => 'completed', 'result' => ['outcome' => 'team2', 'played' => true, 'sets' => [['t1' => 1, 't2' => 6], ['t1' => 2, 't2' => 6]], 'completedAt' => now()->toIso8601String()]]);

    $ids = collect($this->getJson("/api/players/{$pl['a']->id}/public")->json('matches'))->pluck('id')->all();

    expect($ids)->toBe([$second->id, $first->id]);
});

test('the tournament detail names the referee instead of exposing only a uuid', function () {
    [$owner] = parityUser('ph5-owner@test.local');
    [$ref] = parityUser('ph5-ref@test.local');
    $t = parityTournament(['responsableId' => $owner->id, 'resultMode' => 'arbitro', 'arbitroId' => $ref->id]);

    $this->getJson("/api/tournament-instances/{$t->id}", parityAuth($owner))
        ->assertOk()
        ->assertJsonPath('arbitro.id', $ref->id)
        ->assertJsonPath('arbitro.name', 'Ph5-ref');
});

test('player search exposes userId — the settings screen needs it to pick a referee (arbitroId is a User.id)', function () {
    [$admin] = parityUser('ps-admin@test.local', \App\Enums\Role::SUPER_ADMIN);
    [$refUser, $ref] = parityUser('ps-zoe@test.local');

    $rows = $this->getJson('/api/players/search?q=Ps-zoe', parityAuth($admin))->assertOk()->json();

    expect(collect($rows)->firstWhere('id', $ref->id)['userId'])->toBe($refUser->id);
});
