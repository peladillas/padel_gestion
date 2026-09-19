<?php

use App\Models\Season;

// A production database starts empty: `migrate` alone must be enough for
// the app to work. These guard the rows the code assumes already exist.

test('a fresh database has the default season that availability writes point at', function () {
    expect(Season::find(config('bonapinta.default_season_id')))->not->toBeNull();
});

test('a player can save their availability on a freshly migrated database', function () {
    [$user] = parityUser('fresh-avail@test.local');

    $this->putJson('/api/availability', ['slots' => ['2026-10-01_18:00' => true]], parityAuth($user))->assertOk();
    $this->getJson('/api/availability', parityAuth($user))->assertOk();
});
