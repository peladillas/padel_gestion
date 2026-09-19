<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * New table, not a Prisma port — no notification system existed in the
 * Express app at all (only outbound email via ResendMailer). Keyed by
 * User.id (not Player.id) so every account gets a notification center,
 * including admins without a Player row (e.g. cnsa@cnsa.com-style).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('Notification', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('userId');
            $table->string('type');
            $table->string('title');
            $table->text('body')->nullable();
            $table->string('actionUrl')->nullable();
            $table->boolean('isRead')->default(false);
            $table->timestamp('readAt')->nullable();
            $table->boolean('isArchived')->default(false);
            $table->timestamp('archivedAt')->nullable();
            $table->timestamp('createdAt')->useCurrent();

            $table->index('userId');
            $table->foreign('userId')->references('id')->on('User')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('Notification');
    }
};
