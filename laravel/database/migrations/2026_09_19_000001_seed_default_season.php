<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Availability rows carry a hard FK to Season, and the app deliberately
 * stores every player's availability under ONE hardcoded season id
 * (config('bonapinta.default_season_id')) — see AvailabilityService.
 * Production data already had that row; a freshly migrated database does
 * not, so every availability write failed with a foreign-key violation.
 *
 * A data migration (rather than a seeder) so `migrate` alone always
 * leaves a working database. Idempotent: never touches an existing row.
 */
return new class extends Migration
{
    public function up(): void
    {
        $id = config('bonapinta.default_season_id');

        if (! $id || DB::table('Season')->where('id', $id)->exists()) {
            return;
        }

        DB::table('Season')->insert([
            'id' => $id,
            'name' => 'Temporada interna (disponibilidad)',
            'startDate' => '2026-01-01 00:00:00',
            'endDate' => '2099-12-31 23:59:59',
            'active' => true,
            'config' => '{}',
        ]);
    }

    public function down(): void
    {
        // Intentionally a no-op: deleting the season would cascade-delete
        // every player's availability.
    }
};
