<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * New columns, not a Prisma port — the Express app changed
 * User.email in place with just a password check (see AuthService's
 * updateEmail() docblock history). Verifying ownership of the NEW
 * address before it takes effect needs somewhere to hold the
 * requested address and its proof-of-ownership token separately from
 * the live `email` column, mirroring the same pattern already used
 * for account creation (`activationToken`/`activationTokenExpiry`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('User', function (Blueprint $table) {
            $table->string('pendingEmail')->nullable();
            $table->string('pendingEmailToken')->nullable()->unique();
            $table->timestamp('pendingEmailTokenExpiry')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('User', function (Blueprint $table) {
            $table->dropColumn(['pendingEmail', 'pendingEmailToken', 'pendingEmailTokenExpiry']);
        });
    }
};
