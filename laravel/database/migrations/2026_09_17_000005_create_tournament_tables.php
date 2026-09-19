<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tournament (presets), TournamentInstance, TournamentParticipant,
 * TournamentLog, TournamentCourt, TournamentMatch.
 *
 * CONFIRMED SCHEMA-DRIFT WARNING carried over from the exploration that
 * produced the migration plan: Prisma's own migrations/ folder has NO
 * CREATE TABLE statements for Tournament, TournamentInstance,
 * TournamentParticipant, TournamentMatch, or TournamentLog — they were
 * created directly against the DB outside the migrations folder. This
 * file is therefore reconstructed from schema.prisma's field list, not
 * from any authoritative migration — re-verify against
 * `pg_dump --schema-only` before ever running this against production.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('Tournament')) {
            Schema::create('Tournament', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('name');
                $table->text('description')->nullable();
                $table->string('structure');
                $table->string('pairingSystem');
                $table->string('matchFormat');
                $table->string('byeRule')->default('none');
                $table->boolean('isPreset')->default(true);
                $table->uuid('createdBy'); // soft reference, no FK
                $table->timestamp('createdAt')->useCurrent();
            });
        }

        if (! Schema::hasTable('TournamentInstance')) {
            Schema::create('TournamentInstance', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('presetId')->nullable(); // soft reference, no FK
                $table->string('name');
                $table->text('description')->nullable();
                $table->string('structure');
                $table->string('pairingSystem');
                $table->string('matchFormat');
                $table->string('byeRule')->default('none');
                $table->string('status')->default('draft');
                $table->timestamp('startDate')->nullable();
                $table->timestamp('endDate')->nullable();
                $table->uuid('seasonId')->nullable(); // soft reference, no FK
                $table->uuid('createdBy'); // soft reference, no FK
                $table->jsonb('config')->default('{}');
                $table->string('resultMode')->default('creador');
                $table->uuid('arbitroId')->nullable(); // soft reference, no FK
                $table->boolean('allowInvitations')->default(false);
                $table->integer('maxParticipants')->nullable();
                $table->string('inviteToken')->nullable()->unique();
                $table->string('visibility')->default('internal');
                $table->uuid('clubId')->nullable();
                $table->timestamp('createdAt')->useCurrent();

                $table->foreign('clubId')->references('id')->on('Club');
            });
        }

        if (! Schema::hasTable('TournamentParticipant')) {
            Schema::create('TournamentParticipant', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('tournamentId');
                $table->uuid('playerId');
                $table->uuid('partnerId')->nullable(); // soft reference (Player.id), no FK — see App\Models\TournamentParticipant docblock
                $table->string('teamName')->nullable();
                $table->integer('seed')->nullable();
                $table->string('status')->default('active');
                $table->uuid('substituteId')->nullable();
                $table->string('absenceReason')->nullable();
                $table->string('absenceNote')->nullable();
                $table->timestamp('createdAt')->useCurrent();

                $table->foreign('tournamentId')->references('id')->on('TournamentInstance')->onDelete('cascade');
                $table->foreign('playerId')->references('id')->on('Player')->onDelete('cascade');
                $table->foreign('substituteId')->references('id')->on('Player')->onDelete('set null');
                $table->unique(['tournamentId', 'playerId']);
            });
        }

        if (! Schema::hasTable('TournamentLog')) {
            Schema::create('TournamentLog', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('tournamentId');
                $table->uuid('userId')->nullable();
                $table->string('playerName')->nullable();
                $table->string('action');
                $table->text('detail')->nullable();
                $table->timestamp('createdAt')->useCurrent();

                $table->foreign('tournamentId')->references('id')->on('TournamentInstance')->onDelete('cascade');
                $table->index('tournamentId');
            });
        }

        if (! Schema::hasTable('TournamentCourt')) {
            Schema::create('TournamentCourt', function (Blueprint $table) {
                $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
                $table->uuid('tournamentId');
                $table->uuid('courtId');
                $table->integer('displayOrder')->default(0);

                $table->foreign('tournamentId')->references('id')->on('TournamentInstance')->onDelete('cascade');
                $table->foreign('courtId')->references('id')->on('Court')->onDelete('cascade');
                $table->unique(['tournamentId', 'courtId']);
            });
        }

        if (! Schema::hasTable('TournamentMatch')) {
            Schema::create('TournamentMatch', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('tournamentId');
                $table->integer('round')->default(1);
                $table->text('group')->nullable(); // JSON *string*, not JSONB — see App\Models\TournamentMatch docblock
                $table->uuid('participant1Id')->nullable(); // soft reference, no FK
                $table->uuid('participant2Id')->nullable(); // soft reference, no FK
                $table->uuid('winnerId')->nullable(); // soft reference, no FK
                $table->jsonb('result')->nullable();
                $table->string('status')->default('pending');
                $table->timestamp('scheduledAt')->nullable();
                $table->integer('courtNumber')->nullable();
                $table->uuid('courtId')->nullable();
                $table->uuid('proposedByParticipant')->nullable(); // soft reference, no FK
                $table->text('confirmedByParticipants')->default('{}'); // Postgres TEXT[], see below
                $table->timestamp('expiresAt')->nullable();
                $table->timestamp('createdAt')->useCurrent();

                $table->foreign('tournamentId')->references('id')->on('TournamentInstance')->onDelete('cascade');
                $table->foreign('courtId')->references('id')->on('Court')->onDelete('set null');
            });

            DB::statement(
                'ALTER TABLE "TournamentMatch" ALTER COLUMN "confirmedByParticipants" DROP DEFAULT'
            );
            DB::statement(
                'ALTER TABLE "TournamentMatch" ALTER COLUMN "confirmedByParticipants" TYPE TEXT[] USING ARRAY[]::TEXT[]'
            );
            DB::statement(
                'ALTER TABLE "TournamentMatch" ALTER COLUMN "confirmedByParticipants" SET DEFAULT ARRAY[]::TEXT[]'
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('TournamentMatch');
        Schema::dropIfExists('TournamentCourt');
        Schema::dropIfExists('TournamentLog');
        Schema::dropIfExists('TournamentParticipant');
        Schema::dropIfExists('TournamentInstance');
        Schema::dropIfExists('Tournament');
    }
};
