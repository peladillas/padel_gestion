<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * User, Club, Court, ClubMembership, InviteCode, Player — from
 * prisma/schema.prisma. Column types below are inferred from the schema
 * (Prisma's default String -> Postgres TEXT/VARCHAR, Json -> JSONB) since
 * no @db.* type annotations are present in the source schema.
 *
 * IMPORTANT: before this migration set is ever pointed at the real
 * production database, diff it against a genuine
 * `pg_dump --schema-only` of production (per the migration plan, P0) —
 * several tournament tables are confirmed to have NO CREATE TABLE in
 * Prisma's own migration history, so schema.prisma is the best available
 * source here, not a verified one.
 *
 * Every Schema::create is guarded with hasTable() so this file stays
 * idempotent if it's ever re-run against a database that already has
 * some of these tables (e.g. production, later).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('User')) {
            Schema::create('User', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('email')->unique();
                $table->string('username')->nullable()->unique();
                $table->string('password');
                $table->string('phone')->nullable();
                $table->boolean('twoFactorEnabled')->default(false);
                $table->string('twoFactorCode')->nullable();
                $table->timestamp('twoFactorExpiry')->nullable();
                $table->string('resetToken')->nullable();
                $table->timestamp('resetTokenExpiry')->nullable();
                $table->boolean('isActivated')->default(false);
                $table->string('activationToken')->nullable();
                $table->timestamp('activationTokenExpiry')->nullable();
                $table->timestamp('createdAt')->useCurrent();
                $table->timestamp('updatedAt')->useCurrent();
            });

            DB::statement('ALTER TABLE "User" ADD COLUMN "role" "Role" NOT NULL DEFAULT \'PLAYER\'');
            DB::statement('CREATE INDEX "User_resetToken_idx" ON "User" ("resetToken")');
            DB::statement('CREATE INDEX "User_activationToken_idx" ON "User" ("activationToken")');
        }

        if (! Schema::hasTable('Club')) {
            Schema::create('Club', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('name');
                $table->string('slug')->unique();
                $table->text('description')->nullable();
                $table->string('logoUrl')->nullable();
                $table->jsonb('allowedStructures')->nullable();
                $table->jsonb('allowedPairingSystems')->nullable();
                $table->timestamp('createdAt')->useCurrent();
                $table->timestamp('updatedAt')->useCurrent();
            });
        }

        if (! Schema::hasTable('Court')) {
            Schema::create('Court', function (Blueprint $table) {
                $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
                $table->uuid('clubId');
                $table->string('name');
                $table->string('alias')->nullable();
                $table->boolean('isActive')->default(true);
                $table->timestamp('createdAt')->useCurrent();
                $table->timestamp('updatedAt')->useCurrent();

                $table->foreign('clubId')->references('id')->on('Club')->onDelete('cascade');
                $table->unique(['clubId', 'name']);
            });
        }

        if (! Schema::hasTable('Player')) {
            Schema::create('Player', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('userId')->unique();
                $table->string('name');
                $table->string('phone')->nullable();
                $table->integer('level')->default(1);
                $table->boolean('active')->default(true);
                $table->string('avatarUrl')->nullable();
                $table->date('birthDate')->nullable();
                $table->string('gender')->nullable();
                $table->string('dominantHand')->nullable();
                $table->string('position')->nullable();
                $table->boolean('isPublic')->default(true);
                $table->boolean('showStats')->default(true);
                $table->boolean('showMatches')->default(true);
                $table->boolean('showContact')->default(false);
                $table->uuid('clubId')->nullable();
                $table->timestamp('createdAt')->useCurrent();

                $table->foreign('userId')->references('id')->on('User')->onDelete('cascade');
                $table->foreign('clubId')->references('id')->on('Club')->onDelete('set null');
            });
        }

        if (! Schema::hasTable('ClubMembership')) {
            Schema::create('ClubMembership', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('clubId');
                $table->uuid('playerId');
                $table->string('status')->default('active');
                $table->timestamp('joinedAt')->useCurrent();

                $table->foreign('clubId')->references('id')->on('Club')->onDelete('cascade');
                $table->foreign('playerId')->references('id')->on('Player')->onDelete('cascade');
                $table->unique(['clubId', 'playerId']);
            });

            DB::statement('ALTER TABLE "ClubMembership" ADD COLUMN "role" "ClubRole" NOT NULL DEFAULT \'MEMBER\'');
        }

        if (! Schema::hasTable('InviteCode')) {
            Schema::create('InviteCode', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('token')->unique();
                $table->timestamp('createdAt')->useCurrent();
                $table->timestamp('expiresAt')->nullable();
                $table->integer('uses')->default(0);
                $table->integer('maxUses')->default(1);
                $table->uuid('createdBy'); // soft reference, no FK — mirrors production
                $table->string('label')->nullable();
                $table->uuid('clubId')->nullable();

                $table->foreign('clubId')->references('id')->on('Club');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('InviteCode');
        Schema::dropIfExists('ClubMembership');
        Schema::dropIfExists('Player');
        Schema::dropIfExists('Court');
        Schema::dropIfExists('Club');
        Schema::dropIfExists('User');
    }
};
