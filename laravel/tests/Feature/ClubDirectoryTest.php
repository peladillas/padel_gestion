<?php

use App\Enums\Role;
use App\Models\Club;
use App\Models\Court;
use App\Services\ClubDirectoryService;
use Carbon\Carbon;

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function weekHours(string $open, string $close, array $days = ALL_DAYS): array
{
    return collect(ALL_DAYS)->mapWithKeys(fn ($d) => [$d => in_array($d, $days, true) ? ['open' => $open, 'close' => $close] : null])->all();
}

function dirClub(string $name, array $attrs = [], int $activeCourts = 0): Club
{
    $club = Club::create(array_merge(['name' => $name, 'slug' => \Illuminate\Support\Str::slug($name).'-'.uniqid()], $attrs));

    foreach (range(1, $activeCourts) as $i) {
        if ($activeCourts) {
            Court::create(['clubId' => $club->id, 'name' => "Pista {$i}", 'isActive' => true]);
        }
    }

    return $club;
}

/**
 * Four clubs with different data:
 *  Norte  — Madrid, coordinates in Madrid centre, open every day 08–23, 4 courts, from 12 €
 *  Sur    — Barcelona, weekends only 09–14, 2 courts, from 20 €
 *  Aguilas— Madrid, no coordinates / hours / price, 6 courts, lots of services
 *  Noche  — Sevilla, open 18:00–02:00 every day, 1 court
 */
function seedDirectory(): array
{
    return [
        'norte' => dirClub('Club Pádel Norte', [
            'city' => 'Madrid', 'country' => 'ES', 'address' => 'Calle Mayor 1', 'latitude' => 40.4200, 'longitude' => -3.7000,
            'services' => ['clases', 'vestuarios', 'parking'], 'openingHours' => weekHours('08:00', '23:00'), 'timezone' => 'Europe/Madrid',
            'priceFrom' => 12, 'currency' => 'EUR', 'description' => 'Junto al parque del Retiro',
        ], 4),
        'sur' => dirClub('Tennis & Padel Sur', [
            'city' => 'Barcelona', 'country' => 'ES', 'latitude' => 41.3874, 'longitude' => 2.1686,
            'services' => ['parking'], 'openingHours' => weekHours('09:00', '14:00', ['sat', 'sun']), 'timezone' => 'Europe/Madrid',
            'priceFrom' => 20, 'currency' => 'EUR',
        ], 2),
        'aguilas' => dirClub('Club Las Águilas', [
            'city' => 'Madrid', 'country' => 'ES', 'services' => ['clases', 'vestuarios', 'parking', 'bar_cafeteria', 'gimnasio', 'piscina'],
        ], 6),
        'noche' => dirClub('Padel Nocturno', [
            'city' => 'Sevilla', 'country' => 'ES', 'latitude' => 37.3891, 'longitude' => -5.9845,
            'services' => ['iluminacion'], 'openingHours' => weekHours('18:00', '02:00'), 'timezone' => 'Europe/Madrid',
        ], 1),
    ];
}

function names(\Illuminate\Testing\TestResponse $r): array
{
    return collect($r->json('data'))->pluck('name')->all();
}

function dirGet($test, string $query = '', ?\App\Models\User $as = null)
{
    $as ??= parityUser('dir-'.uniqid().'@test.local')[0];

    return $test->getJson('/api/clubs/directory'.($query ? "?{$query}" : ''), parityAuth($as));
}

afterEach(fn () => Carbon::setTestNow());

// ── who can browse ──────────────────────────────────────────────────

test('every role can browse the directory, anonymous visitors cannot', function (Role $role) {
    seedDirectory();
    [$user] = parityUser('dir-role-'.$role->value.'@test.local', $role);

    dirGet($this, '', $user)->assertOk()->assertJsonPath('meta.total', 4);
})->with([Role::PLAYER, Role::ADMIN, Role::SUPER_ADMIN]);

test('anonymous visitors get 401', function () {
    $this->getJson('/api/clubs/directory')->assertUnauthorized();
    $this->getJson('/api/clubs/directory/'.\Illuminate\Support\Str::uuid())->assertUnauthorized();
});

test('a card exposes the public info and never the internal fields', function () {
    $c = seedDirectory()['norte'];
    $c->update(['allowedStructures' => ['round_robin_generic'], 'allowedPairingSystems' => ['x']]);

    $card = collect(dirGet($this)->json('data'))->firstWhere('id', $c->id);

    expect($card)->toHaveKeys(['id', 'name', 'slug', 'description', 'logoUrl', 'services', 'address', 'city', 'region', 'postalCode', 'country', 'latitude', 'longitude',
        'distanceKm', 'phones', 'email', 'website', 'bookingUrl', 'instagram', 'facebook', 'openingHours', 'timezone', 'openNow', 'closesAt', 'courtsCount', 'priceFrom', 'priceTo', 'currency']);
    expect($card)->not->toHaveKeys(['allowedStructures', 'allowedPairingSystems', 'createdAt', 'updatedAt']);
    expect($card['courtsCount'])->toBe(4);
});

test('only ACTIVE courts are counted', function () {
    $c = dirClub('Pistas', [], 3);
    Court::where('clubId', $c->id)->first()->update(['isActive' => false]);

    expect(collect(dirGet($this)->json('data'))->firstWhere('id', $c->id)['courtsCount'])->toBe(2);
});

// ── search ──────────────────────────────────────────────────────────

test('search ignores accents and case, and looks at name, city, address and description', function (string $q, array $expected) {
    seedDirectory();

    expect(names(dirGet($this, 'q='.urlencode($q))))->toEqualCanonicalizing($expected);
})->with([
    'accent-free finds an accented name' => ['padel', ['Club Pádel Norte', 'Tennis & Padel Sur', 'Padel Nocturno']],
    'accented query finds plain text' => ['PÁDEL SUR', ['Tennis & Padel Sur']],
    'another accent' => ['aguilas', ['Club Las Águilas']],
    'by city' => ['barcelona', ['Tennis & Padel Sur']],
    'by address' => ['calle mayor', ['Club Pádel Norte']],
    'by description' => ['retiro', ['Club Pádel Norte']],
    'no match' => ['zzz', []],
    'words in any order' => ['norte padel', ['Club Pádel Norte']],
    'name + city together' => ['padel madrid', ['Club Pádel Norte']],
    'every word must match' => ['padel zzz', []],
    'extra spaces are ignored' => ['  padel   sur  ', ['Tennis & Padel Sur']],
]);

test('wildcard characters in the search are plain text, not patterns', function () {
    seedDirectory();

    expect(names(dirGet($this, 'q=%25')))->toBe([]);
    expect(names(dirGet($this, 'q=_')))->toBe([]);
});

// ── filters ─────────────────────────────────────────────────────────

test('services filter: ALL by default, ANY on request', function () {
    seedDirectory();

    expect(names(dirGet($this, 'services=clases,vestuarios')))->toEqualCanonicalizing(['Club Pádel Norte', 'Club Las Águilas']);
    expect(names(dirGet($this, 'services[]=parking&services[]=piscina')))->toBe(['Club Las Águilas']);
    expect(names(dirGet($this, 'services=piscina,iluminacion&servicesMode=any')))->toEqualCanonicalizing(['Club Las Águilas', 'Padel Nocturno']);
    dirGet($this, 'services=helipuerto')->assertStatus(400);
});

test('city and country filters ignore accents', function () {
    seedDirectory();

    expect(names(dirGet($this, 'city=madrid')))->toEqualCanonicalizing(['Club Pádel Norte', 'Club Las Águilas']);
    expect(names(dirGet($this, 'city=SEVILLA&country=es')))->toBe(['Padel Nocturno']);
    expect(names(dirGet($this, 'country=AR')))->toBe([]);
});

test('open days: a club must publish hours for every requested day', function () {
    seedDirectory();

    expect(names(dirGet($this, 'openDays=sat,sun')))->toEqualCanonicalizing(['Club Pádel Norte', 'Tennis & Padel Sur', 'Padel Nocturno']);
    expect(names(dirGet($this, 'openDays=mon')))->toEqualCanonicalizing(['Club Pádel Norte', 'Padel Nocturno']);   // Sur is weekends only, Águilas publishes nothing
    dirGet($this, 'openDays=funday')->assertStatus(400);
});

test('minimum courts and maximum price', function () {
    seedDirectory();

    expect(names(dirGet($this, 'minCourts=4')))->toEqualCanonicalizing(['Club Pádel Norte', 'Club Las Águilas']);
    expect(names(dirGet($this, 'maxPrice=15')))->toBe(['Club Pádel Norte']);                 // clubs with no price are not "under 15"
    expect(names(dirGet($this, 'maxPrice=25')))->toEqualCanonicalizing(['Club Pádel Norte', 'Tennis & Padel Sur']);
});

test('filters combine', function () {
    seedDirectory();

    expect(names(dirGet($this, 'city=madrid&services=clases&minCourts=5')))->toBe(['Club Las Águilas']);
    expect(names(dirGet($this, 'q=padel&openDays=sat&services=parking&maxPrice=30')))->toEqualCanonicalizing(['Club Pádel Norte', 'Tennis & Padel Sur']);
});

// ── open now, in each club's own timezone ───────────────────────────

test('"open now" uses the current time in the club\'s timezone', function () {
    seedDirectory();

    // Saturday 19 Sep 2026, 08:00 UTC = 10:00 in Madrid (CEST)
    Carbon::setTestNow('2026-09-19 08:00:00 UTC');
    expect(names(dirGet($this, 'openNow=1')))->toEqualCanonicalizing(['Club Pádel Norte', 'Tennis & Padel Sur']);   // Nocturno opens at 18:00; Águilas has no hours (unknown ≠ open)

    // Saturday 15:00 Madrid: Sur closed at 14:00
    Carbon::setTestNow('2026-09-19 13:00:00 UTC');
    expect(names(dirGet($this, 'openNow=1')))->toBe(['Club Pádel Norte']);

    // Saturday 19:00 Madrid: Norte and Nocturno
    Carbon::setTestNow('2026-09-19 17:00:00 UTC');
    expect(names(dirGet($this, 'openNow=1')))->toEqualCanonicalizing(['Club Pádel Norte', 'Padel Nocturno']);
});

test('a club that closes after midnight is still open the next morning', function () {
    $noche = seedDirectory()['noche'];

    Carbon::setTestNow('2026-09-20 00:30:00 Europe/Madrid');   // Sunday 00:30, still Saturday's opening
    $card = collect(dirGet($this)->json('data'))->firstWhere('id', $noche->id);
    expect($card['openNow'])->toBeTrue()->and($card['closesAt'])->toBe('02:00');

    Carbon::setTestNow('2026-09-20 02:00:00 Europe/Madrid');   // exactly the closing time
    expect(collect(dirGet($this)->json('data'))->firstWhere('id', $noche->id)['openNow'])->toBeFalse();

    Carbon::setTestNow('2026-09-20 12:00:00 Europe/Madrid');
    expect(collect(dirGet($this)->json('data'))->firstWhere('id', $noche->id)['openNow'])->toBeFalse();
});

test('a club\'s own timezone decides, not the server\'s', function () {
    $hours = weekHours('09:00', '18:00');
    $ba = dirClub('En Buenos Aires', ['openingHours' => $hours, 'timezone' => 'America/Argentina/Buenos_Aires']);
    $default = dirClub('Sin zona', ['openingHours' => $hours]);   // falls back to the configured default (Europe/Madrid)

    Carbon::setTestNow('2026-09-19 20:00:00 UTC');   // 17:00 in Buenos Aires (open) / 22:00 in Madrid (closed)
    $cards = collect(dirGet($this)->json('data'))->keyBy('id');

    expect($cards[$ba->id]['openNow'])->toBeTrue()->and($cards[$ba->id]['timezone'])->toBe('America/Argentina/Buenos_Aires');
    expect($cards[$default->id]['openNow'])->toBeFalse()->and($cards[$default->id]['timezone'])->toBe(config('bonapinta.default_timezone'));
});

test('a club with no published hours is unknown (null), not closed', function () {
    $c = seedDirectory()['aguilas'];

    expect(collect(dirGet($this)->json('data'))->firstWhere('id', $c->id)['openNow'])->toBeNull();
});

test('closing at 24:00 means the end of the day', function () {
    $c = dirClub('Hasta medianoche', ['openingHours' => weekHours('10:00', '24:00'), 'timezone' => 'UTC']);

    Carbon::setTestNow('2026-09-19 23:59:00 UTC');
    expect(collect(dirGet($this)->json('data'))->firstWhere('id', $c->id)['openNow'])->toBeTrue();
    Carbon::setTestNow('2026-09-19 09:59:00 UTC');
    expect(collect(dirGet($this)->json('data'))->firstWhere('id', $c->id)['openNow'])->toBeFalse();
});

// ── proximity ───────────────────────────────────────────────────────

test('distance is computed from the user\'s position and sorting by it puts clubs without coordinates last', function () {
    seedDirectory();

    $r = dirGet($this, 'lat=40.4168&lng=-3.7038&sort=distance')->assertOk();

    expect(names($r))->toBe(['Club Pádel Norte', 'Padel Nocturno', 'Tennis & Padel Sur', 'Club Las Águilas']);
    $d = collect($r->json('data'))->keyBy('name');
    expect($d['Club Pádel Norte']['distanceKm'])->toBeGreaterThan(0)->toBeLessThan(1);                     // ~0.5 km
    expect($d['Padel Nocturno']['distanceKm'])->toBeGreaterThan(385)->toBeLessThan(395);                  // Madrid → Sevilla ≈ 390 km
    expect($d['Tennis & Padel Sur']['distanceKm'])->toBeGreaterThan(500)->toBeLessThan(510);              // Madrid → Barcelona ≈ 505 km
    expect($d['Club Las Águilas']['distanceKm'])->toBeNull();
});

test('a radius keeps only clubs within it (and drops clubs with no location)', function () {
    seedDirectory();

    expect(names(dirGet($this, 'lat=40.4168&lng=-3.7038&radiusKm=50')))->toBe(['Club Pádel Norte']);
    expect(names(dirGet($this, 'lat=40.4168&lng=-3.7038&radiusKm=450')))->toEqualCanonicalizing(['Club Pádel Norte', 'Padel Nocturno']);
});

test('without a position there is no distance, and distance-based options are refused', function () {
    seedDirectory();

    $cards = dirGet($this)->json('data');
    expect(collect($cards)->pluck('distanceKm')->filter()->all())->toBe([]);
    dirGet($this, 'sort=distance')->assertStatus(400);
    dirGet($this, 'radiusKm=10')->assertStatus(400);
    dirGet($this, 'lat=40')->assertStatus(400);
    dirGet($this, 'lat=95&lng=0')->assertStatus(400);
    dirGet($this, 'lat=abc&lng=0')->assertStatus(400);
});

test('haversine gives the known distance between two cities', function () {
    expect(ClubDirectoryService::distanceKm(40.4168, -3.7038, 41.3874, 2.1686))->toEqualWithDelta(505.0, 3.0);
    expect(ClubDirectoryService::distanceKm(10, 10, 10, 10))->toBe(0.0);
});

// ── sorting ─────────────────────────────────────────────────────────

test('sorting by name ignores accents; other sorts have sensible defaults and dir flips them', function () {
    seedDirectory();

    expect(names(dirGet($this)))->toBe(['Club Las Águilas', 'Club Pádel Norte', 'Padel Nocturno', 'Tennis & Padel Sur']);
    expect(names(dirGet($this, 'dir=desc')))->toBe(['Tennis & Padel Sur', 'Padel Nocturno', 'Club Pádel Norte', 'Club Las Águilas']);

    expect(names(dirGet($this, 'sort=courts')))->toBe(['Club Las Águilas', 'Club Pádel Norte', 'Tennis & Padel Sur', 'Padel Nocturno']);       // most first
    expect(names(dirGet($this, 'sort=courts&dir=desc')))->toBe(['Padel Nocturno', 'Tennis & Padel Sur', 'Club Pádel Norte', 'Club Las Águilas']);
    expect(names(dirGet($this, 'sort=services')))->toBe(['Club Las Águilas', 'Club Pádel Norte', 'Padel Nocturno', 'Tennis & Padel Sur']);        // 6, 3, then 1 & 1 by name
    expect(names(dirGet($this, 'sort=price')))->toBe(['Club Pádel Norte', 'Tennis & Padel Sur', 'Club Las Águilas', 'Padel Nocturno']);           // cheapest first, unpriced last
    expect(names(dirGet($this, 'sort=price&dir=desc')))->toBe(['Tennis & Padel Sur', 'Club Pádel Norte', 'Club Las Águilas', 'Padel Nocturno']);  // unpriced still last
    dirGet($this, 'sort=popularidad')->assertStatus(400);
});

// ── pagination & meta ───────────────────────────────────────────────

test('results are paginated and meta describes the whole result set', function () {
    seedDirectory();

    $p1 = dirGet($this, 'perPage=3&page=1')->assertOk();
    $p2 = dirGet($this, 'perPage=3&page=2')->assertOk();

    expect($p1->json('data'))->toHaveCount(3)->and($p2->json('data'))->toHaveCount(1);
    expect($p1->json('meta'))->toMatchArray(['total' => 4, 'page' => 1, 'perPage' => 3, 'lastPage' => 2]);
    expect(array_merge(names($p1), names($p2)))->toBe(['Club Las Águilas', 'Club Pádel Norte', 'Padel Nocturno', 'Tennis & Padel Sur']);
    expect(dirGet($this, 'perPage=3&page=9')->json('data'))->toBe([]);
});

test('perPage is capped and defaults sensibly; the city list feeds the filter UI', function () {
    seedDirectory();

    expect(dirGet($this, 'perPage=9999')->json('meta.perPage'))->toBe(50);
    expect(dirGet($this, 'perPage=0')->json('meta.perPage'))->toBe(1);
    expect(dirGet($this)->json('meta.perPage'))->toBe(12);
    expect(dirGet($this, 'city=sevilla')->json('meta.availableCities'))->toBe(['Barcelona', 'Madrid', 'Sevilla']);   // all cities, not just the filtered ones
});

test('an empty directory is an empty page, not an error', function () {
    dirGet($this)->assertOk()->assertJsonPath('data', [])->assertJsonPath('meta.total', 0)->assertJsonPath('meta.lastPage', 1);
});

// ── single card ─────────────────────────────────────────────────────

test('one club\'s card, with distance when a position is given', function () {
    $c = seedDirectory()['norte'];
    [$p] = parityUser('dir-card@test.local');

    $this->getJson("/api/clubs/directory/{$c->id}", parityAuth($p))->assertOk()->assertJsonPath('name', 'Club Pádel Norte')->assertJsonPath('distanceKm', null);
    $this->getJson("/api/clubs/directory/{$c->id}?lat=40.4168&lng=-3.7038", parityAuth($p))->assertOk()->assertJsonPath('distanceKm', fn ($d) => $d > 0 && $d < 1);
    $this->getJson('/api/clubs/directory/00000000-0000-0000-0000-000000000000', parityAuth($p))->assertNotFound();
});
