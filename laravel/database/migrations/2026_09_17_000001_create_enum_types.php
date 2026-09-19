<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Native Postgres enum types, mirroring prisma/schema.prisma's `enum Role`
 * and `enum ClubRole`. These are two of the pieces that genuinely cannot
 * be expressed via Laravel's fluent schema builder — raw SQL is required
 * both here and in production. Wrapped in DO $$ ... EXCEPTION WHEN
 * duplicate_object so this is idempotent (safe to run against a database
 * that already has these types, once this codebase is pointed at the
 * real production DB per the migration plan).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            DO $$ BEGIN
                CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'PLAYER');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        SQL);

        DB::statement(<<<'SQL'
            DO $$ BEGIN
                CREATE TYPE "ClubRole" AS ENUM ('ADMIN', 'MEMBER');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP TYPE IF EXISTS "Role"');
        DB::statement('DROP TYPE IF EXISTS "ClubRole"');
    }
};
