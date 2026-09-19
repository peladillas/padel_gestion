<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Valorations, decided explicitly by the user (not an Express port):
 * only ever reference TournamentMatch — the classic Match/Team/League
 * system is never being ported, so `matchId` and its partial unique
 * index are dead weight. Dropping them now (before this table has any
 * real data) simplifies the model to a single, always-present
 * `tournamentMatchId` with one genuine UNIQUE constraint instead of a
 * partial index that only existed to handle the "exactly one of
 * matchId/tournamentMatchId" case.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('DROP INDEX IF EXISTS "Valoration_match_unique"');
        DB::statement('DROP INDEX IF EXISTS "Valoration_tmatch_unique"');

        if (Schema::hasColumn('Valoration', 'matchId')) {
            Schema::table('Valoration', function (Blueprint $table) {
                $table->dropColumn('matchId');
            });
        }

        // Raw SQL rather than Blueprint::change() — avoids depending on
        // doctrine/dbal's column-diffing for a one-off, one-column change.
        DB::statement('ALTER TABLE "Valoration" ALTER COLUMN "tournamentMatchId" SET NOT NULL');
        DB::statement('ALTER TABLE "Valoration" ADD CONSTRAINT "valoration_tournamentmatchid_fromplayerid_toplayerid_unique" UNIQUE ("tournamentMatchId", "fromPlayerId", "toPlayerId")');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE "Valoration" DROP CONSTRAINT IF EXISTS "valoration_tournamentmatchid_fromplayerid_toplayerid_unique"');
        DB::statement('ALTER TABLE "Valoration" ALTER COLUMN "tournamentMatchId" DROP NOT NULL');

        if (! Schema::hasColumn('Valoration', 'matchId')) {
            Schema::table('Valoration', function (Blueprint $table) {
                $table->uuid('matchId')->nullable();
            });
        }
    }
};
