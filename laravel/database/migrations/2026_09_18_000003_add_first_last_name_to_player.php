<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * New columns, not a Prisma port. `Player.name` (a single free-text
 * column) stays as-is and keeps being kept in sync from
 * firstName+lastName going forward (see App\Support\NameHelper) — it's
 * still what every display path in the app reads (cromos, match
 * cards, standings, valorations...), so splitting it outright would
 * have meant touching dozens of unrelated call sites for zero benefit.
 * Only the edit/creation forms this task actually asked for (Profile,
 * the admin ABM in Players.jsx) collect firstName/lastName directly.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('Player', function (Blueprint $table) {
            $table->string('firstName')->nullable();
            $table->string('lastName')->nullable();
        });

        // Backfill from the existing combined name: first word ->
        // firstName, the rest -> lastName. Matches App\Support\
        // NameHelper::split() exactly, so a player who edits their
        // profile right after this migration sees the same split the
        // app would have produced itself.
        DB::statement(<<<'SQL'
            UPDATE "Player" SET
                "firstName" = split_part(name, ' ', 1),
                "lastName" = CASE
                    WHEN position(' ' in name) > 0
                        THEN trim(substring(name from position(' ' in name) + 1))
                    ELSE ''
                END
        SQL);
    }

    public function down(): void
    {
        Schema::table('Player', function (Blueprint $table) {
            $table->dropColumn(['firstName', 'lastName']);
        });
    }
};
