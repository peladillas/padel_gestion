<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The rating scale goes from 1–10 to 1–5 (a slider per shot in the UI).
 *
 * Existing 1–10 ratings are folded onto the new scale with ceil(v/2)
 * (1–2→1, 3–4→2, 5–6→3, 7–8→4, 9–10→5) so old data keeps its meaning
 * instead of being clipped, and a CHECK constraint then makes the range a
 * property of the database, not only of the API validation. Values already
 * inside 1–5 are left untouched — that makes this safe on a database that
 * never had 1–10 data (a fresh install) and safe to re-run.
 */
return new class extends Migration
{
    private const COLUMNS = ['smash', 'volea', 'globo', 'bandeja', 'bajadaPared', 'resto', 'saque', 'ambiente'];

    public function up(): void
    {
        // A row is on the OLD scale if any of its scores is above 5; fold the
        // whole row so its scores stay comparable with each other.
        $anyAbove5 = implode(' OR ', array_map(fn ($c) => "\"{$c}\" > 5", self::COLUMNS));
        $fold = implode(', ', array_map(
            fn ($c) => "\"{$c}\" = CASE WHEN \"{$c}\" IS NULL THEN NULL ELSE GREATEST(1, CEIL(\"{$c}\" / 2.0)::int) END",
            self::COLUMNS,
        ));

        DB::statement("UPDATE \"Valoration\" SET {$fold} WHERE {$anyAbove5}");

        // Anything still outside 1–5 (a stray 0 or a negative) can't be mapped
        // sensibly: treat it as "not rated" rather than fail the migration.
        foreach (self::COLUMNS as $c) {
            DB::statement("UPDATE \"Valoration\" SET \"{$c}\" = NULL WHERE \"{$c}\" < 1");
        }

        $checks = implode(' AND ', array_map(fn ($c) => "(\"{$c}\" IS NULL OR \"{$c}\" BETWEEN 1 AND 5)", self::COLUMNS));

        DB::statement('ALTER TABLE "Valoration" DROP CONSTRAINT IF EXISTS "Valoration_score_range"');
        DB::statement("ALTER TABLE \"Valoration\" ADD CONSTRAINT \"Valoration_score_range\" CHECK ({$checks})");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE "Valoration" DROP CONSTRAINT IF EXISTS "Valoration_score_range"');
        // The fold is lossy (two old values map to one), so it is not reversed.
    }
};
