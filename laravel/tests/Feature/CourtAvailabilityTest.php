<?php

use App\Models\Club;
use App\Models\Court;
use App\Models\CourtBlock;
use App\Services\CourtAvailabilityService;
use Carbon\Carbon;

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function availClub(string $p, array $hours = null, string $tz = 'Europe/Madrid'): Club
{
    $club = newClub("Disp {$p}", "disp-{$p}");
    $club->update(['timezone' => $tz, 'openingHours' => $hours]);

    return $club;
}

function everyDay(string $open, string $close): array
{
    return collect(WEEK)->mapWithKeys(fn ($d) => [$d => ['open' => $open, 'close' => $close]])->all();
}

function blockAt(Court $court, string $startUtc, string $endUtc, string $reason = 'maintenance', ?string $note = 'nota privada'): CourtBlock
{
    return CourtBlock::create(['clubId' => $court->clubId, 'courtId' => $court->id, 'startsAt' => Carbon::parse($startUtc, 'UTC'), 'endsAt' => Carbon::parse($endUtc, 'UTC'), 'reason' => $reason, 'note' => $note]);
}

function check(Court $court, string $start, string $end, string $tz = 'Europe/Madrid'): array
{
    return app(CourtAvailabilityService::class)->check($court, $court->club, Carbon::parse($start, $tz), Carbon::parse($end, $tz));
}

// 2026-10-01 is a Thursday (CEST, UTC+2).

test('a free operational court with no restrictions is available', function () {
    $c = Court::create(['clubId' => availClub('libre')->id, 'name' => 'P1']);

    expect(check($c, '2026-10-01 10:00', '2026-10-01 11:30'))->toMatchArray(['available' => true, 'reasons' => [], 'blockIds' => []]);
});

test('a court in maintenance or out of service is never available', function (string $status) {
    $c = Court::create(['clubId' => availClub('st'.$status)->id, 'name' => 'P1', 'status' => $status, 'isActive' => false]);

    expect(check($c, '2026-10-01 10:00', '2026-10-01 11:00'))->toMatchArray(['available' => false, 'reasons' => ['court_not_operational']]);
})->with(['maintenance', 'closed']);

// ── blocks ──────────────────────────────────────────────────────────

test('an overlapping block makes the court unavailable and names the block', function () {
    $c = Court::create(['clubId' => availClub('blk')->id, 'name' => 'P1']);
    $b = blockAt($c, '2026-10-01 08:00', '2026-10-01 09:00');   // = 10:00–11:00 Madrid

    expect(check($c, '2026-10-01 10:30', '2026-10-01 11:30'))->toMatchArray(['available' => false, 'reasons' => ['blocked'], 'blockIds' => [$b->id]]);
});

test('periods are half-open: touching a block is not overlapping it', function (string $start, string $end, bool $available) {
    $c = Court::create(['clubId' => availClub('edge'.md5($start))->id, 'name' => 'P1']);
    blockAt($c, '2026-10-01 08:00', '2026-10-01 09:00');   // 10:00–11:00 Madrid

    expect(check($c, $start, $end)['available'])->toBe($available);
})->with([
    'ends exactly when the block starts' => ['2026-10-01 09:00', '2026-10-01 10:00', true],
    'starts exactly when the block ends' => ['2026-10-01 11:00', '2026-10-01 12:00', true],
    'overlaps by one minute at the start' => ['2026-10-01 09:00', '2026-10-01 10:01', false],
    'overlaps by one minute at the end' => ['2026-10-01 10:59', '2026-10-01 12:00', false],
    'contains the block' => ['2026-10-01 09:00', '2026-10-01 12:00', false],
    'inside the block' => ['2026-10-01 10:15', '2026-10-01 10:45', false],
    'the day before' => ['2026-09-30 10:00', '2026-09-30 11:00', true],
]);

test('a multi-day block covers every slot inside it', function () {
    $c = Court::create(['clubId' => availClub('multi')->id, 'name' => 'P1']);
    blockAt($c, '2026-10-01 00:00', '2026-10-08 00:00', 'works');

    expect(check($c, '2026-10-05 18:00', '2026-10-05 19:00')['available'])->toBeFalse();
    expect(check($c, '2026-10-08 10:00', '2026-10-08 11:00')['available'])->toBeTrue();
});

test('a block only affects ITS court', function () {
    $club = availClub('two');
    $a = Court::create(['clubId' => $club->id, 'name' => 'P1']);
    $b = Court::create(['clubId' => $club->id, 'name' => 'P2']);
    blockAt($a, '2026-10-01 08:00', '2026-10-01 09:00');

    expect(check($a, '2026-10-01 10:00', '2026-10-01 11:00')['available'])->toBeFalse();
    expect(check($b, '2026-10-01 10:00', '2026-10-01 11:00')['available'])->toBeTrue();
});

test('reasons add up when several restrictions apply', function () {
    $club = availClub('mix', everyDay('08:00', '23:00'));
    $c = Court::create(['clubId' => $club->id, 'name' => 'P1', 'status' => 'maintenance', 'isActive' => false]);
    blockAt($c, '2026-10-01 04:00', '2026-10-01 06:00');   // 06:00–08:00 Madrid

    expect(check($c, '2026-10-01 07:00', '2026-10-01 08:30')['reasons'])->toBe(['court_not_operational', 'blocked', 'outside_opening_hours']);
});

// ── opening hours ───────────────────────────────────────────────────

test('the slot must fit inside the club\'s opening hours', function (string $start, string $end, bool $available) {
    $c = Court::create(['clubId' => availClub('hrs'.md5($start.$end), everyDay('08:00', '23:00'))->id, 'name' => 'P1']);

    expect(check($c, $start, $end))->toMatchArray(['available' => $available]);
})->with([
    'well inside' => ['2026-10-01 10:00', '2026-10-01 11:00', true],
    'from the opening minute' => ['2026-10-01 08:00', '2026-10-01 09:00', true],
    'until the closing minute' => ['2026-10-01 22:00', '2026-10-01 23:00', true],
    'starts before opening' => ['2026-10-01 07:30', '2026-10-01 08:30', false],
    'ends after closing' => ['2026-10-01 22:30', '2026-10-01 23:30', false],
    'entirely at night' => ['2026-10-01 02:00', '2026-10-01 03:00', false],
]);

test('a day the club is closed has no availability', function () {
    $hours = everyDay('08:00', '23:00');
    $hours['sun'] = null;
    $c = Court::create(['clubId' => availClub('sun', $hours)->id, 'name' => 'P1']);

    expect(check($c, '2026-10-04 10:00', '2026-10-04 11:00')['available'])->toBeFalse();   // Sunday
    expect(check($c, '2026-10-03 10:00', '2026-10-03 11:00')['available'])->toBeTrue();    // Saturday
});

test('a club that closes after midnight can be booked across midnight, but not after it closes', function (string $start, string $end, bool $available) {
    $c = Court::create(['clubId' => availClub('night'.md5($start), everyDay('18:00', '02:00'))->id, 'name' => 'P1']);

    expect(check($c, $start, $end)['available'])->toBe($available);
})->with([
    'evening' => ['2026-10-01 19:00', '2026-10-01 20:30', true],
    'across midnight' => ['2026-10-01 23:30', '2026-10-02 00:30', true],
    'early morning, still yesterday\'s opening' => ['2026-10-02 00:30', '2026-10-02 01:30', true],
    'ends after the 02:00 close' => ['2026-10-02 01:30', '2026-10-02 02:30', false],
    'mid-afternoon (closed)' => ['2026-10-01 15:00', '2026-10-01 16:00', false],
]);

test('back-to-back opening periods join into one continuous window', function () {
    $hours = ['fri' => ['open' => '20:00', 'close' => '24:00'], 'sat' => ['open' => '00:00', 'close' => '03:00']] + array_fill_keys(['mon', 'tue', 'wed', 'thu', 'sun'], null);
    $c = Court::create(['clubId' => availClub('join', $hours)->id, 'name' => 'P1']);

    expect(check($c, '2026-10-02 23:00', '2026-10-03 01:00')['available'])->toBeTrue();    // Fri 23:00 → Sat 01:00 straddles the seam
    expect(check($c, '2026-10-03 02:00', '2026-10-03 03:30')['available'])->toBeFalse();
});

test('hours are read in the CLUB\'s timezone, whatever offset the slot is expressed in', function () {
    $c = Court::create(['clubId' => availClub('tz', everyDay('09:00', '18:00'), 'America/Argentina/Buenos_Aires')->id, 'name' => 'P1']);

    // 20:00 UTC is 17:00 in Buenos Aires (open) but 22:00 in Madrid (would be closed)
    $slot = fn (string $utcStart, string $utcEnd) => app(CourtAvailabilityService::class)->check($c, $c->club, Carbon::parse($utcStart, 'UTC'), Carbon::parse($utcEnd, 'UTC'))['available'];

    expect($slot('2026-10-01 20:00', '2026-10-01 20:30'))->toBeTrue();
    expect($slot('2026-10-01 21:30', '2026-10-01 22:30'))->toBeFalse();   // 18:30–19:30 in Buenos Aires
});

test('a club that published no hours (or only closed days) is not restricted', function (?array $hours) {
    $c = Court::create(['clubId' => availClub('none'.md5(json_encode($hours)), $hours)->id, 'name' => 'P1']);

    expect(check($c, '2026-10-01 03:00', '2026-10-01 04:00')['available'])->toBeTrue();
})->with([[null], [[]], [array_fill_keys(WEEK, null)]]);

// ── club-wide answer + the endpoint ─────────────────────────────────

test('the endpoint answers for every court, in natural order, to any logged-in role', function () {
    $club = availClub('api', everyDay('08:00', '23:00'));
    $c10 = Court::create(['clubId' => $club->id, 'name' => 'Pista 10']);
    $c2 = Court::create(['clubId' => $club->id, 'name' => 'Pista 2', 'alias' => 'La Central']);
    $c3 = Court::create(['clubId' => $club->id, 'name' => 'Pista 3', 'status' => 'maintenance', 'isActive' => false]);
    blockAt($c10, '2026-10-01 08:00', '2026-10-01 09:00', 'event', 'Cumpleaños de Marta');   // 10:00–11:00 Madrid
    [$player] = parityUser('av-player@test.local');

    $r = $this->getJson("/api/clubs/directory/{$club->id}/availability?start=2026-10-01T10:00&end=2026-10-01T11:00", parityAuth($player))->assertOk();

    expect($r->json('timezone'))->toBe('Europe/Madrid')->and($r->json('start'))->toBe('2026-10-01T10:00')->and($r->json('availableCount'))->toBe(1);
    expect(collect($r->json('courts'))->map(fn ($c) => [$c['name'], $c['available'], $c['reasons']])->all())->toBe([
        ['Pista 2', true, []], ['Pista 3', false, ['court_not_operational']], ['Pista 10', false, ['blocked']],
    ]);
    expect($r->json('courts.0.alias'))->toBe('La Central');
});

test('the public answer never reveals why a court is blocked', function () {
    $club = availClub('priv');
    $c = Court::create(['clubId' => $club->id, 'name' => 'P1']);
    blockAt($c, '2026-10-01 08:00', '2026-10-01 09:00', 'event', 'Cumpleaños de Marta');
    [$player] = parityUser('av-priv@test.local');

    $raw = $this->getJson("/api/clubs/directory/{$club->id}/availability?start=2026-10-01T10:00&end=2026-10-01T11:00", parityAuth($player))->assertOk()->getContent();

    expect($raw)->not->toContain('Marta')->not->toContain('event')->not->toContain('blockIds')->not->toContain('note');
});

test('the offset in the query is honoured', function () {
    $club = availClub('off', everyDay('08:00', '23:00'));
    Court::create(['clubId' => $club->id, 'name' => 'P1']);
    [$player] = parityUser('av-off@test.local');

    // 05:00–06:00 UTC = 07:00–08:00 in Madrid → before opening
    $this->getJson("/api/clubs/directory/{$club->id}/availability?start=2026-10-01T05:00:00Z&end=2026-10-01T06:00:00Z", parityAuth($player))
        ->assertOk()->assertJsonPath('start', '2026-10-01T07:00')->assertJsonPath('courts.0.reasons', ['outside_opening_hours']);
});

test('the endpoint validates its input', function (string $query, int $status) {
    $club = availClub('val'.md5($query));
    [$player] = parityUser('av-val'.md5($query).'@test.local');

    $this->getJson("/api/clubs/directory/{$club->id}/availability?{$query}", parityAuth($player))->assertStatus($status);
})->with([
    'no parameters' => ['', 400],
    'no end' => ['start=2026-10-01T10:00', 400],
    'end before start' => ['start=2026-10-01T11:00&end=2026-10-01T10:00', 400],
    'zero length' => ['start=2026-10-01T10:00&end=2026-10-01T10:00', 400],
    'bad format' => ['start=hoy&end=mañana', 400],
    'more than a week' => ['start=2026-10-01T10:00&end=2026-10-10T10:00', 400],
    'exactly a week is fine' => ['start=2026-10-01T10:00&end=2026-10-08T10:00', 200],
]);

test('unknown clubs are 404 and anonymous visitors 401', function () {
    [$player] = parityUser('av-404@test.local');
    $club = availClub('anon');

    $this->getJson('/api/clubs/directory/00000000-0000-0000-0000-000000000000/availability?start=2026-10-01T10:00&end=2026-10-01T11:00', parityAuth($player))->assertNotFound();
    $this->getJson("/api/clubs/directory/{$club->id}/availability?start=2026-10-01T10:00&end=2026-10-01T11:00")->assertUnauthorized();
});

test('a club with no courts answers with an empty list', function () {
    $club = availClub('nocourts');
    [$player] = parityUser('av-nc@test.local');

    $this->getJson("/api/clubs/directory/{$club->id}/availability?start=2026-10-01T10:00&end=2026-10-01T11:00", parityAuth($player))
        ->assertOk()->assertJsonPath('courts', [])->assertJsonPath('availableCount', 0);
});
