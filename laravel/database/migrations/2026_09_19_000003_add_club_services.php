<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Club.services: the list of services the club offers, as keys of
 * App\Support\ClubServiceCatalog (jsonb array). NULL = nothing declared yet.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('Club', 'services')) {
            DB::statement('ALTER TABLE "Club" ADD COLUMN "services" jsonb NULL');
        }
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE "Club" DROP COLUMN IF EXISTS "services"');
    }
};
