<?php

use App\Enums\Role;
use App\Models\Club;
use App\Models\Court;
use App\Models\CourtBlock;

/** A club in Madrid with N courts and its admin. @return array{0: Club, 1: \App\Models\User, 2: array<int, Court>} */
function blockClub(string $prefix, int $courts = 2, string $tz = 'Europe/Madrid'): array
{
    $club = newClub("Bloqueos {$prefix}", "bloqueos-{$prefix}");
    $club->update(['timezone' => $tz]);
    $admin = clubAdminOf($club, "bk-{$prefix}@test.local");
    $list = [];
    for ($i = 1; $i <= $courts; $i++) {   // (range(1, 0) would yield [1, 0], not nothing)
        $list[] = Court::create(['clubId' => $club->id, 'name' => "Pista {$i}"]);
    }

    return [$club, $admin, $list];
}

function blockBody(array $over = []): array
{
    return array_merge(['startsAt' => '2026-10-01T09:00', 'endsAt' => '2026-10-01T11:00', 'reason' => 'maintenance', 'note' => 'Cambio de césped'], $over);
}

function postBlock($test, Club $club, $admin, array $body)
{
    return $test->postJson("/api/clubs/{$club->id}/court-blocks", $body, parityAuth($admin));
}

// ── creating ────────────────────────────────────────────────────────

test('a block is read in the club\'s timezone and stored as a UTC instant', function () {
    [$club, $admin, [$c1]] = blockClub('tz1');

    $r = postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id]]))->assertCreated();

    $b = $r->json(0);
    expect($b['startLocal'])->toBe('2026-10-01T09:00')->and($b['endLocal'])->toBe('2026-10-01T11:00')->and($b['timezone'])->toBe('Europe/Madrid');
    expect($b['courtName'])->toBe('Pista 1')->and($b['reason'])->toBe('maintenance')->and($b['reasonLabel'])->toBe('Mantenimiento')->and($b['note'])->toBe('Cambio de césped');
    expect(CourtBlock::first()->startsAt->utc()->format('Y-m-d H:i'))->toBe('2026-10-01 07:00');   // CEST = UTC+2
    expect($b['startsAt'])->toStartWith('2026-10-01T07:00:00');
});

test('an explicit offset is respected and shown back in the club\'s local time', function () {
    [$club, $admin, [$c1]] = blockClub('tz2');

    $b = postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id], 'startsAt' => '2026-10-01T09:00:00+00:00', 'endsAt' => '2026-10-01T10:00:00Z']))->assertCreated()->json(0);

    expect(CourtBlock::first()->startsAt->utc()->format('H:i'))->toBe('09:00')->and($b['startLocal'])->toBe('2026-10-01T11:00');
});

test('the same wall-clock time means a different instant in another timezone', function () {
    [$club, $admin, [$c1]] = blockClub('tz3', 1, 'America/Argentina/Buenos_Aires');

    postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id]]))->assertCreated();

    expect(CourtBlock::first()->startsAt->utc()->format('H:i'))->toBe('12:00');   // 09:00 at UTC-3
});

test('"allCourts" blocks every court of the club and groups the rows', function () {
    [$club, $admin] = blockClub('all', 3);

    $rows = postBlock($this, $club, $admin, blockBody(['allCourts' => true]))->assertCreated()->json();

    expect($rows)->toHaveCount(3);
    expect(collect($rows)->pluck('courtName')->sort()->values()->all())->toBe(['Pista 1', 'Pista 2', 'Pista 3']);
    expect(collect($rows)->pluck('groupId')->unique()->count())->toBe(1)->and($rows[0]['groupId'])->not->toBeNull()->and($rows[0]['groupCount'])->toBe(3);
});

test('a single-court, single-time block has no group', function () {
    [$club, $admin, [$c1]] = blockClub('solo');

    expect(postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id]]))->json('0.groupId'))->toBeNull();
});

test('a block can span several days', function () {
    [$club, $admin, [$c1]] = blockClub('multi');

    postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id], 'startsAt' => '2026-10-01T00:00', 'endsAt' => '2026-10-08T00:00', 'reason' => 'works']))->assertCreated();
    expect(CourtBlock::count())->toBe(1);
});

test('invalid blocks are refused with a clear 400 and nothing is saved', function (array $over, string $fragment) {
    [$club, $admin, [$c1]] = blockClub('bad'.md5(json_encode($over)));
    $body = blockBody(['courtIds' => [$c1->id]] + $over) + ['courtIds' => [$c1->id]];
    $body = array_merge(blockBody(), ['courtIds' => [$c1->id]], $over);

    postBlock($this, $club, $admin, $body)->assertStatus(400)->assertJsonPath('error', fn ($e) => str_contains(mb_strtolower($e), mb_strtolower($fragment)));
    expect(CourtBlock::count())->toBe(0);
})->with([
    'end before start' => [['startsAt' => '2026-10-01T11:00', 'endsAt' => '2026-10-01T09:00'], 'posterior'],
    'zero length' => [['startsAt' => '2026-10-01T09:00', 'endsAt' => '2026-10-01T09:00'], 'posterior'],
    'too long' => [['startsAt' => '2026-10-01T09:00', 'endsAt' => '2027-11-01T09:00'], 'no puede durar'],
    'bad start format' => [['startsAt' => 'mañana'], 'startsAt'],
    'date only' => [['startsAt' => '2026-10-01'], 'startsAt'],
    'impossible date' => [['startsAt' => '2026-13-45T09:00'], 'startsAt'],
    'missing end' => [['endsAt' => null], 'endsAt'],
    'unknown reason' => [['reason' => 'aburrimiento'], 'motivo'],
    'missing reason' => [['reason' => null], 'motivo'],
    'note too long' => [['note' => str_repeat('a', 201)], 'nota'],
]);

test('courts must be named, exist and belong to THIS club', function () {
    [$club, $admin, [$c1]] = blockClub('own');
    $foreign = Court::create(['clubId' => newClub('Otro', 'otro-bk')->id, 'name' => 'Ajena']);

    postBlock($this, $club, $admin, blockBody())->assertStatus(400);                                                    // none given
    postBlock($this, $club, $admin, blockBody(['courtIds' => []]))->assertStatus(400);
    postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id, $foreign->id]]))->assertStatus(400);            // one is foreign
    postBlock($this, $club, $admin, blockBody(['courtIds' => ['00000000-0000-0000-0000-000000000000']]))->assertStatus(400);
    expect(CourtBlock::count())->toBe(0);
});

test('"allCourts" on a club with no courts is refused', function () {
    [$club, $admin] = blockClub('empty', 0);

    postBlock($this, $club, $admin, blockBody(['allCourts' => true]))->assertStatus(400);
});

test('the same court listed twice is blocked once', function () {
    [$club, $admin, [$c1]] = blockClub('dup');

    postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id, $c1->id]]))->assertCreated()->assertJsonCount(1);
});

// ── weekly repetition ───────────────────────────────────────────────

test('a weekly repetition creates one block per week until the end date, inclusive', function () {
    [$club, $admin, [$c1]] = blockClub('rep1');

    $rows = postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id], 'repeat' => ['type' => 'weekly', 'until' => '2026-10-29']]))->assertCreated()->json();

    expect(collect($rows)->pluck('startLocal')->all())->toBe(['2026-10-01T09:00', '2026-10-08T09:00', '2026-10-15T09:00', '2026-10-22T09:00', '2026-10-29T09:00']);
    expect(collect($rows)->pluck('groupId')->unique()->count())->toBe(1)->and($rows[0]['groupCount'])->toBe(5);
});

test('courts × weeks: every court gets every occurrence', function () {
    [$club, $admin] = blockClub('rep2', 2);

    $rows = postBlock($this, $club, $admin, blockBody(['allCourts' => true, 'repeat' => ['type' => 'weekly', 'until' => '2026-10-15']]))->assertCreated()->json();

    expect($rows)->toHaveCount(6);   // 3 Thursdays × 2 courts
});

test('a repetition keeps the LOCAL time across the daylight-saving change', function () {
    [$club, $admin, [$c1]] = blockClub('dst');

    // Sunday 18 Oct 2026 (CEST, UTC+2) → Sunday 25 Oct (DST ended at 03:00: CET, UTC+1)
    $rows = postBlock($this, $club, $admin, ['courtIds' => [$c1->id], 'startsAt' => '2026-10-18T10:00', 'endsAt' => '2026-10-18T12:00', 'reason' => 'cleaning', 'repeat' => ['type' => 'weekly', 'until' => '2026-10-25']])->assertCreated()->json();

    expect(collect($rows)->pluck('startLocal')->all())->toBe(['2026-10-18T10:00', '2026-10-25T10:00']);   // still 10:00 on the wall clock
    expect(substr($rows[0]['startsAt'], 11, 5))->toBe('08:00')->and(substr($rows[1]['startsAt'], 11, 5))->toBe('09:00');   // …but a different UTC instant
});

test('repetition input is validated', function (array $repeat, int $expected) {
    [$club, $admin, [$c1]] = blockClub('rep'.md5(json_encode($repeat)));

    postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id], 'repeat' => $repeat]))->assertStatus($expected);
    if ($expected === 400) {
        expect(CourtBlock::count())->toBe(0);
    }
})->with([
    'daily is not supported' => [['type' => 'daily', 'until' => '2026-10-10'], 400],
    'no end date' => [['type' => 'weekly'], 400],
    'end before the first block' => [['type' => 'weekly', 'until' => '2026-09-01'], 400],
    'bad date' => [['type' => 'weekly', 'until' => 'pronto'], 400],
    'longer than two years' => [['type' => 'weekly', 'until' => '2029-01-01'], 400],
    'end the same day is one occurrence' => [['type' => 'weekly', 'until' => '2026-10-01'], 201],
]);

// ── listing (the calendar) ──────────────────────────────────────────

test('the calendar lists blocks overlapping a date range, oldest first', function () {
    [$club, $admin, [$c1, $c2]] = blockClub('list');
    postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id], 'startsAt' => '2026-09-30T20:00', 'endsAt' => '2026-10-01T02:00']))->assertCreated();   // starts before the range, spills into it
    postBlock($this, $club, $admin, blockBody(['courtIds' => [$c2->id], 'startsAt' => '2026-10-10T09:00', 'endsAt' => '2026-10-10T10:00']))->assertCreated();
    postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id], 'startsAt' => '2026-10-31T23:00', 'endsAt' => '2026-11-01T01:00']))->assertCreated();   // spills OUT of the range
    postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id], 'startsAt' => '2026-11-15T09:00', 'endsAt' => '2026-11-15T10:00']))->assertCreated();   // fully outside

    $r = $this->getJson("/api/clubs/{$club->id}/court-blocks?from=2026-10-01&to=2026-10-31", parityAuth($admin))->assertOk();

    expect($r->json('timezone'))->toBe('Europe/Madrid')->and($r->json('from'))->toBe('2026-10-01')->and($r->json('to'))->toBe('2026-10-31');
    expect(collect($r->json('blocks'))->pluck('startLocal')->all())->toBe(['2026-09-30T20:00', '2026-10-10T09:00', '2026-10-31T23:00']);
});

test('a block that ends exactly when the range starts is not part of it', function () {
    [$club, $admin, [$c1]] = blockClub('edge');
    postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id], 'startsAt' => '2026-09-30T22:00', 'endsAt' => '2026-10-01T00:00']))->assertCreated();

    expect($this->getJson("/api/clubs/{$club->id}/court-blocks?from=2026-10-01&to=2026-10-01", parityAuth($admin))->json('blocks'))->toBe([]);
});

test('the calendar can be filtered by court and shows each block\'s group size', function () {
    [$club, $admin, [$c1, $c2]] = blockClub('filter');
    postBlock($this, $club, $admin, blockBody(['allCourts' => true]))->assertCreated();

    $r = $this->getJson("/api/clubs/{$club->id}/court-blocks?from=2026-10-01&to=2026-10-01&courtId={$c2->id}", parityAuth($admin))->json('blocks');

    expect($r)->toHaveCount(1)->and($r[0]['courtId'])->toBe($c2->id)->and($r[0]['groupCount'])->toBe(2);
});

test('the calendar only shows this club\'s blocks', function () {
    [$club, $admin, [$c1]] = blockClub('mine');
    [$other, $otherAdmin, [$oc1]] = blockClub('theirs');
    postBlock($this, $other, $otherAdmin, blockBody(['courtIds' => [$oc1->id]]))->assertCreated();
    postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id]]))->assertCreated();

    expect($this->getJson("/api/clubs/{$club->id}/court-blocks?from=2026-10-01&to=2026-10-02", parityAuth($admin))->json('blocks'))->toHaveCount(1);
});

test('listing validates its range and defaults to the next 60 days', function () {
    [$club, $admin] = blockClub('range');
    $h = parityAuth($admin);

    $this->getJson("/api/clubs/{$club->id}/court-blocks?from=2026-10-10&to=2026-10-01", $h)->assertStatus(400);
    $this->getJson("/api/clubs/{$club->id}/court-blocks?from=2026-01-01&to=2027-06-01", $h)->assertStatus(400);
    $this->getJson("/api/clubs/{$club->id}/court-blocks?from=ayer", $h)->assertStatus(400);
    $r = $this->getJson("/api/clubs/{$club->id}/court-blocks", $h)->assertOk();
    expect((int) \Carbon\Carbon::parse($r->json('from'))->diffInDays(\Carbon\Carbon::parse($r->json('to'))))->toBe(59);
});

// ── editing one block ───────────────────────────────────────────────

test('one block can be edited: time, reason and note', function () {
    [$club, $admin, [$c1]] = blockClub('edit');
    $id = postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id]]))->json('0.id');

    $this->putJson("/api/clubs/{$club->id}/court-blocks/{$id}", ['startsAt' => '2026-10-02T08:00', 'endsAt' => '2026-10-02T09:30', 'reason' => 'repair', 'note' => 'Cristal roto'], parityAuth($admin))
        ->assertOk()->assertJsonPath('startLocal', '2026-10-02T08:00')->assertJsonPath('endLocal', '2026-10-02T09:30')->assertJsonPath('reason', 'repair')->assertJsonPath('note', 'Cristal roto');
    // moving only the end keeps the start
    $this->putJson("/api/clubs/{$club->id}/court-blocks/{$id}", ['endsAt' => '2026-10-02T12:00'], parityAuth($admin))->assertOk()->assertJsonPath('startLocal', '2026-10-02T08:00')->assertJsonPath('endLocal', '2026-10-02T12:00');
    $this->putJson("/api/clubs/{$club->id}/court-blocks/{$id}", ['note' => null], parityAuth($admin))->assertOk()->assertJsonPath('note', null);
});

test('editing cannot produce an invalid block', function () {
    [$club, $admin, [$c1]] = blockClub('edit2');
    $id = postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id]]))->json('0.id');
    $h = parityAuth($admin);

    $this->putJson("/api/clubs/{$club->id}/court-blocks/{$id}", ['endsAt' => '2026-10-01T08:00'], $h)->assertStatus(400);   // before the start
    $this->putJson("/api/clubs/{$club->id}/court-blocks/{$id}", ['reason' => 'nope'], $h)->assertStatus(400);
    $this->putJson("/api/clubs/{$club->id}/court-blocks/00000000-0000-0000-0000-000000000000", ['note' => 'x'], $h)->assertNotFound();
    expect(CourtBlock::find($id)->reason)->toBe('maintenance');
});

// ── deleting: one / occurrence / following / all ────────────────────

/** 2 courts × 3 weeks, one group. */
function seededSeries($test, Club $club, $admin): array
{
    $rows = postBlock($test, $club, $admin, blockBody(['allCourts' => true, 'repeat' => ['type' => 'weekly', 'until' => '2026-10-15']]))->assertCreated()->json();

    return collect($rows)->sortBy(['startLocal', 'courtName'])->values()->all();   // [w1c1, w1c2, w2c1, w2c2, w3c1, w3c2]
}

test('delete scopes: one, occurrence, following, all', function (string $scope, int $deleted, int $left) {
    [$club, $admin] = blockClub('del'.$scope);
    $rows = seededSeries($this, $club, $admin);
    $middle = $rows[2];   // week 2, court 1

    $this->deleteJson("/api/clubs/{$club->id}/court-blocks/{$middle['id']}?scope={$scope}", [], parityAuth($admin))
        ->assertOk()->assertJsonPath('deleted', $deleted);
    expect(CourtBlock::count())->toBe($left);
})->with([
    'one' => ['one', 1, 5],
    'occurrence (all courts, that time)' => ['occurrence', 2, 4],
    'following (this and later)' => ['following', 4, 2],
    'all (the whole series)' => ['all', 6, 0],
]);

test('"following" keeps the earlier occurrences', function () {
    [$club, $admin] = blockClub('delkeep');
    $rows = seededSeries($this, $club, $admin);

    $this->deleteJson("/api/clubs/{$club->id}/court-blocks/{$rows[2]['id']}?scope=following", [], parityAuth($admin))->assertOk();

    expect(CourtBlock::orderBy('startsAt')->get()->map(fn ($b) => $b->startsAt->setTimezone('Europe/Madrid')->format('Y-m-d'))->unique()->values()->all())->toBe(['2026-10-01']);
});

test('an ungrouped block is deleted alone whatever the scope', function () {
    [$club, $admin, [$c1]] = blockClub('delsolo');
    $id = postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id]]))->json('0.id');

    $this->deleteJson("/api/clubs/{$club->id}/court-blocks/{$id}?scope=all", [], parityAuth($admin))->assertOk()->assertJsonPath('deleted', 1);
});

test('deleting refuses an unknown scope and a block of another club', function () {
    [$club, $admin, [$c1]] = blockClub('delbad');
    [$other, $otherAdmin, [$oc1]] = blockClub('delother');
    $id = postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id]]))->json('0.id');
    $foreignId = postBlock($this, $other, $otherAdmin, blockBody(['courtIds' => [$oc1->id]]))->json('0.id');

    $this->deleteJson("/api/clubs/{$club->id}/court-blocks/{$id}?scope=everything", [], parityAuth($admin))->assertStatus(400);
    $this->deleteJson("/api/clubs/{$club->id}/court-blocks/{$foreignId}", [], parityAuth($admin))->assertNotFound();   // someone else's block, addressed through my club
    $this->putJson("/api/clubs/{$club->id}/court-blocks/{$foreignId}", ['note' => 'hack'], parityAuth($admin))->assertNotFound();
    expect(CourtBlock::count())->toBe(2);
});

// ── who may use the calendar ────────────────────────────────────────

test('only that club\'s admin (or a super admin) can use its block calendar', function () {
    [$club, $admin, [$c1]] = blockClub('perm');
    $id = postBlock($this, $club, $admin, blockBody(['courtIds' => [$c1->id]]))->json('0.id');
    $foreign = clubAdminOf(newClub('Intruso', 'intruso-bk'), 'bk-intruso@test.local');
    [$player] = parityUser('bk-player@test.local');
    [$super] = parityUser('bk-super@test.local', Role::SUPER_ADMIN);

    foreach ([$foreign, $player] as $intruder) {
        $h = parityAuth($intruder);
        $this->getJson("/api/clubs/{$club->id}/court-blocks", $h)->assertForbidden();
        $this->postJson("/api/clubs/{$club->id}/court-blocks", blockBody(['courtIds' => [$c1->id]]), $h)->assertForbidden();
        $this->putJson("/api/clubs/{$club->id}/court-blocks/{$id}", ['note' => 'x'], $h)->assertForbidden();
        $this->deleteJson("/api/clubs/{$club->id}/court-blocks/{$id}", [], $h)->assertForbidden();
    }
    $this->getJson("/api/clubs/{$club->id}/court-blocks")->assertUnauthorized();
    $this->getJson("/api/clubs/{$club->id}/court-blocks?from=2026-10-01&to=2026-10-02", parityAuth($super))->assertOk();
    expect(CourtBlock::count())->toBe(1);
});

test('deleting a court removes its blocks', function () {
    [$club, $admin, [$c1, $c2]] = blockClub('cascade');
    postBlock($this, $club, $admin, blockBody(['allCourts' => true]))->assertCreated();

    $this->deleteJson("/api/clubs/{$club->id}/courts/{$c1->id}", [], parityAuth($admin))->assertOk();

    expect(CourtBlock::pluck('courtId')->all())->toBe([$c2->id]);
});

test('a club that does not exist is a clean 404', function () {
    [$super] = parityUser('bk-404@test.local', Role::SUPER_ADMIN);

    $this->getJson('/api/clubs/00000000-0000-0000-0000-000000000000/court-blocks', parityAuth($super))->assertNotFound();
});
