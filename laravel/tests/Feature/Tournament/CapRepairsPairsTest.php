<?php

use App\Models\TournamentParticipant;
use App\Services\Tournament\TournamentService;

/** Started fixed-pairs tournament (2 pairs), NO matches generated yet. */
function startedPairsNoMatches(string $prefix): array
{
    [$owner] = parityUser("{$prefix}-o@test.local");
    $t = parityTournament(['responsableId' => $owner->id, 'status' => 'active']);
    $ps = [];
    foreach (['a', 'b', 'c', 'd'] as $k) {
        [, $pl] = parityUser("{$prefix}-{$k}@test.local");
        $ps[$k] = parityEnroll($t, $pl);
    }
    $ps['a']->update(['partnerId' => $ps['b']->player->id]);
    $ps['b']->update(['partnerId' => $ps['a']->player->id]);
    $ps['c']->update(['partnerId' => $ps['d']->player->id]);
    $ps['d']->update(['partnerId' => $ps['c']->player->id]);

    return [$owner, $t, $ps];
}

test('removing a player from a STARTED pairs tournament (no matches yet) reopens it as a draft so pairs can be rebuilt', function () {
    [$owner, $t, $ps] = startedPairsNoMatches('cr1');

    $this->putJson("/api/tournament-instances/{$t->id}/max-participants", ['maxParticipants' => 3, 'participantsToRemove' => [$ps['a']->id]], parityAuth($owner))
        ->assertOk()->assertJsonPath('status', 'draft');

    // b lost their partner and the pairing tools work again.
    expect($ps['b']->fresh()->partnerId)->toBeNull();
    expect(fn () => app(TournamentService::class)->pairParticipants($t->fresh(), $ps['b']->id, $ps['c']->id))
        ->toThrow(\App\Exceptions\ApiException::class); // c is still paired with d → must unpair first, not blocked by status
    app(TournamentService::class)->unpairParticipant($t->fresh(), $ps['c']->id);
    app(TournamentService::class)->pairParticipants($t->fresh(), $ps['b']->id, $ps['c']->id);
    expect($ps['b']->fresh()->partnerId)->toBe($ps['c']->player->id);
});

test('raising the cap with nobody removed does not touch a running tournament', function () {
    [$owner, $t] = startedPairsNoMatches('cr2');

    $this->putJson("/api/tournament-instances/{$t->id}/max-participants", ['maxParticipants' => 8], parityAuth($owner))
        ->assertOk()->assertJsonPath('status', 'active');
});

test('individual tournaments do not need to go back to draft when someone is removed', function () {
    [$owner, $t, $ps] = startedPairsNoMatches('cr3');
    $t->update(['pairingSystem' => 'individual']);

    $this->putJson("/api/tournament-instances/{$t->id}/max-participants", ['maxParticipants' => 3, 'participantsToRemove' => [$ps['a']->id]], parityAuth($owner))
        ->assertOk()->assertJsonPath('status', 'active');
    expect(TournamentParticipant::where('tournamentId', $t->id)->count())->toBe(3);
});
