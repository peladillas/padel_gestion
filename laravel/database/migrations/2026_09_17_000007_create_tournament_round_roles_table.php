<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Round-by-round role assignments for the new configurable tournament
 * engine (e.g. who "cooks"/rests/plays a given fecha). A dedicated,
 * queryable table rather than embedding role history inside a match's
 * `group` JSON (the old CimaPadel `_bbq` pattern) — rotation constraints
 * need fast "how many times has X had role Y in the last N rounds"
 * lookups, which a real table with indexes handles cleanly. New table,
 * no legacy counterpart, so plain Laravel snake_case conventions.
 *
 * For a fixed-pair participant, BOTH members' TournamentParticipant rows
 * get a row with the same role for that round — there's no separate
 * "couple" entity in the schema, so this keeps per-player queries simple
 * without introducing one.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tournament_round_roles')) {
            Schema::create('tournament_round_roles', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('tournament_id');
                $table->integer('round');
                $table->uuid('participant_id');
                $table->string('role');
                $table->timestamp('created_at')->useCurrent();

                $table->foreign('tournament_id')->references('id')->on('TournamentInstance')->onDelete('cascade');
                $table->foreign('participant_id')->references('id')->on('TournamentParticipant')->onDelete('cascade');
                $table->unique(['tournament_id', 'round', 'participant_id']);
                $table->index(['tournament_id', 'participant_id', 'role']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tournament_round_roles');
    }
};
