<?php

use App\Enums\ClubRole;
use App\Enums\Role;
use App\Models\Club;
use App\Models\ClubMembership;
use App\Models\Court;
use App\Models\TournamentInstance;
use App\Support\ClubServiceCatalog;
use Illuminate\Http\UploadedFile;

beforeEach(function () {
    $this->uploads = sys_get_temp_dir().'/bp-club-uploads-'.uniqid();
    mkdir($this->uploads);
    config(['bonapinta.uploads_path' => $this->uploads]);
});

// ── the id survives every edit ──────────────────────────────────────

test('editing a club keeps its id and everything linked to it', function () {
    [$super] = parityUser('cp-super@test.local', Role::SUPER_ADMIN);
    $club = newClub('Club Viejo', 'club-viejo');
    $court = Court::create(['clubId' => $club->id, 'name' => 'Central']);
    $t = parityTournament(['clubId' => $club->id]);
    $admin = clubAdminOf($club, 'cp-admin@test.local');

    $this->putJson("/api/clubs/{$club->id}", ['name' => 'Club Nuevo', 'slug' => 'club-nuevo', 'description' => 'Renovado'], parityAuth($super))
        ->assertOk()->assertJsonPath('id', $club->id)->assertJsonPath('name', 'Club Nuevo')->assertJsonPath('slug', 'club-nuevo');

    expect(Club::count())->toBe(1);
    expect($court->fresh()->clubId)->toBe($club->id);
    expect($t->fresh()->clubId)->toBe($club->id);
    expect(ClubMembership::where('clubId', $club->id)->count())->toBe(1);
});

// ── name / slug ─────────────────────────────────────────────────────

test('the slug is normalised (accents, spaces, symbols) exactly like on creation', function () {
    [$super] = parityUser('cp-slug@test.local', Role::SUPER_ADMIN);
    $club = newClub('Slug Club', 'slug-club');

    $this->putJson("/api/clubs/{$club->id}", ['slug' => 'Club Pádel Ñoño!'], parityAuth($super))->assertOk()->assertJsonPath('slug', 'club-padel-nono');
    $this->postJson('/api/clubs', ['name' => 'Otro Pádel'], parityAuth($super))->assertCreated()->assertJsonPath('slug', 'otro-padel');
});

test('a slug already used by ANOTHER club is a 409, your own slug is not', function () {
    [$super] = parityUser('cp-dup@test.local', Role::SUPER_ADMIN);
    $a = newClub('A', 'club-a');
    newClub('B', 'club-b');

    $this->putJson("/api/clubs/{$a->id}", ['slug' => 'club-b'], parityAuth($super))->assertStatus(409);
    $this->putJson("/api/clubs/{$a->id}", ['slug' => 'club-a', 'name' => 'A renombrado'], parityAuth($super))->assertOk();
});

test('a blank name or an unusable slug is refused, not saved', function () {
    [$super] = parityUser('cp-blank@test.local', Role::SUPER_ADMIN);
    $club = newClub('Nombre', 'nombre');

    $this->putJson("/api/clubs/{$club->id}", ['name' => '   '], parityAuth($super))->assertStatus(400);
    $this->putJson("/api/clubs/{$club->id}", ['slug' => '!!!'], parityAuth($super))->assertStatus(400);
    $this->postJson('/api/clubs', ['name' => ''], parityAuth($super))->assertStatus(400);
    expect($club->fresh()->name)->toBe('Nombre');
});

test('only a super admin can rename a club or change its slug', function () {
    $club = newClub('Solo Super', 'solo-super');
    $admin = clubAdminOf($club, 'cp-own@test.local');

    $this->putJson("/api/clubs/{$club->id}", ['name' => 'Hackeado'], parityAuth($admin))->assertForbidden();
    expect($club->fresh()->name)->toBe('Solo Super');
});

test('editing an unknown club is a clean 404', function () {
    [$super] = parityUser('cp-404@test.local', Role::SUPER_ADMIN);

    $this->putJson('/api/clubs/00000000-0000-0000-0000-000000000000', ['name' => 'X'], parityAuth($super))->assertNotFound();
});

// ── description + services, edited by the club's own admin ──────────

test('a club admin edits their own club\'s description and services', function () {
    $club = newClub('Mi Club', 'mi-club');
    $admin = clubAdminOf($club, 'cp-a1@test.local');

    $this->putJson("/api/clubs/{$club->id}/profile", ['description' => '  Cuatro pistas junto al río.  ', 'services' => ['parking', 'bar_cafeteria']], parityAuth($admin))
        ->assertOk()->assertJsonPath('description', 'Cuatro pistas junto al río.')->assertJsonPath('services', ['parking', 'bar_cafeteria']);
});

test('another club\'s admin, a player and an anonymous visitor cannot edit the profile', function () {
    $club = newClub('Ajeno', 'ajeno');
    $other = newClub('Otro', 'otro');
    $foreignAdmin = clubAdminOf($other, 'cp-f1@test.local');
    [$player] = parityUser('cp-p1@test.local');

    $this->putJson("/api/clubs/{$club->id}/profile", ['description' => 'x'], parityAuth($foreignAdmin))->assertForbidden();
    $this->putJson("/api/clubs/{$club->id}/profile", ['description' => 'x'], parityAuth($player))->assertForbidden();
    $this->putJson("/api/clubs/{$club->id}/profile", ['description' => 'x'])->assertUnauthorized();
    expect($club->fresh()->description)->toBeNull();
});

test('a super admin can edit any club\'s profile', function () {
    [$super] = parityUser('cp-s2@test.local', Role::SUPER_ADMIN);
    $club = newClub('Cualquiera', 'cualquiera');

    $this->putJson("/api/clubs/{$club->id}/profile", ['description' => 'ok'], parityAuth($super))->assertOk();
});

test('the description is a SHORT text: 300 characters at most, blank clears it', function () {
    $club = newClub('Corta', 'corta');
    $admin = clubAdminOf($club, 'cp-d1@test.local');

    $this->putJson("/api/clubs/{$club->id}/profile", ['description' => str_repeat('a', 301)], parityAuth($admin))->assertStatus(400);
    $this->putJson("/api/clubs/{$club->id}/profile", ['description' => str_repeat('ñ', 300)], parityAuth($admin))->assertOk(); // limit counts characters, not bytes
    $this->putJson("/api/clubs/{$club->id}/profile", ['description' => '   '], parityAuth($admin))->assertOk()->assertJsonPath('description', null);
});

test('services must come from the catalogue; duplicates collapse and order is the catalogue\'s', function () {
    $club = newClub('Servicios', 'servicios');
    $admin = clubAdminOf($club, 'cp-sv@test.local');

    $this->putJson("/api/clubs/{$club->id}/profile", ['services' => ['parking', 'jacuzzi_volador']], parityAuth($admin))->assertStatus(400);
    $this->putJson("/api/clubs/{$club->id}/profile", ['services' => 'parking'], parityAuth($admin))->assertStatus(400);
    expect($club->fresh()->services)->toBeNull();

    $this->putJson("/api/clubs/{$club->id}/profile", ['services' => ['torneos', 'parking', 'torneos', 'iluminacion']], parityAuth($admin))
        ->assertOk()->assertJsonPath('services', ['iluminacion', 'parking', 'torneos']);
    $this->putJson("/api/clubs/{$club->id}/profile", ['services' => []], parityAuth($admin))->assertOk()->assertJsonPath('services', []);
});

test('sending only services does not wipe the description, and vice versa', function () {
    $club = newClub('Parcial', 'parcial');
    $admin = clubAdminOf($club, 'cp-pt@test.local');
    $this->putJson("/api/clubs/{$club->id}/profile", ['description' => 'Se queda', 'services' => ['wifi']], parityAuth($admin))->assertOk();

    $this->putJson("/api/clubs/{$club->id}/profile", ['services' => ['wifi', 'gimnasio']], parityAuth($admin))->assertOk()->assertJsonPath('description', 'Se queda');
    $this->putJson("/api/clubs/{$club->id}/profile", ['description' => 'Nueva'], parityAuth($admin))->assertOk()->assertJsonPath('services', ['wifi', 'gimnasio']);
});

test('the service catalogue is available to any logged-in user and is internally consistent', function () {
    [$player] = parityUser('cp-cat@test.local');

    $res = $this->getJson('/api/clubs/services', parityAuth($player))->assertOk();
    $groupKeys = collect($res->json('groups'))->pluck('key');

    expect(count($res->json('services')))->toBeGreaterThanOrEqual(20);
    expect(collect($res->json('services'))->pluck('key')->all())->toBe(ClubServiceCatalog::keys());
    foreach ($res->json('services') as $svc) {
        expect($groupKeys)->toContain($svc['group']);
        expect($svc['label'])->not->toBe('');
    }
    // the essentials every padel club advertises
    expect(ClubServiceCatalog::keys())->toContain('vestuarios', 'parking', 'iluminacion', 'bar_cafeteria', 'tienda', 'clases', 'torneos', 'alquiler_palas');
    $this->getJson('/api/clubs/services')->assertUnauthorized();
});

test('the public club list carries description, photo and services', function () {
    $club = newClub('Publico', 'publico');
    $club->update(['description' => 'Hola', 'services' => ['parking']]);
    [$player] = parityUser('cp-pub@test.local');

    $row = collect($this->getJson('/api/clubs/public', parityAuth($player))->assertOk()->json())->firstWhere('id', $club->id);

    expect($row)->toMatchArray(['description' => 'Hola', 'services' => ['parking'], 'logoUrl' => null]);
});

// ── profile photo (logo) ────────────────────────────────────────────

test('the club admin uploads a profile photo: stored as a PNG that fits 256px, with a cache-busting URL', function () {
    $club = newClub('Con Foto', 'con-foto');
    $admin = clubAdminOf($club, 'cp-ph@test.local');

    $res = $this->post("/api/clubs/{$club->id}/logo", ['logo' => UploadedFile::fake()->image('logo.png', 800, 400)], parityAuth($admin) + ['Accept' => 'application/json'])->assertOk();

    expect($res->json('logoUrl'))->toStartWith("/uploads/clubs/club_{$club->id}.png?v=");
    $file = $this->uploads."/clubs/club_{$club->id}.png";
    expect(file_exists($file))->toBeTrue();
    [$w, $h, $type] = getimagesize($file);
    expect($type)->toBe(IMAGETYPE_PNG)->and(max($w, $h))->toBe(256)->and($w / $h)->toEqual(2); // scaled down, not cropped
});

test('a small photo is not upscaled', function () {
    $club = newClub('Chico', 'chico');
    $admin = clubAdminOf($club, 'cp-sm@test.local');

    $this->post("/api/clubs/{$club->id}/logo", ['logo' => UploadedFile::fake()->image('l.png', 100, 100)], parityAuth($admin) + ['Accept' => 'application/json'])->assertOk();

    expect(getimagesize($this->uploads."/clubs/club_{$club->id}.png")[0])->toBe(100);
});

test('anything that is not a JPG/PNG/WebP image is refused', function () {
    $club = newClub('Solo Imagen', 'solo-imagen');
    $admin = clubAdminOf($club, 'cp-bad@test.local');
    $h = parityAuth($admin) + ['Accept' => 'application/json'];

    $this->post("/api/clubs/{$club->id}/logo", ['logo' => UploadedFile::fake()->create('logo.pdf', 10, 'application/pdf')], $h)->assertStatus(400);
    $this->post("/api/clubs/{$club->id}/logo", ['logo' => UploadedFile::fake()->create('shell.php', 1, 'text/x-php')], $h)->assertStatus(400);
    $this->post("/api/clubs/{$club->id}/logo", [], $h)->assertStatus(400);
    expect($club->fresh()->logoUrl)->toBeNull();
});

test('only that club\'s admin (or a super admin) can change its photo', function () {
    $club = newClub('Foto Privada', 'foto-privada');
    $foreign = clubAdminOf(newClub('Otro Club', 'otro-club'), 'cp-fo@test.local');
    $h = fn ($u) => parityAuth($u) + ['Accept' => 'application/json'];

    $this->post("/api/clubs/{$club->id}/logo", ['logo' => UploadedFile::fake()->image('l.png')], $h($foreign))->assertForbidden();
    $this->deleteJson("/api/clubs/{$club->id}/logo", [], parityAuth($foreign))->assertForbidden();
    expect(file_exists($this->uploads."/clubs/club_{$club->id}.png"))->toBeFalse();
});

test('removing the photo deletes the file and clears the URL; deleting the club removes it too', function () {
    [$super] = parityUser('cp-rm@test.local', Role::SUPER_ADMIN);
    $club = newClub('Borrable', 'borrable');
    $h = parityAuth($super) + ['Accept' => 'application/json'];
    $file = $this->uploads."/clubs/club_{$club->id}.png";

    $this->post("/api/clubs/{$club->id}/logo", ['logo' => UploadedFile::fake()->image('l.png')], $h)->assertOk();
    expect(file_exists($file))->toBeTrue();
    $this->deleteJson("/api/clubs/{$club->id}/logo", [], parityAuth($super))->assertOk()->assertJsonPath('logoUrl', null);
    expect(file_exists($file))->toBeFalse();

    $this->post("/api/clubs/{$club->id}/logo", ['logo' => UploadedFile::fake()->image('l.png')], $h)->assertOk();
    $this->deleteJson("/api/clubs/{$club->id}", [], parityAuth($super))->assertOk();
    expect(file_exists($file))->toBeFalse();
});
