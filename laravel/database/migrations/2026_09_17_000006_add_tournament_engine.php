<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Foundation for the configurable tournament engine (new architecture,
 * not a port from Express — the old Strategy Registry is being replaced
 * entirely, see conversation/plan notes).
 *
 * - `TournamentInstance.responsableId`: soft reference to User.id (no FK,
 *   consistent with the other soft-FK columns on this table — see
 *   App\Models\TournamentInstance). Defaults to the creator at creation
 *   time but is reassignable. Distinct from `arbitroId` (who registers
 *   results at match level) — this is tournament-level MANAGEMENT
 *   permission (generate rounds, approve absences, edit config).
 * - `tournament_types`: a brand-new table, no legacy counterpart, so it
 *   follows normal Laravel snake_case conventions rather than matching
 *   the Prisma-era camelCase tables. Replaces the hardcoded
 *   structure/pairingSystem string registry with a DB-backed one:
 *   `engine='configurable'` types are interpreted generically from a
 *   tournament's `config` JSON (roles, rotation constraints, match
 *   generator, scoring, absence rules); `engine='custom'` types
 *   (CimaPadel) point at a dedicated PHP class instead.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('TournamentInstance', 'responsableId')) {
            Schema::table('TournamentInstance', function (Blueprint $table) {
                $table->uuid('responsableId')->nullable()->after('arbitroId');
            });
        }

        if (! Schema::hasTable('tournament_types')) {
            Schema::create('tournament_types', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('key')->unique();
                $table->string('label');
                $table->text('description')->nullable();
                $table->string('engine')->default('configurable'); // 'configurable' | 'custom'
                $table->string('custom_class')->nullable();
                $table->jsonb('default_config_schema')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tournament_types');

        if (Schema::hasColumn('TournamentInstance', 'responsableId')) {
            Schema::table('TournamentInstance', function (Blueprint $table) {
                $table->dropColumn('responsableId');
            });
        }
    }
};
