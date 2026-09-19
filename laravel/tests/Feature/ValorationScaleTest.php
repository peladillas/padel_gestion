<?php

use App\Exceptions\ApiException;
use App\Models\Valoration;
use App\Services\ValorationService;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

// makeFixedPairsMatch() lives in ValorationTest.php (same Pest run).

test('every rating must be a whole number from 1 to 5', function (mixed $bad) {
    [$p, $match] = makeFixedPairsMatch();

    expect(fn () => app(ValorationService::class)->create($p['p1'], [
        'tournamentMatchId' => $match->id, 'toPlayerId' => $p['rival1']->id, 'smash' => $bad,
    ]))->toThrow(ApiException::class, 'entero de 1 a 5');

    expect(Valoration::count())->toBe(0);
})->with([0, 6, 10, -1, 3.5, '4.5', 'abc', true]);

test('1 and 5 (the limits) and numeric strings are accepted and stored as integers', function () {
    [$p, $match] = makeFixedPairsMatch();

    app(ValorationService::class)->create($p['p1'], [
        'tournamentMatchId' => $match->id, 'toPlayerId' => $p['rival1']->id,
        'smash' => 1, 'volea' => 5, 'globo' => '3', 'saque' => null, 'resto' => '',
    ]);

    $v = Valoration::first();
    expect([$v->smash, $v->volea, $v->globo, $v->saque, $v->resto])->toBe([1, 5, 3, null, null]);
});

test('an invalid value on ANY field rejects the whole rating, nothing is half-saved', function () {
    [$p, $match] = makeFixedPairsMatch();

    expect(fn () => app(ValorationService::class)->create($p['p1'], [
        'tournamentMatchId' => $match->id, 'toPlayerId' => $p['rival1']->id, 'smash' => 4, 'volea' => 9,
    ]))->toThrow(ApiException::class);

    expect(Valoration::count())->toBe(0);
});

test('the database itself refuses a rating outside 1–5', function () {
    [$p, $match] = makeFixedPairsMatch();

    expect(fn () => DB::table('Valoration')->insert([
        'id' => (string) \Illuminate\Support\Str::uuid(), 'tournamentMatchId' => $match->id,
        'fromPlayerId' => $p['p1']->id, 'toPlayerId' => $p['rival1']->id, 'smash' => 8,
    ]))->toThrow(QueryException::class, 'Valoration_score_range');
});

test('averages keep one decimal instead of rounding to a whole number', function () {
    [$p, $match] = makeFixedPairsMatch();
    $svc = app(ValorationService::class);

    // Two different raters give the same rival 4 and 5 → 4.5, not 5 (or 4).
    $svc->create($p['p1'], ['tournamentMatchId' => $match->id, 'toPlayerId' => $p['rival1']->id, 'smash' => 4, 'ambiente' => 5]);
    $svc->create($p['partner'], ['tournamentMatchId' => $match->id, 'toPlayerId' => $p['rival1']->id, 'smash' => 5, 'ambiente' => 4]);

    $stats = $svc->statsForPlayer($p['rival1']->id);
    expect($stats['total'])->toBe(2);
    expect($stats['smash'])->toBe(4.5)->and($stats['ambiente'])->toBe(4.5);
    expect($stats['volea'])->toBeNull();

    $evolution = $svc->evolution($p['rival1']->id);
    expect($evolution[0]['smash'])->toBe(4.5)->and($evolution[0]['count'])->toBe(2);
});

test('the public profile and the dashboard report the same one-decimal stats', function () {
    [$p, $match] = makeFixedPairsMatch();
    app(ValorationService::class)->create($p['p1'], ['tournamentMatchId' => $match->id, 'toPlayerId' => $p['rival1']->id, 'smash' => 4]);
    app(ValorationService::class)->create($p['partner'], ['tournamentMatchId' => $match->id, 'toPlayerId' => $p['rival1']->id, 'smash' => 5]);
    $p['rival1']->update(['isPublic' => true, 'showStats' => true]);

    $this->getJson("/api/players/{$p['rival1']->id}/public")->assertOk()->assertJsonPath('stats.smash', 4.5)->assertJsonPath('stats.total', 2);
    $this->getJson('/api/dashboard/player', parityAuth($p['rival1']->user))->assertOk()->assertJsonPath('myStats.smash', 4.5);
});

test('pending tells the rater who is their partner and who is a rival', function () {
    [$p, $match] = makeFixedPairsMatch();

    $players = collect(app(ValorationService::class)->pending($p['p1'])[0]['playersToRate'])->keyBy('id');

    expect($players[$p['partner']->id]['relation'])->toBe('partner');
    expect($players[$p['rival1']->id]['relation'])->toBe('rival');
    expect($players[$p['rival2']->id]['relation'])->toBe('rival');
    expect($players[$p['rival1']->id])->toHaveKeys(['name', 'avatarUrl']);
});

test('the migration folds old 1–10 ratings onto 1–5 and leaves 1–5 data alone', function () {
    [$p, $match] = makeFixedPairsMatch();
    DB::statement('ALTER TABLE "Valoration" DROP CONSTRAINT "Valoration_score_range"');

    $row = fn (array $scores) => DB::table('Valoration')->insert(array_merge([
        'id' => (string) \Illuminate\Support\Str::uuid(), 'tournamentMatchId' => $match->id,
        'fromPlayerId' => $p['p1']->id, 'toPlayerId' => $p['rival1']->id,
    ], $scores));

    // Old-scale row (some score > 5): every score in it is folded with ceil(v/2).
    $row(['smash' => 10, 'volea' => 7, 'globo' => 3, 'bandeja' => 1, 'resto' => 6, 'saque' => null]);
    $old = DB::table('Valoration')->where('smash', 10)->value('id');
    // A row already within 1–5 must not be touched.
    $row(['tournamentMatchId' => \Illuminate\Support\Str::uuid()->toString(), 'smash' => 4, 'volea' => 2]);
    // Stray zero → "not rated".
    $row(['tournamentMatchId' => \Illuminate\Support\Str::uuid()->toString(), 'smash' => 0, 'volea' => 3]);

    (require base_path('database/migrations/2026_09_19_000002_valoration_scale_1_to_5.php'))->up();

    $folded = DB::table('Valoration')->where('id', $old)->first();
    expect([$folded->smash, $folded->volea, $folded->globo, $folded->bandeja, $folded->resto, $folded->saque])->toBe([5, 4, 2, 1, 3, null]);
    $kept = DB::table('Valoration')->where('smash', 4)->first();
    expect([$kept->smash, $kept->volea])->toBe([4, 2]);
    $zero = DB::table('Valoration')->whereNull('smash')->where('volea', 3)->first();
    expect($zero)->not->toBeNull();

    // …and the constraint is back.
    expect(fn () => DB::table('Valoration')->insert([
        'id' => (string) \Illuminate\Support\Str::uuid(), 'tournamentMatchId' => $match->id,
        'fromPlayerId' => $p['partner']->id, 'toPlayerId' => $p['rival1']->id, 'smash' => 7,
    ]))->toThrow(QueryException::class);
});
