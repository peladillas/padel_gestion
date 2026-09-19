<?php

use App\Models\TournamentParticipant;
use App\Services\Tournament\TournamentService;

function pairSetup(string $prefix): array
{
    $t = parityTournament();
    [$ua, $a] = parityUser("{$prefix}-a@test.local");
    [$ub, $b] = parityUser("{$prefix}-b@test.local");
    [$uc, $c] = parityUser("{$prefix}-c@test.local");
    $pa = parityEnroll($t, $a);
    $pb = parityEnroll($t, $b);
    $pc = parityEnroll($t, $c);

    return [$t, [$ua, $a, $pa], [$ub, $b, $pb], [$uc, $c, $pc]];
}

test('request then accept forms a confirmed pair on both rows', function () {
    [$t, [$ua, $a], [$ub, $b]] = pairSetup('pr1');

    $this->postJson("/api/tournament-instances/{$t->id}/pair-request", ['toPlayerId' => $b->id], parityAuth($ua))->assertOk();

    $mine = TournamentParticipant::where('playerId', $a->id)->first();
    expect($mine->status)->toBe('pair_requested')->and($mine->partnerId)->toBe($b->id);

    $this->putJson("/api/tournament-instances/{$t->id}/pair-request/accept", ['fromPlayerId' => $a->id], parityAuth($ub))->assertOk();

    $ra = TournamentParticipant::where('playerId', $a->id)->first();
    $rb = TournamentParticipant::where('playerId', $b->id)->first();
    expect($ra->status)->toBe('active')->and($ra->partnerId)->toBe($b->id);
    expect($rb->status)->toBe('active')->and($rb->partnerId)->toBe($a->id);
});

test('the requested player is notified', function () {
    [$t, [$ua], [$ub, $b]] = pairSetup('pr2');

    $this->postJson("/api/tournament-instances/{$t->id}/pair-request", ['toPlayerId' => $b->id], parityAuth($ua))->assertOk();

    $types = collect(app(\App\Services\NotificationService::class)->listForUser($ub->id))->pluck('type');
    expect($types)->toContain('pair_requested');
});

test('a pending request does NOT count as a pair when starting', function () {
    [$t, [$ua], [, $b], [, $c]] = pairSetup('pr3');

    $this->postJson("/api/tournament-instances/{$t->id}/pair-request", ['toPlayerId' => $b->id], parityAuth($ua))->assertOk();

    // Odd roster, one unanswered request: nobody is confirmed, so it must not start.
    expect(fn () => app(TournamentService::class)->startTournament($t->fresh()))
        ->toThrow(\App\Exceptions\ApiException::class, 'Sin pareja');
});

test('reject and cancel both send the requester back to unpaired', function () {
    [$t, [$ua, $a], [$ub, $b], [$uc, $c]] = pairSetup('pr4');

    $this->postJson("/api/tournament-instances/{$t->id}/pair-request", ['toPlayerId' => $b->id], parityAuth($ua))->assertOk();
    $this->putJson("/api/tournament-instances/{$t->id}/pair-request/reject", ['fromPlayerId' => $a->id], parityAuth($ub))->assertOk();
    $ra = TournamentParticipant::where('playerId', $a->id)->first();
    expect($ra->status)->toBe('active')->and($ra->partnerId)->toBeNull();

    $this->postJson("/api/tournament-instances/{$t->id}/pair-request", ['toPlayerId' => $c->id], parityAuth($ua))->assertOk();
    $this->deleteJson("/api/tournament-instances/{$t->id}/pair-request", [], parityAuth($ua))->assertOk();
    $ra->refresh();
    expect($ra->status)->toBe('active')->and($ra->partnerId)->toBeNull();

    $this->deleteJson("/api/tournament-instances/{$t->id}/pair-request", [], parityAuth($ua))->assertNotFound();
});

test('you cannot accept a request that was not addressed to you', function () {
    [$t, [$ua, $a], [, $b], [$uc]] = pairSetup('pr5');

    $this->postJson("/api/tournament-instances/{$t->id}/pair-request", ['toPlayerId' => $b->id], parityAuth($ua))->assertOk();

    $this->putJson("/api/tournament-instances/{$t->id}/pair-request/accept", ['fromPlayerId' => $a->id], parityAuth($uc))->assertNotFound();
});

test('pair requests are only for fixed_pairs and only while draft', function () {
    [$t, [$ua], [, $b]] = pairSetup('pr6');

    $t->update(['status' => 'active']);
    $this->postJson("/api/tournament-instances/{$t->id}/pair-request", ['toPlayerId' => $b->id], parityAuth($ua))->assertStatus(400);

    $t->update(['status' => 'draft', 'pairingSystem' => 'individual']);
    $this->postJson("/api/tournament-instances/{$t->id}/pair-request", ['toPlayerId' => $b->id], parityAuth($ua))->assertStatus(400);
});

test('you cannot request yourself or someone who is not enrolled', function () {
    [$t, [$ua, $a]] = pairSetup('pr7');
    [, $outsider] = parityUser('pr7-out@test.local');

    $this->postJson("/api/tournament-instances/{$t->id}/pair-request", ['toPlayerId' => $a->id], parityAuth($ua))->assertStatus(400);
    $this->postJson("/api/tournament-instances/{$t->id}/pair-request", ['toPlayerId' => $outsider->id], parityAuth($ua))->assertNotFound();
});

test('an admin pairing overrides an unanswered request and leaves no dangling partner', function () {
    [$t, [$ua, $a, $pa], [, $b, $pb], [, $c, $pc]] = pairSetup('pr8');

    // a asked b, then the admin pairs b with c directly.
    $this->postJson("/api/tournament-instances/{$t->id}/pair-request", ['toPlayerId' => $b->id], parityAuth($ua))->assertOk();
    app(TournamentService::class)->pairParticipants($t, $pb->id, $pc->id);

    $ra = TournamentParticipant::find($pa->id);
    expect($ra->status)->toBe('active')->and($ra->partnerId)->toBeNull();
    expect(TournamentParticipant::find($pb->id)->partnerId)->toBe($c->id);
});

test('removing the player someone asked resets the requester', function () {
    [$t, [$ua, $a, $pa], [, $b, $pb]] = pairSetup('pr9');

    $this->postJson("/api/tournament-instances/{$t->id}/pair-request", ['toPlayerId' => $b->id], parityAuth($ua))->assertOk();
    app(TournamentService::class)->removeParticipant($t, $pb->id);

    $ra = TournamentParticipant::find($pa->id);
    expect($ra->status)->toBe('active')->and($ra->partnerId)->toBeNull();
});

test('auto-pair discards pending requests before pairing', function () {
    [$t, [$ua], [, $b]] = pairSetup('pr10');
    [, $d] = parityUser('pr10-d@test.local');
    parityEnroll($t, $d);

    $this->postJson("/api/tournament-instances/{$t->id}/pair-request", ['toPlayerId' => $b->id], parityAuth($ua))->assertOk();
    $r = app(TournamentService::class)->autoPairParticipants($t);

    expect($r['pairs'])->toBe(2);
    expect(TournamentParticipant::where('tournamentId', $t->id)->where('status', 'pair_requested')->count())->toBe(0);
    expect(TournamentParticipant::where('tournamentId', $t->id)->whereNull('partnerId')->count())->toBe(0);
});
