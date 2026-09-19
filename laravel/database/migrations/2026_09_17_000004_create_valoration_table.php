<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Valoration has NO @@unique in schema.prisma at all. Uniqueness is
 * enforced only by two PARTIAL unique indexes (raw SQL, not expressible
 * via Prisma or Laravel's fluent schema builder) — confirmed against
 * backend/prisma/migrations/20260423000000_valoration_tournament_match.
 * matchId has NO FK in production (dropped by a later migration despite
 * schema.prisma still declaring the relation) — mirrored here by NOT
 * adding a foreign() constraint on matchId, only on fromPlayerId/
 * toPlayerId (which do have real FKs to Player).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('Valoration')) {
            Schema::create('Valoration', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('matchId')->nullable(); // no FK in prod, see docblock
                $table->uuid('tournamentMatchId')->nullable(); // no FK, no relation at all in prod
                $table->uuid('fromPlayerId');
                $table->uuid('toPlayerId');
                $table->integer('smash')->nullable();
                $table->integer('volea')->nullable();
                $table->integer('globo')->nullable();
                $table->integer('bandeja')->nullable();
                $table->integer('bajadaPared')->nullable();
                $table->integer('resto')->nullable();
                $table->integer('saque')->nullable();
                $table->integer('ambiente')->nullable();
                $table->timestamp('createdAt')->useCurrent();

                $table->foreign('fromPlayerId')->references('id')->on('Player');
                $table->foreign('toPlayerId')->references('id')->on('Player');
            });
        }

        DB::statement(
            'CREATE UNIQUE INDEX IF NOT EXISTS "Valoration_match_unique" '.
            'ON "Valoration" ("matchId","fromPlayerId","toPlayerId") WHERE "matchId" IS NOT NULL'
        );
        DB::statement(
            'CREATE UNIQUE INDEX IF NOT EXISTS "Valoration_tmatch_unique" '.
            'ON "Valoration" ("tournamentMatchId","fromPlayerId","toPlayerId") WHERE "tournamentMatchId" IS NOT NULL'
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('Valoration');
    }
};
