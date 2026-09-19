<?php

use App\Models\Club;
use App\Models\Court;
use App\Models\TournamentMatch;
use App\Models\TournamentParticipant;

function lifecycleOwner(string $email, array $tournament = []): array
{
    [$owner] = parityUser($email);
    $t = parityTournament(array_merge(['responsableId' => $owner->id], $tournament));

    return [$owner, $t];
}

// ── max participants ────────────────────────────────────────────────

test('lowering the cap below the roster demands who to remove', function () {
    [$owner, $t] = lifecycleOwner('lc1-owner@test.local', ['maxParticipants' => 6]);
    $ps = [];
    foreach (range(1, 4) as $i) {
        [, $p] = parityUser("lc1-p{$i}@test.local");
        $ps[] = parityEnroll($t, $p);
    }

    $this->putJson("/api/tournament-instances/{$t->id}/max-participants", ['maxParticipants' => 2], parityAuth($owner))
        ->assertStatus(400);
    expect(TournamentParticipant::where('tournamentId', $t->id)->count())->toBe(4);

    $this->putJson("/api/tournament-instances/{$t->id}/max-participants", ['maxParticipants' => 2, 'participantsToRemove' => [$ps[0]->id, $ps[1]->id]], parityAuth($owner))
        ->assertOk()->assertJsonPath('maxParticipants', 2);
    expect(TournamentParticipant::where('tournamentId', $t->id)->count())->toBe(2);
});

test('changing the cap after matches exist wipes them and returns to draft', function () {
    [$owner, $t] = lifecycleOwner('lc2-owner@test.local', ['status' => 'active']);
    [, $a] = parityUser('lc2-a@test.local');
    [, $b] = parityUser('lc2-b@test.local');
    $pa = parityEnroll($t, $a);
    $pb = parityEnroll($t, $b);
    parityMatch($t, [$pa], [$pb]);

    $this->putJson("/api/tournament-instances/{$t->id}/max-participants", ['maxParticipants' => 10], parityAuth($owner))
        ->assertOk()->assertJsonPath('status', 'draft');
    expect(TournamentMatch::where('tournamentId', $t->id)->count())->toBe(0);
});

test('the cap can be cleared with null, and a stranger cannot change it', function () {
    [$owner, $t] = lifecycleOwner('lc3-owner@test.local', ['maxParticipants' => 4]);
    [$stranger] = parityUser('lc3-stranger@test.local');

    $this->putJson("/api/tournament-instances/{$t->id}/max-participants", ['maxParticipants' => null], parityAuth($stranger))->assertForbidden();
    $this->putJson("/api/tournament-instances/{$t->id}/max-participants", ['maxParticipants' => null], parityAuth($owner))
        ->assertOk()->assertJsonPath('maxParticipants', null);
});

test('the generic update refuses a cap below the current roster', function () {
    [$owner, $t] = lifecycleOwner('lc3b-owner@test.local');
    foreach (range(1, 3) as $i) {
        [, $p] = parityUser("lc3b-p{$i}@test.local");
        parityEnroll($t, $p);
    }

    $this->putJson("/api/tournament-instances/{$t->id}", ['maxParticipants' => 2], parityAuth($owner))->assertStatus(400);
    $this->putJson("/api/tournament-instances/{$t->id}", ['maxParticipants' => 8], parityAuth($owner))->assertOk();
});

// ── archive / reset / delete ────────────────────────────────────────

test('archive toggles archived and completed, and refuses drafts', function () {
    [$owner, $t] = lifecycleOwner('lc4-owner@test.local');

    $this->putJson("/api/tournament-instances/{$t->id}/archive", [], parityAuth($owner))->assertStatus(400);

    $t->update(['status' => 'active']);
    $this->putJson("/api/tournament-instances/{$t->id}/archive", [], parityAuth($owner))->assertOk()->assertJsonPath('status', 'archived');
    $this->putJson("/api/tournament-instances/{$t->id}/archive", [], parityAuth($owner))->assertOk()->assertJsonPath('status', 'completed');
});

test('reset wipes matches and keeps players by default; keepPlayers=false clears the roster', function () {
    [$owner, $t] = lifecycleOwner('lc5-owner@test.local', ['status' => 'active']);
    [, $a] = parityUser('lc5-a@test.local');
    [, $b] = parityUser('lc5-b@test.local');
    $pa = parityEnroll($t, $a);
    $pb = parityEnroll($t, $b);
    parityMatch($t, [$pa], [$pb]);

    $this->postJson("/api/tournament-instances/{$t->id}/reset", [], parityAuth($owner))->assertOk();
    expect($t->fresh()->status)->toBe('draft');
    expect(TournamentMatch::where('tournamentId', $t->id)->count())->toBe(0);
    expect(TournamentParticipant::where('tournamentId', $t->id)->count())->toBe(2);

    $this->postJson("/api/tournament-instances/{$t->id}/reset", ['keepPlayers' => false], parityAuth($owner))->assertOk();
    expect(TournamentParticipant::where('tournamentId', $t->id)->count())->toBe(0);
});

test('deleting a tournament with played matches needs explicit confirmation', function () {
    [$owner, $t] = lifecycleOwner('lc6-owner@test.local', ['status' => 'active']);
    [, $a] = parityUser('lc6-a@test.local');
    [, $b] = parityUser('lc6-b@test.local');
    $pa = parityEnroll($t, $a);
    $pb = parityEnroll($t, $b);
    parityMatch($t, [$pa], [$pb], 'completed');
    parityMatch($t, [$pa], [$pb], 'pending');

    $this->deleteJson("/api/tournament-instances/{$t->id}", [], parityAuth($owner))
        ->assertStatus(409)
        ->assertJsonPath('requiresConfirmation', true)
        ->assertJsonPath('playedCount', 1)
        ->assertJsonPath('totalMatches', 2);
    expect(\App\Models\TournamentInstance::find($t->id))->not->toBeNull();

    $this->deleteJson("/api/tournament-instances/{$t->id}", ['confirmed' => true], parityAuth($owner))->assertOk();
    expect(\App\Models\TournamentInstance::find($t->id))->toBeNull();
});

test('a tournament with nothing played deletes without confirmation', function () {
    [$owner, $t] = lifecycleOwner('lc7-owner@test.local');

    $this->deleteJson("/api/tournament-instances/{$t->id}", [], parityAuth($owner))->assertOk();
});

// ── result mode ─────────────────────────────────────────────────────

test('switching the result mode drops pending proposals but keeps completed matches', function () {
    [$owner, $t] = lifecycleOwner('lc8-owner@test.local', ['status' => 'active', 'resultMode' => 'jugador']);
    [, $a] = parityUser('lc8-a@test.local');
    [, $b] = parityUser('lc8-b@test.local');
    $pa = parityEnroll($t, $a);
    $pb = parityEnroll($t, $b);
    $pending = parityMatch($t, [$pa], [$pb]);
    $pending->update(['proposedByParticipant' => $pa->id, 'confirmedByParticipants' => [$pa->id], 'expiresAt' => now()->addDay()]);
    $done = parityMatch($t, [$pa], [$pb], 'completed');
    $done->update(['proposedByParticipant' => $pa->id]);

    $this->putJson("/api/tournament-instances/{$t->id}/result-mode", ['resultMode' => 'creador'], parityAuth($owner))->assertOk();

    $pending->refresh();
    expect($pending->proposedByParticipant)->toBeNull()->and($pending->expiresAt)->toBeNull();
    expect($done->fresh()->proposedByParticipant)->toBe($pa->id);
});

test('arbitro mode requires an arbitro, and the mode must be one of the three', function () {
    [$owner, $t] = lifecycleOwner('lc9-owner@test.local');
    [$ref] = parityUser('lc9-ref@test.local');

    $this->putJson("/api/tournament-instances/{$t->id}/result-mode", ['resultMode' => 'arbitro'], parityAuth($owner))->assertStatus(400);
    $this->putJson("/api/tournament-instances/{$t->id}/result-mode", ['resultMode' => 'cualquiera'], parityAuth($owner))->assertStatus(400);
    $this->putJson("/api/tournament-instances/{$t->id}/result-mode", ['resultMode' => 'arbitro', 'arbitroId' => $ref->id], parityAuth($owner))
        ->assertOk()->assertJsonPath('arbitroId', $ref->id);
    // Leaving arbitro mode forgets the referee.
    $this->putJson("/api/tournament-instances/{$t->id}/result-mode", ['resultMode' => 'creador'], parityAuth($owner))
        ->assertOk()->assertJsonPath('arbitroId', null);
});

test('creating in arbitro mode without an arbitro is refused', function () {
    [$admin] = parityUser('lc10-admin@test.local', \App\Enums\Role::SUPER_ADMIN);
    \App\Models\TournamentType::firstOrCreate(['key' => 'round_robin_generic'], [
        'label' => 'RR', 'engine' => 'generic', 'is_active' => true,
        'default_config_schema' => ['matchGenerator' => ['type' => 'round_robin']],
    ]);

    $this->postJson('/api/tournament-instances', ['name' => 'X', 'typeKey' => 'round_robin_generic', 'resultMode' => 'arbitro'], parityAuth($admin))->assertStatus(400);
});

// ── courts ──────────────────────────────────────────────────────────

test('tournament courts must belong to the tournament club', function () {
    [$owner] = parityUser('lc11-owner@test.local');
    $club = Club::create(['name' => 'Club A', 'slug' => 'club-a-lc11']);
    $other = Club::create(['name' => 'Club B', 'slug' => 'club-b-lc11']);
    $mine = Court::create(['clubId' => $club->id, 'name' => 'Pista 1']);
    $foreign = Court::create(['clubId' => $other->id, 'name' => 'Pista X']);
    $t = parityTournament(['responsableId' => $owner->id, 'clubId' => $club->id]);

    $this->putJson("/api/tournament-instances/{$t->id}/courts", ['courtIds' => [$mine->id, $foreign->id]], parityAuth($owner))->assertStatus(400);
    $this->putJson("/api/tournament-instances/{$t->id}/courts", ['courtIds' => [$mine->id]], parityAuth($owner))->assertOk()->assertJsonCount(1);
    $this->getJson("/api/tournament-instances/{$t->id}/courts", parityAuth($owner))->assertOk()->assertJsonPath('0.name', 'Pista 1');
    $this->getJson("/api/tournament-instances/{$t->id}", parityAuth($owner))->assertOk()->assertJsonPath('courts.0.court.name', 'Pista 1');
});
