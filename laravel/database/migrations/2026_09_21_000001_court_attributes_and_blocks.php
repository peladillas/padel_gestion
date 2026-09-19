<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Court management inside a club.
 *
 *  - Court gets its physical description (structure material, floor, walls,
 *    orientation, indoor/outdoor), an operational status and notes. `isActive`
 *    stays (the tournament engine and the directory read it) and is kept in
 *    sync: isActive = (status = 'operational').
 *  - CourtBlock is the calendar of periods when a court can't be used
 *    (maintenance, cleaning, works, private event…). Reservations, when they
 *    exist, must respect it — see App\Services\CourtAvailabilityService.
 *    Times are timestamptz (UTC instants); `groupId` ties together the rows
 *    created by one request (several courts and/or a weekly repetition).
 */
return new class extends Migration
{
    private const COURT_COLUMNS = [
        'material' => 'varchar(30)',
        'floor' => 'varchar(30)',
        'walls' => 'varchar(30)',
        'orientation' => 'varchar(30)',
        'setting' => 'varchar(20)',
        'status' => "varchar(20) NOT NULL DEFAULT 'operational'",
        'hasLighting' => 'boolean NOT NULL DEFAULT false',
        'notes' => 'varchar(200)',
    ];

    public function up(): void
    {
        foreach (self::COURT_COLUMNS as $column => $type) {
            DB::statement("ALTER TABLE \"Court\" ADD COLUMN IF NOT EXISTS \"{$column}\" {$type}");
        }

        // Courts switched off before this migration were "closed", not "operational".
        DB::statement("UPDATE \"Court\" SET \"status\" = 'closed' WHERE \"isActive\" = false AND \"status\" = 'operational'");

        DB::statement('ALTER TABLE "Court" DROP CONSTRAINT IF EXISTS "Court_status_valid"');
        DB::statement("ALTER TABLE \"Court\" ADD CONSTRAINT \"Court_status_valid\" CHECK (\"status\" IN ('operational','maintenance','closed'))");

        DB::statement('CREATE TABLE IF NOT EXISTS "CourtBlock" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            "clubId" uuid NOT NULL REFERENCES "Club"("id") ON DELETE CASCADE,
            "courtId" uuid NOT NULL REFERENCES "Court"("id") ON DELETE CASCADE,
            "startsAt" timestamptz NOT NULL,
            "endsAt" timestamptz NOT NULL,
            "reason" varchar(20) NOT NULL,
            "note" varchar(200),
            "groupId" uuid,
            "createdBy" uuid,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT "CourtBlock_period_valid" CHECK ("endsAt" > "startsAt")
        )');
        DB::statement('CREATE INDEX IF NOT EXISTS "CourtBlock_court_period" ON "CourtBlock" ("courtId", "startsAt", "endsAt")');
        DB::statement('CREATE INDEX IF NOT EXISTS "CourtBlock_club_period" ON "CourtBlock" ("clubId", "startsAt")');
        DB::statement('CREATE INDEX IF NOT EXISTS "CourtBlock_group" ON "CourtBlock" ("groupId")');
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS "CourtBlock"');
        DB::statement('ALTER TABLE "Court" DROP CONSTRAINT IF EXISTS "Court_status_valid"');

        foreach (array_keys(self::COURT_COLUMNS) as $column) {
            DB::statement("ALTER TABLE \"Court\" DROP COLUMN IF EXISTS \"{$column}\"");
        }
    }
};
