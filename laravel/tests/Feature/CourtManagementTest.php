<?php

use App\Enums\Role;
use App\Models\Court;
use App\Support\CourtCatalog;
use Illuminate\Support\Facades\DB;

function courtBody(array $over = []): array
{
    return array_merge([
        'name' => 'Pista Central', 'alias' => 'La Reina', 'material' => 'galvanized_steel', 'floor' => 'artificial_grass', 'walls' => 'tempered_glass',
        'orientation' => 'north_south', 'setting' => 'covered', 'status' => 'operational', 'hasLighting' => true, 'notes' => 'Revisar red en marzo',
    ], $over);
}

// ── permissions: courts are managed by THEIR club's admin ───────────

test('a club admin manages the courts of their own club', function () {
    $club = newClub('Mi Club', 'mi-club');
    $admin = clubAdminOf($club, 'cm-a@test.local');

    $created = $this->postJson("/api/clubs/{$club->id}/courts", courtBody(), parityAuth($admin))->assertCreated()->json();
    $this->getJson("/api/clubs/{$club->id}/courts", parityAuth($admin))->assertOk()->assertJsonCount(1);
    $this->putJson("/api/clubs/{$club->id}/courts/{$created['id']}", ['alias' => 'Nueva'], parityAuth($admin))->assertOk()->assertJsonPath('alias', 'Nueva');
    $this->deleteJson("/api/clubs/{$club->id}/courts/{$created['id']}", [], parityAuth($admin))->assertOk();
    expect(Court::count())->toBe(0);
});

test('another club\'s admin, a player and an anonymous visitor cannot touch these courts', function () {
    $club = newClub('Ajeno', 'ajeno-c');
    $court = Court::create(['clubId' => $club->id, 'name' => 'P1']);
    $foreign = clubAdminOf(newClub('Otro', 'otro-c'), 'cm-f@test.local');
    [$player] = parityUser('cm-p@test.local');

    foreach ([$foreign, $player] as $intruder) {
        $h = parityAuth($intruder);
        $this->getJson("/api/clubs/{$club->id}/courts", $h)->assertForbidden();
        $this->postJson("/api/clubs/{$club->id}/courts", courtBody(), $h)->assertForbidden();
        $this->postJson("/api/clubs/{$club->id}/courts/bulk", ['count' => 2], $h)->assertForbidden();
        $this->putJson("/api/clubs/{$club->id}/courts/{$court->id}", ['name' => 'Hack'], $h)->assertForbidden();
        $this->deleteJson("/api/clubs/{$club->id}/courts/{$court->id}", [], $h)->assertForbidden();
    }
    $this->getJson("/api/clubs/{$club->id}/courts")->assertUnauthorized();
    expect(Court::count())->toBe(1)->and($court->fresh()->name)->toBe('P1');
});

test('a super admin manages any club\'s courts', function () {
    [$super] = parityUser('cm-s@test.local', Role::SUPER_ADMIN);
    $club = newClub('Cualquiera', 'cualquiera-c');

    $this->postJson("/api/clubs/{$club->id}/courts", courtBody(), parityAuth($super))->assertCreated();
});

// ── the catalogue ───────────────────────────────────────────────────

test('the court catalogue is public to any logged-in user and complete', function () {
    [$player] = parityUser('cm-cat@test.local');

    $r = $this->getJson('/api/clubs/court-catalog', parityAuth($player))->assertOk();

    expect(array_keys($r->json()))->toBe(['material', 'floor', 'walls', 'orientation', 'setting', 'status', 'reason']);
    expect(collect($r->json('floor'))->pluck('key'))->toContain('artificial_grass', 'concrete');
    expect(collect($r->json('walls'))->pluck('key'))->toContain('tempered_glass', 'mesh');
    expect(collect($r->json('reason'))->pluck('key'))->toContain('maintenance', 'cleaning', 'works', 'event');
    foreach ($r->json() as $items) {
        foreach ($items as $item) {
            expect($item['label'])->not->toBe('');
        }
    }
    $this->getJson('/api/clubs/court-catalog')->assertUnauthorized();
});

// ── create / edit with the full description ─────────────────────────

test('a court stores its whole physical description', function () {
    $club = newClub('Descrita', 'descrita');
    $admin = clubAdminOf($club, 'cm-d@test.local');

    $r = $this->postJson("/api/clubs/{$club->id}/courts", courtBody(), parityAuth($admin))->assertCreated()->json();

    expect($r)->toMatchArray(courtBody() + ['isActive' => true]);
    expect(Court::first()->only(['material', 'floor', 'walls', 'orientation', 'setting', 'status', 'hasLighting']))
        ->toBe(['material' => 'galvanized_steel', 'floor' => 'artificial_grass', 'walls' => 'tempered_glass', 'orientation' => 'north_south', 'setting' => 'covered', 'status' => 'operational', 'hasLighting' => true]);
});

test('a court needs only a name; everything else is optional with sane defaults', function () {
    $club = newClub('Minima', 'minima');
    $admin = clubAdminOf($club, 'cm-m@test.local');

    $this->postJson("/api/clubs/{$club->id}/courts", ['name' => 'P1'], parityAuth($admin))->assertCreated()
        ->assertJsonPath('status', 'operational')->assertJsonPath('isActive', true)->assertJsonPath('hasLighting', false)->assertJsonPath('floor', null);
});

test('every catalogue field rejects values outside its catalogue', function (string $field) {
    $club = newClub('Catalogo', 'catalogo-'.$field);
    $admin = clubAdminOf($club, "cm-c-{$field}@test.local");

    $this->postJson("/api/clubs/{$club->id}/courts", courtBody([$field => 'invented']), parityAuth($admin))
        ->assertStatus(400)->assertJsonPath('error', fn ($e) => str_contains($e, $field));
    expect(Court::count())->toBe(0);
})->with(['material', 'floor', 'walls', 'orientation', 'setting', 'status']);

test('text limits and required name', function () {
    $club = newClub('Limites', 'limites');
    $admin = clubAdminOf($club, 'cm-l@test.local');
    $h = parityAuth($admin);

    $this->postJson("/api/clubs/{$club->id}/courts", ['name' => ''], $h)->assertStatus(400);
    $this->postJson("/api/clubs/{$club->id}/courts", ['name' => str_repeat('a', 61)], $h)->assertStatus(400);
    $this->postJson("/api/clubs/{$club->id}/courts", ['name' => 'P', 'notes' => str_repeat('a', 201)], $h)->assertStatus(400);
    $this->postJson("/api/clubs/{$club->id}/courts", ['name' => 'P', 'alias' => str_repeat('a', 61)], $h)->assertStatus(400);
    $this->postJson("/api/clubs/{$club->id}/courts", ['name' => 'P', 'notes' => str_repeat('ñ', 200)], $h)->assertCreated();   // counts characters, not bytes
});

test('two courts of a club cannot share a name, but two clubs can', function () {
    $a = newClub('A', 'club-a-n');
    $b = newClub('B', 'club-b-n');
    $adminA = clubAdminOf($a, 'cm-na@test.local');
    $adminB = clubAdminOf($b, 'cm-nb@test.local');

    $this->postJson("/api/clubs/{$a->id}/courts", ['name' => 'Central'], parityAuth($adminA))->assertCreated();
    $this->postJson("/api/clubs/{$a->id}/courts", ['name' => 'Central'], parityAuth($adminA))->assertStatus(409);
    $this->postJson("/api/clubs/{$b->id}/courts", ['name' => 'Central'], parityAuth($adminB))->assertCreated();
});

test('a partial edit changes only what it mentions and blank clears a description field', function () {
    $club = newClub('Parcial', 'parcial-c');
    $admin = clubAdminOf($club, 'cm-pt@test.local');
    $id = $this->postJson("/api/clubs/{$club->id}/courts", courtBody(), parityAuth($admin))->json('id');

    $this->putJson("/api/clubs/{$club->id}/courts/{$id}", ['floor' => 'concrete'], parityAuth($admin))
        ->assertOk()->assertJsonPath('floor', 'concrete')->assertJsonPath('walls', 'tempered_glass')->assertJsonPath('notes', 'Revisar red en marzo')->assertJsonPath('hasLighting', true);
    $this->putJson("/api/clubs/{$club->id}/courts/{$id}", ['orientation' => '', 'notes' => null, 'alias' => '  '], parityAuth($admin))
        ->assertOk()->assertJsonPath('orientation', null)->assertJsonPath('notes', null)->assertJsonPath('alias', null)->assertJsonPath('floor', 'concrete');
});

test('status and the legacy isActive switch always agree', function (array $send, string $status, bool $active) {
    $club = newClub('Estado', 'estado-'.uniqid());
    $admin = clubAdminOf($club, 'cm-st'.md5(json_encode($send)).'@test.local');
    $id = $this->postJson("/api/clubs/{$club->id}/courts", ['name' => 'P1'], parityAuth($admin))->json('id');

    $this->putJson("/api/clubs/{$club->id}/courts/{$id}", $send, parityAuth($admin))->assertOk()->assertJsonPath('status', $status)->assertJsonPath('isActive', $active);
    expect(Court::find($id)->only(['status', 'isActive']))->toBe(['status' => $status, 'isActive' => $active]);
})->with([
    'switch off → out of service' => [['isActive' => false], 'closed', false],
    'maintenance is not active' => [['status' => 'maintenance'], 'maintenance', false],
    'closed is not active' => [['status' => 'closed'], 'closed', false],
    'operational is active' => [['status' => 'operational'], 'operational', true],
    'status wins over a contradictory switch' => [['status' => 'maintenance', 'isActive' => true], 'maintenance', false],
]);

test('switching a court back on makes it operational again', function () {
    $club = newClub('Reactivar', 'reactivar');
    $admin = clubAdminOf($club, 'cm-re@test.local');
    $id = $this->postJson("/api/clubs/{$club->id}/courts", ['name' => 'P1', 'status' => 'maintenance'], parityAuth($admin))->json('id');

    $this->putJson("/api/clubs/{$club->id}/courts/{$id}", ['isActive' => true], parityAuth($admin))->assertOk()->assertJsonPath('status', 'operational');
});

test('the database refuses an unknown status', function () {
    $club = newClub('Db Estado', 'db-estado');
    $court = Court::create(['clubId' => $club->id, 'name' => 'P1']);

    expect(fn () => DB::table('Court')->where('id', $court->id)->update(['status' => 'exploded']))->toThrow(\Illuminate\Database\QueryException::class);
});

test('courts switched off before the migration become "closed", not "operational"', function () {
    $club = newClub('Historico', 'historico');
    $court = Court::create(['clubId' => $club->id, 'name' => 'Vieja']);
    DB::table('Court')->where('id', $court->id)->update(['isActive' => false, 'status' => 'operational']);   // how a pre-migration row looks

    (require base_path('database/migrations/2026_09_21_000001_court_attributes_and_blocks.php'))->up();   // idempotent

    expect(Court::find($court->id)->status)->toBe('closed');
});

// ── list ────────────────────────────────────────────────────────────

test('courts are listed operational first and in natural name order', function () {
    $club = newClub('Orden', 'orden');
    $admin = clubAdminOf($club, 'cm-o@test.local');
    foreach (['Pista 10', 'Pista 2', 'Pista 1'] as $n) {
        Court::create(['clubId' => $club->id, 'name' => $n]);
    }
    Court::create(['clubId' => $club->id, 'name' => 'Pista 0', 'isActive' => false, 'status' => 'closed']);

    expect(collect($this->getJson("/api/clubs/{$club->id}/courts", parityAuth($admin))->json())->pluck('name')->all())->toBe(['Pista 1', 'Pista 2', 'Pista 10', 'Pista 0']);
});

// ── "define how many": bulk creation ────────────────────────────────

test('bulk creation makes N courts sharing the same characteristics', function () {
    $club = newClub('Bulk', 'bulk');
    $admin = clubAdminOf($club, 'cm-b@test.local');

    $r = $this->postJson("/api/clubs/{$club->id}/courts/bulk", ['count' => 4, 'floor' => 'artificial_grass', 'walls' => 'tempered_glass', 'orientation' => 'north_south', 'setting' => 'outdoor', 'hasLighting' => true], parityAuth($admin))->assertCreated();

    expect(collect($r->json())->pluck('name')->all())->toBe(['Pista 1', 'Pista 2', 'Pista 3', 'Pista 4']);
    foreach ($r->json() as $court) {
        expect($court)->toMatchArray(['floor' => 'artificial_grass', 'walls' => 'tempered_glass', 'orientation' => 'north_south', 'setting' => 'outdoor', 'hasLighting' => true, 'status' => 'operational', 'isActive' => true]);
    }
    expect(Court::where('clubId', $club->id)->count())->toBe(4);
});

test('bulk creation honours the prefix and start number and skips names already taken', function () {
    $club = newClub('Bulk2', 'bulk2');
    $admin = clubAdminOf($club, 'cm-b2@test.local');
    Court::create(['clubId' => $club->id, 'name' => 'Cancha 2']);

    $r = $this->postJson("/api/clubs/{$club->id}/courts/bulk", ['count' => 3, 'namePrefix' => 'Cancha', 'startNumber' => 1], parityAuth($admin))->assertCreated();

    expect(collect($r->json())->pluck('name')->all())->toBe(['Cancha 1', 'Cancha 3', 'Cancha 4']);   // "Cancha 2" already existed
    expect(Court::where('clubId', $club->id)->count())->toBe(4);
});

test('bulk creation refuses bad input and creates nothing', function (array $body) {
    $club = newClub('Bulk3', 'bulk3-'.uniqid());
    $admin = clubAdminOf($club, 'cm-b3'.md5(json_encode($body)).'@test.local');

    $this->postJson("/api/clubs/{$club->id}/courts/bulk", $body, parityAuth($admin))->assertStatus(400);
    expect(Court::where('clubId', $club->id)->count())->toBe(0);
})->with([
    'no count' => [[]],
    'zero' => [['count' => 0]],
    'too many' => [['count' => 31]],
    'not an integer' => [['count' => 2.5]],
    'text' => [['count' => 'muchas']],
    'bad template value' => [['count' => 3, 'floor' => 'lava']],
    'long prefix' => [['count' => 3, 'namePrefix' => str_repeat('a', 51)]],
]);

test('a blank prefix falls back to "Pista"', function () {
    $club = newClub('Bulk5', 'bulk5');
    $admin = clubAdminOf($club, 'cm-b5@test.local');

    $r = $this->postJson("/api/clubs/{$club->id}/courts/bulk", ['count' => 2, 'namePrefix' => '   '], parityAuth($admin))->assertCreated();

    expect(collect($r->json())->pluck('name')->all())->toBe(['Pista 1', 'Pista 2']);
});

test('the maximum in one go is 30', function () {
    $club = newClub('Bulk4', 'bulk4');
    $admin = clubAdminOf($club, 'cm-b4@test.local');

    $this->postJson("/api/clubs/{$club->id}/courts/bulk", ['count' => 30], parityAuth($admin))->assertCreated()->assertJsonCount(30);
});

// ── what players see on the club card ───────────────────────────────

test('the public club card describes the courts, hides closed ones and never leaks internal notes', function () {
    $club = newClub('Publica', 'publica');
    Court::create(['clubId' => $club->id, 'name' => 'Pista 1', 'floor' => 'artificial_grass', 'walls' => 'tempered_glass', 'setting' => 'covered', 'hasLighting' => true, 'notes' => 'SECRETO INTERNO']);
    Court::create(['clubId' => $club->id, 'name' => 'Pista 2', 'status' => 'maintenance', 'isActive' => false]);
    Court::create(['clubId' => $club->id, 'name' => 'Pista 3', 'status' => 'closed', 'isActive' => false]);
    [$player] = parityUser('cm-pub@test.local');

    $card = collect($this->getJson('/api/clubs/directory', parityAuth($player))->json('data'))->firstWhere('id', $club->id);

    expect(collect($card['courts'])->pluck('name')->all())->toBe(['Pista 1', 'Pista 2']);                 // closed is hidden
    expect($card['courts'][0])->toMatchArray(['floor' => 'artificial_grass', 'walls' => 'tempered_glass', 'setting' => 'covered', 'hasLighting' => true, 'status' => 'operational']);
    expect($card['courts'][1]['status'])->toBe('maintenance');
    expect($card['courtsCount'])->toBe(1);                                                                // only operational ones are "available"
    expect(json_encode($card))->not->toContain('SECRETO INTERNO');
    expect($card['courts'][0])->not->toHaveKey('notes');
});
