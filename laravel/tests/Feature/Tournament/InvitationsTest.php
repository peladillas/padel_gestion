<?php

use App\Enums\Role;
use App\Models\TournamentParticipant;

test('the invite landing info is public and exposes the enrolled count', function () {
    $t = parityTournament(['allowInvitations' => true, 'inviteToken' => str_repeat('a', 40), 'maxParticipants' => 8]);
    [, $p] = parityUser('inv-info@test.local');
    parityEnroll($t, $p);

    $this->getJson('/api/tournament-instances/join/'.str_repeat('a', 40))
        ->assertOk()
        ->assertJsonPath('name', 'Parity test')
        ->assertJsonPath('_count.participants', 1)
        ->assertJsonPath('maxParticipants', 8);
});

test('an unknown or disabled invite token is a 404, not a 500', function () {
    $this->getJson('/api/tournament-instances/join/'.str_repeat('z', 40))->assertNotFound();

    parityTournament(['allowInvitations' => false, 'inviteToken' => str_repeat('b', 40)]);
    $this->getJson('/api/tournament-instances/join/'.str_repeat('b', 40))->assertNotFound();
});

test('a logged-in player joins through the link and the second attempt says alreadyJoined', function () {
    $t = parityTournament(['allowInvitations' => true, 'inviteToken' => str_repeat('c', 40)]);
    [$u] = parityUser('inv-join@test.local');

    $this->postJson('/api/tournament-instances/join/'.str_repeat('c', 40), [], parityAuth($u))
        ->assertCreated()
        ->assertJsonPath('participant.tournamentId', $t->id);

    $this->postJson('/api/tournament-instances/join/'.str_repeat('c', 40), [], parityAuth($u))
        ->assertStatus(400)
        ->assertJsonPath('alreadyJoined', true);

    expect(TournamentParticipant::where('tournamentId', $t->id)->count())->toBe(1);
});

test('joining requires being logged in', function () {
    parityTournament(['allowInvitations' => true, 'inviteToken' => str_repeat('d', 40)]);

    $this->postJson('/api/tournament-instances/join/'.str_repeat('d', 40))->assertUnauthorized();
});

test('the cap is enforced when joining', function () {
    $t = parityTournament(['allowInvitations' => true, 'inviteToken' => str_repeat('e', 40), 'maxParticipants' => 1]);
    [, $first] = parityUser('inv-cap1@test.local');
    parityEnroll($t, $first);
    [$late] = parityUser('inv-cap2@test.local');

    $this->postJson('/api/tournament-instances/join/'.str_repeat('e', 40), [], parityAuth($late))
        ->assertStatus(400)
        ->assertJsonPath('full', true);
});

test('the roster closes once the tournament starts', function () {
    parityTournament(['allowInvitations' => true, 'inviteToken' => str_repeat('f', 40), 'status' => 'active']);
    [$u] = parityUser('inv-started@test.local');

    $this->postJson('/api/tournament-instances/join/'.str_repeat('f', 40), [], parityAuth($u))
        ->assertStatus(400);
});

test('only someone who manages the tournament can generate or change the invite', function () {
    [$owner] = parityUser('inv-owner@test.local');
    [$stranger] = parityUser('inv-stranger@test.local');
    $t = parityTournament(['responsableId' => $owner->id]);

    $this->postJson("/api/tournament-instances/{$t->id}/invite", [], parityAuth($stranger))->assertForbidden();
    $this->putJson("/api/tournament-instances/{$t->id}/invite", ['allowInvitations' => false], parityAuth($stranger))->assertForbidden();

    $res = $this->postJson("/api/tournament-instances/{$t->id}/invite", ['maxParticipants' => 12], parityAuth($owner))
        ->assertOk()
        ->assertJsonPath('allowInvitations', true)
        ->assertJsonPath('maxParticipants', 12);

    expect($res->json('inviteUrl'))->toBe('https://app.test/tournaments/join/'.$res->json('inviteToken'));
    expect(strlen($res->json('inviteToken')))->toBe(40);
});

test('regenerating the link invalidates the old one', function () {
    [$owner] = parityUser('inv-regen@test.local');
    $t = parityTournament(['responsableId' => $owner->id]);

    $old = $this->postJson("/api/tournament-instances/{$t->id}/invite", [], parityAuth($owner))->json('inviteToken');
    $new = $this->postJson("/api/tournament-instances/{$t->id}/invite", [], parityAuth($owner))->json('inviteToken');

    expect($new)->not->toBe($old);
    $this->getJson("/api/tournament-instances/join/{$old}")->assertNotFound();
    $this->getJson("/api/tournament-instances/join/{$new}")->assertOk();
});
