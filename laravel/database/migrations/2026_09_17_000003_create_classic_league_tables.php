<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Season, League, Team, TeamPlayer, Match, Availability — the "classic
 * league" tables. Season/League/Team are NOT exposed via any API route
 * today (see App\Models\Season docblock) but still live in the DB and
 * must exist for Availability's hardcoded SEASON_ID FK to resolve.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('Season')) {
            Schema::create('Season', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('name');
                $table->timestamp('startDate');
                $table->timestamp('endDate');
                $table->boolean('active')->default(true);
                $table->jsonb('config')->default('{}');
                $table->timestamp('createdAt')->useCurrent();
            });
        }

        if (! Schema::hasTable('League')) {
            Schema::create('League', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('name');
                $table->uuid('seasonId');
                $table->integer('level')->default(1);
                $table->string('type')->default('mixed');
                $table->timestamp('createdAt')->useCurrent();

                $table->foreign('seasonId')->references('id')->on('Season')->onDelete('cascade');
            });
        }

        if (! Schema::hasTable('Team')) {
            Schema::create('Team', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('name')->nullable();
                $table->uuid('leagueId');
                $table->timestamp('createdAt')->useCurrent();

                $table->foreign('leagueId')->references('id')->on('League')->onDelete('cascade');
            });
        }

        if (! Schema::hasTable('TeamPlayer')) {
            Schema::create('TeamPlayer', function (Blueprint $table) {
                $table->uuid('teamId');
                $table->uuid('playerId');

                $table->primary(['teamId', 'playerId']);
                $table->foreign('teamId')->references('id')->on('Team')->onDelete('cascade');
                $table->foreign('playerId')->references('id')->on('Player')->onDelete('cascade');
            });
        }

        if (! Schema::hasTable('Match')) {
            Schema::create('Match', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('leagueId');
                $table->uuid('team1Id');
                $table->uuid('team2Id');
                $table->timestamp('date')->nullable();
                $table->string('time')->nullable();
                $table->string('format')->default('classic');
                $table->boolean('completed')->default(false);
                $table->jsonb('result')->nullable();
                $table->text('confirmedBy')->default('{}'); // Postgres TEXT[], see below
                $table->string('status')->default('pending');
                $table->timestamp('resultRequestedAt')->nullable();
                $table->uuid('resultRequestedBy')->nullable(); // soft reference, no FK
                $table->timestamp('createdAt')->useCurrent();

                $table->foreign('leagueId')->references('id')->on('League')->onDelete('cascade');
                $table->foreign('team1Id')->references('id')->on('Team');
                $table->foreign('team2Id')->references('id')->on('Team');
            });

            // Laravel's Blueprint has no native text[] column type — the
            // column above was created as TEXT so ->default('{}') would
            // be valid SQL; convert it to a real Postgres array now.
            // Must drop the (incompatible) default before the type change.
            \Illuminate\Support\Facades\DB::statement(
                'ALTER TABLE "Match" ALTER COLUMN "confirmedBy" DROP DEFAULT'
            );
            \Illuminate\Support\Facades\DB::statement(
                'ALTER TABLE "Match" ALTER COLUMN "confirmedBy" TYPE TEXT[] USING ARRAY[]::TEXT[]'
            );
            \Illuminate\Support\Facades\DB::statement(
                'ALTER TABLE "Match" ALTER COLUMN "confirmedBy" SET DEFAULT ARRAY[]::TEXT[]'
            );
        }

        if (! Schema::hasTable('Availability')) {
            Schema::create('Availability', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('playerId');
                $table->uuid('seasonId');
                $table->jsonb('slots')->default('{}');
                $table->timestamp('updatedAt')->useCurrent();

                $table->foreign('playerId')->references('id')->on('Player')->onDelete('cascade');
                $table->foreign('seasonId')->references('id')->on('Season')->onDelete('cascade');
                $table->unique(['playerId', 'seasonId']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('Availability');
        Schema::dropIfExists('Match');
        Schema::dropIfExists('TeamPlayer');
        Schema::dropIfExists('Team');
        Schema::dropIfExists('League');
        Schema::dropIfExists('Season');
    }
};
