<?php

use App\Enums\Role;
use App\Models\Club;
use Illuminate\Support\Facades\DB;

// newClub() / clubAdminOf() are shared helpers in tests/Pest.php.

const WEEK_OPEN = ['open' => '08:00', 'close' => '23:00'];

function fullProfile(): array
{
    return [
        'description' => 'Seis pistas panorámicas.',
        'services' => ['parking', 'vestuarios'],
        'address' => 'Calle Mayor 12', 'city' => 'Madrid', 'region' => 'Comunidad de Madrid', 'postalCode' => '28013', 'country' => 'es',
        'latitude' => 40.4168, 'longitude' => -3.7038,
        'phones' => [['label' => 'Recepción', 'number' => '+34 911 234 567'], ['label' => 'WhatsApp', 'number' => '600 123 456']],
        'email' => 'Info@ClubNorte.ES', 'website' => 'www.clubnorte.es', 'bookingUrl' => 'https://reservas.clubnorte.es/pistas',
        'instagram' => '@clubnorte', 'facebook' => 'https://www.facebook.com/clubnorte.padel',
        'openingHours' => ['mon' => WEEK_OPEN, 'tue' => WEEK_OPEN, 'wed' => WEEK_OPEN, 'thu' => WEEK_OPEN, 'fri' => WEEK_OPEN, 'sat' => ['open' => '09:00', 'close' => '00:00'], 'sun' => null],
        'timezone' => 'Europe/Madrid', 'priceFrom' => 12, 'priceTo' => '18.50', 'currency' => 'eur',
    ];
}

test('a club admin fills in the whole public profile and it is stored normalised', function () {
    $club = newClub('Perfil Completo', 'perfil-completo');
    $admin = clubAdminOf($club, 'pf-a@test.local');

    $r = $this->putJson("/api/clubs/{$club->id}/profile", fullProfile(), parityAuth($admin))->assertOk()->json();

    expect($r['id'])->toBe($club->id);
    expect($r['country'])->toBe('ES')->and($r['currency'])->toBe('EUR');
    expect($r['email'])->toBe('info@clubnorte.es');
    expect($r['website'])->toBe('https://www.clubnorte.es');            // scheme added
    expect($r['instagram'])->toBe('clubnorte');                          // "@" stripped
    expect($r['facebook'])->toBe('clubnorte.padel');                     // URL reduced to the page handle
    expect($r['phones'])->toBe([['label' => 'Recepción', 'number' => '+34 911 234 567'], ['label' => 'WhatsApp', 'number' => '600 123 456']]);
    expect($r['openingHours']['sat'])->toBe(['open' => '09:00', 'close' => '24:00']); // 00:00 closing = end of day
    expect($r['openingHours']['sun'])->toBeNull();
    expect($r['latitude'])->toBe(40.4168)->and($r['priceTo'])->toBe(18.5);
});

test('every invalid value is refused with a 400 and nothing is saved', function (array $bad, string $expectedFragment) {
    $club = newClub('Validacion', 'validacion-'.uniqid());
    $admin = clubAdminOf($club, 'pf-v'.md5(json_encode($bad)).'@test.local');

    $this->putJson("/api/clubs/{$club->id}/profile", $bad, parityAuth($admin))
        ->assertStatus(400)
        ->assertJsonPath('error', fn ($e) => str_contains(mb_strtolower($e), mb_strtolower($expectedFragment)));

    expect($club->fresh()->only(array_keys($bad)))->each->toBeNull();
})->with([
    'phone with letters' => [['phones' => [['number' => '555-CALL-NOW']]], 'teléfono'],
    'phone too short' => [['phones' => [['number' => '12345']]], 'teléfono'],
    'phone too long' => [['phones' => [['number' => '1234567890123456']]], 'teléfono'],
    'five phones' => [['phones' => array_fill(0, 5, ['number' => '600123456'])], 'hasta 4'],
    'phones not a list' => [['phones' => ['number' => '600123456']], 'lista'],
    'bad email' => [['email' => 'no-es-un-email'], 'email'],
    'javascript url' => [['website' => 'javascript:alert(1)'], 'web'],
    'ftp url' => [['website' => 'ftp://club.es/archivo'], 'web'],
    'url without a dot' => [['bookingUrl' => 'http://localhost'], 'web'],
    'url with spaces' => [['website' => 'https://club es.com'], 'web'],
    'instagram with spaces' => [['instagram' => 'mi club'], 'instagram'],
    'instagram too long' => [['instagram' => str_repeat('a', 31)], 'instagram'],
    'hour out of range' => [['openingHours' => ['mon' => ['open' => '25:00', 'close' => '23:00']]], 'HH:MM'],
    'hour without minutes' => [['openingHours' => ['mon' => ['open' => '8', 'close' => '23:00']]], 'HH:MM'],
    'open equals close' => [['openingHours' => ['mon' => ['open' => '09:00', 'close' => '09:00']]], 'no pueden coincidir'],
    'unknown weekday' => [['openingHours' => ['funday' => ['open' => '09:00', 'close' => '10:00']]], 'día desconocido'],
    'hours as a list' => [['openingHours' => [['open' => '09:00', 'close' => '10:00']]], 'días de la semana'],
    'bad timezone' => [['timezone' => 'Mars/Olympus'], 'zona horaria'],
    'latitude out of range' => [['latitude' => 91, 'longitude' => 0], 'latitude'],
    'longitude out of range' => [['latitude' => 0, 'longitude' => 181], 'longitude'],
    'latitude text' => [['latitude' => 'norte', 'longitude' => 0], 'número'],
    'negative price' => [['priceFrom' => -1, 'currency' => 'EUR'], 'importe'],
    'max price below min' => [['priceFrom' => 20, 'priceTo' => 10, 'currency' => 'EUR'], 'máximo'],
    'price without currency' => [['priceFrom' => 10], 'moneda'],
    'bad currency' => [['currency' => 'EUROS'], 'currency'],
    'bad country' => [['country' => 'ESP'], 'country'],
    'address too long' => [['address' => str_repeat('a', 161)], 'address'],
]);

test('latitude and longitude must come together', function () {
    $club = newClub('Coord', 'coord');
    $admin = clubAdminOf($club, 'pf-c@test.local');

    $this->putJson("/api/clubs/{$club->id}/profile", ['latitude' => 40.4], parityAuth($admin))->assertStatus(400);
    $this->putJson("/api/clubs/{$club->id}/profile", ['latitude' => 40.4, 'longitude' => -3.7], parityAuth($admin))->assertOk();
    // …and clearing one without the other is refused too
    $this->putJson("/api/clubs/{$club->id}/profile", ['longitude' => null], parityAuth($admin))->assertStatus(400);
    $this->putJson("/api/clubs/{$club->id}/profile", ['latitude' => null, 'longitude' => null], parityAuth($admin))->assertOk()->assertJsonPath('latitude', null);
});

test('the database refuses out-of-range coordinates even if the API were bypassed', function () {
    $club = newClub('Db Coord', 'db-coord');

    expect(fn () => DB::table('Club')->where('id', $club->id)->update(['latitude' => 95, 'longitude' => 0]))->toThrow(\Illuminate\Database\QueryException::class);
    expect(fn () => DB::table('Club')->where('id', $club->id)->update(['latitude' => 10]))->toThrow(\Illuminate\Database\QueryException::class);
});

test('a partial update only changes what it mentions', function () {
    $club = newClub('Parcial Perfil', 'parcial-perfil');
    $admin = clubAdminOf($club, 'pf-p@test.local');
    $this->putJson("/api/clubs/{$club->id}/profile", fullProfile(), parityAuth($admin))->assertOk();

    $this->putJson("/api/clubs/{$club->id}/profile", ['phones' => [['number' => '699 000 111']]], parityAuth($admin))
        ->assertOk()->assertJsonPath('phones.0.number', '699 000 111')->assertJsonPath('address', 'Calle Mayor 12')->assertJsonPath('email', 'info@clubnorte.es')
        ->assertJsonPath('openingHours.mon.open', '08:00')->assertJsonPath('services', ['vestuarios', 'parking']);
});

test('blank values and null clear a field', function () {
    $club = newClub('Limpiar', 'limpiar');
    $admin = clubAdminOf($club, 'pf-l@test.local');
    $this->putJson("/api/clubs/{$club->id}/profile", fullProfile(), parityAuth($admin))->assertOk();

    $this->putJson("/api/clubs/{$club->id}/profile", ['address' => '  ', 'phones' => [], 'email' => '', 'openingHours' => null, 'website' => null, 'instagram' => ''], parityAuth($admin))
        ->assertOk()->assertJsonPath('address', null)->assertJsonPath('phones', null)->assertJsonPath('email', null)
        ->assertJsonPath('openingHours', null)->assertJsonPath('website', null)->assertJsonPath('instagram', null);
});

test('opening past midnight is allowed (close earlier than open)', function () {
    $club = newClub('Noche', 'noche');
    $admin = clubAdminOf($club, 'pf-n@test.local');

    $this->putJson("/api/clubs/{$club->id}/profile", ['openingHours' => ['fri' => ['open' => '18:00', 'close' => '02:00']]], parityAuth($admin))
        ->assertOk()->assertJsonPath('openingHours.fri', ['open' => '18:00', 'close' => '02:00']);
});

test('instagram and facebook accept handles or links', function (string $input, string $key, string $expected) {
    $club = newClub('Redes', 'redes-'.uniqid());
    $admin = clubAdminOf($club, 'pf-r'.md5($input).'@test.local');

    $this->putJson("/api/clubs/{$club->id}/profile", [$key => $input], parityAuth($admin))->assertOk()->assertJsonPath($key, $expected);
})->with([
    ['club_norte', 'instagram', 'club_norte'],
    ['@club_norte', 'instagram', 'club_norte'],
    ['https://www.instagram.com/club_norte/', 'instagram', 'club_norte'],
    ['https://instagram.com/club_norte?igsh=abc', 'instagram', 'club_norte'],
    ['clubnorte.padel', 'facebook', 'clubnorte.padel'],
    ['https://facebook.com/clubnorte.padel', 'facebook', 'clubnorte.padel'],
]);

test('another club\'s admin cannot fill in this club\'s profile fields', function () {
    $club = newClub('Ajeno Perfil', 'ajeno-perfil');
    $foreign = clubAdminOf(newClub('Otro Perfil', 'otro-perfil'), 'pf-f@test.local');

    $this->putJson("/api/clubs/{$club->id}/profile", ['address' => 'Hackeada 1', 'phones' => [['number' => '600123456']]], parityAuth($foreign))->assertForbidden();
    expect($club->fresh()->address)->toBeNull();
});

test('profile completeness tells the admin what is still missing', function () {
    [$super] = parityUser('pf-s@test.local', Role::SUPER_ADMIN);
    $club = newClub('Completar', 'completar');
    $admin = clubAdminOf($club, 'pf-cm@test.local');

    $row = fn () => collect($this->getJson('/api/clubs', parityAuth($super))->json())->firstWhere('id', $club->id)['profile'];

    expect($row())->toBe(['percent' => 0, 'missing' => ['Foto', 'Descripción', 'Dirección', 'Ubicación en el mapa', 'Teléfono', 'Email o web', 'Horario', 'Servicios']]);

    $this->putJson("/api/clubs/{$club->id}/profile", ['description' => 'Hola', 'address' => 'Calle 1', 'city' => 'Madrid'], parityAuth($admin))->assertOk();
    expect($row()['percent'])->toBe(25)->and($row()['missing'])->not->toContain('Descripción', 'Dirección');

    $club->fresh()->update(['logoUrl' => '/uploads/clubs/x.png']);
    $this->putJson("/api/clubs/{$club->id}/profile", fullProfile(), parityAuth($admin))->assertOk();
    expect($row())->toBe(['percent' => 100, 'missing' => []]);
});
