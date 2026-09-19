<?php

use App\Models\TournamentMatch;
use App\Services\Tournament\PlayerResultService;

const WIN_2_0 = [['t1' => 6, 't2' => 4], ['t1' => 6, 't2' => 3]];

/** Two pairs (a+b vs c+d) in a 'jugador'-mode active tournament with one pending match. */
function resultSetup(string $prefix, string $mode = 'jugador'): array
{
    $t = parityTournament(['status' => 'active', 'resultMode' => $mode]);
    $users = [];
    $participants = [];

    foreach (['a', 'b', 'c', 'd'] as $k) {
        [$u, $p] = parityUser("{$prefix}-{$k}@test.local");
        $users[$k] = $u;
        $participants[$k] = parityEnroll($t, $p);
    }

    $match = parityMatch($t, [$participants['a'], $participants['b']], [$participants['c'], $participants['d']]);

    return [$t, $users, $participants, $match];
}

test('a player proposes, the rival team confirms, and the match completes with the derived outcome', function () {
    [$t, $u, $p, $m] = resultSetup('rf1');

    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => WIN_2_0, 'participantId' => $p['a']->id], parityAuth($u['a']))->assertOk();

    $m->refresh();
    expect($m->status)->toBe('pending')
        ->and($m->result['status'])->toBe('pending')
        ->and($m->proposedByParticipant)->toBe($p['a']->id)
        ->and($m->expiresAt)->not->toBeNull();

    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/accept", ['participantId' => $p['c']->id], parityAuth($u['c']))->assertOk();

    $m->refresh();
    expect($m->status)->toBe('completed')
        ->and($m->result['outcome'])->toBe('team1')
        ->and($m->result['status'])->toBe('confirmed')
        ->and($m->result['played'])->toBeTrue()
        ->and($m->result['completedAt'])->not->toBeNull()
        ->and($m->expiresAt)->toBeNull();
});

test('players cannot propose unless the tournament is in jugador mode', function () {
    [$t, $u, $p, $m] = resultSetup('rf2', 'creador');

    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => WIN_2_0], parityAuth($u['a']))->assertForbidden();
});

test('an outsider or a mismatched participantId cannot propose', function () {
    [$t, $u, $p, $m] = resultSetup('rf3');
    [$outsider] = parityUser('rf3-out@test.local');

    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => WIN_2_0], parityAuth($outsider))->assertForbidden();
    // Claiming to be someone else's participant is rejected, not trusted.
    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => WIN_2_0, 'participantId' => $p['c']->id], parityAuth($u['a']))->assertForbidden();
});

test('an incomplete or invalid score is refused at proposal time', function () {
    [$t, $u, $p, $m] = resultSetup('rf4');

    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => [['t1' => 6, 't2' => 4]]], parityAuth($u['a']))
        ->assertStatus(400);
    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => [['t1' => 6, 't2' => 6], ['t1' => 6, 't2' => 3]]], parityAuth($u['a']))
        ->assertStatus(400);

    expect($m->fresh()->proposedByParticipant)->toBeNull();
});

test("the proposer's own partner cannot confirm it — only the rival team", function () {
    [$t, $u, $p, $m] = resultSetup('rf5');

    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => WIN_2_0], parityAuth($u['a']))->assertOk();

    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/accept", [], parityAuth($u['b']))->assertForbidden();
    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/reject", [], parityAuth($u['b']))->assertForbidden();
    expect($m->fresh()->status)->toBe('pending');
});

test('rejecting clears the proposal so a new one can be made', function () {
    [$t, $u, $p, $m] = resultSetup('rf6');

    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => WIN_2_0], parityAuth($u['a']))->assertOk();
    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/reject", ['reason' => 'fue 6-2'], parityAuth($u['d']))->assertOk();

    $m->refresh();
    expect($m->status)->toBe('pending')
        ->and($m->proposedByParticipant)->toBeNull()
        ->and($m->result['status'])->toBe('rejected')
        ->and($m->result['reason'])->toBe('fue 6-2')
        ->and($m->expiresAt)->toBeNull();

    // Nothing left to accept…
    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/accept", [], parityAuth($u['c']))->assertStatus(400);
    // …but the other side may now propose its own version.
    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => [['t1' => 2, 't2' => 6], ['t1' => 3, 't2' => 6]]], parityAuth($u['c']))->assertOk();
});

test('the rival team is notified of the proposal and the proposers of the outcome', function () {
    [$t, $u, $p, $m] = resultSetup('rf7');
    $notifs = app(\App\Services\NotificationService::class);

    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => WIN_2_0], parityAuth($u['a']))->assertOk();
    expect(collect($notifs->listForUser($u['c']->id))->pluck('type'))->toContain('result_proposed');
    expect(collect($notifs->listForUser($u['a']->id))->pluck('type'))->not->toContain('result_proposed');

    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/accept", [], parityAuth($u['c']))->assertOk();
    expect(collect($notifs->listForUser($u['a']->id))->pluck('type'))->toContain('result_accepted');
});

test('a proposal nobody answers auto-confirms after 24h', function () {
    [$t, $u, $p, $m] = resultSetup('rf8');

    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => WIN_2_0], parityAuth($u['a']))->assertOk();

    // Still inside the window: untouched.
    expect(app(PlayerResultService::class)->autoConfirmExpired())->toBe(0);
    expect($m->fresh()->status)->toBe('pending');

    TournamentMatch::whereKey($m->id)->update(['expiresAt' => now()->subMinute()]);

    expect(app(PlayerResultService::class)->autoConfirmExpired())->toBe(1);
    $m->refresh();
    expect($m->status)->toBe('completed')->and($m->result['outcome'])->toBe('team1');
});

test('the scheduled command confirms expired proposals', function () {
    [$t, $u, $p, $m] = resultSetup('rf9');
    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => WIN_2_0], parityAuth($u['a']))->assertOk();
    TournamentMatch::whereKey($m->id)->update(['expiresAt' => now()->subHour()]);

    $this->artisan('tournaments:auto-confirm')->expectsOutputToContain('1')->assertSuccessful();

    expect($m->fresh()->status)->toBe('completed');
});

test('a suspended match does not auto-confirm', function () {
    [$t, $u, $p, $m] = resultSetup('rf10');
    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => WIN_2_0], parityAuth($u['a']))->assertOk();
    TournamentMatch::whereKey($m->id)->update(['expiresAt' => now()->subHour(), 'status' => 'suspended']);

    expect(app(PlayerResultService::class)->autoConfirmExpired())->toBe(0);
    expect($m->fresh()->status)->toBe('suspended');
});

test("a player's my-matches read auto-confirms and exposes the proposal fields", function () {
    [$t, $u, $p, $m] = resultSetup('rf11');
    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => WIN_2_0], parityAuth($u['a']))->assertOk();

    $row = $this->getJson('/api/tournament-instances/my-matches', parityAuth($u['c']))->assertOk()->json('0');
    expect($row['proposedByParticipant'])->toBe($p['a']->id)
        ->and($row['confirmedByParticipants'])->toBe([$p['a']->id])
        ->and($row['expiresAt'])->not->toBeNull();

    TournamentMatch::whereKey($m->id)->update(['expiresAt' => now()->subMinute()]);

    $row = $this->getJson('/api/tournament-instances/my-matches', parityAuth($u['c']))->assertOk()->json('0');
    expect($row['status'])->toBe('completed');
});

test('an admin result overrides a pending proposal and clears its bookkeeping', function () {
    [$t, $u, $p, $m] = resultSetup('rf12');
    [$admin] = parityUser('rf12-admin@test.local');
    $t->update(['responsableId' => $admin->id]);

    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/propose", ['sets' => WIN_2_0], parityAuth($u['a']))->assertOk();
    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/result", ['sets' => [['t1' => 1, 't2' => 6], ['t1' => 2, 't2' => 6]]], parityAuth($admin))->assertOk();

    $m->refresh();
    expect($m->status)->toBe('completed')
        ->and($m->result['outcome'])->toBe('team2')
        ->and($m->proposedByParticipant)->toBeNull()
        ->and($m->expiresAt)->toBeNull();
});

test('the assigned referee — and only them — may register the result in arbitro mode', function () {
    [$t, $u, $p, $m] = resultSetup('rf13', 'arbitro');
    [$referee] = parityUser('rf13-ref@test.local');
    $t->update(['arbitroId' => $referee->id]);

    $payload = ['sets' => WIN_2_0];
    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/result", $payload, parityAuth($u['a']))->assertForbidden();
    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/result", $payload, parityAuth($referee))->assertOk();
    expect($m->fresh()->status)->toBe('completed');
});

test('a referee is not honoured once the mode is no longer arbitro', function () {
    [$t, $u, $p, $m] = resultSetup('rf14', 'creador');
    [$referee] = parityUser('rf14-ref@test.local');
    $t->update(['arbitroId' => $referee->id]);

    $this->putJson("/api/tournament-instances/{$t->id}/matches/{$m->id}/result", ['sets' => WIN_2_0], parityAuth($referee))->assertForbidden();
});
