<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * New tables, not a Prisma port — no messaging existed in the Express
 * app at all.
 *
 * `Conversation` covers two shapes under one `type` discriminator:
 *   - type='user':  a DM between two players. userAId/userBId are
 *     always stored canonicalized (userAId < userBId as plain string
 *     comparison) so "A messages B" and "B messages A" resolve to the
 *     same row instead of creating a duplicate — see
 *     MessagingService::startOrGetUserConversation().
 *   - type='club':  userAId is always the PLAYER side, clubId the
 *     club. Any admin of that club can see and reply to it (a shared
 *     inbox, not tied to one specific admin) — see
 *     MessagingService::listConversations().
 *
 * `Message.readAt` is set once, by whoever RECEIVES it (never the
 * sender) — enough for a 1:1 conversation; a club conversation's
 * shared-inbox read state is still per-message, just checked/written
 * by whichever admin opens it.
 *
 * `Block` records who blocked whom. blockerUserId XOR blockerClubId is
 * set — blockerClubId means an admin blocked "as the club" (applies
 * to every admin of that club, not just the one who clicked it), never
 * both. Same XOR shape for targetUserId/targetClubId.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('Conversation', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type'); // 'user' | 'club'
            $table->uuid('userAId');
            $table->uuid('userBId')->nullable();
            $table->uuid('clubId')->nullable();
            $table->timestamp('lastMessageAt')->nullable();
            $table->timestamp('createdAt')->useCurrent();

            $table->foreign('userAId')->references('id')->on('User')->onDelete('cascade');
            $table->foreign('userBId')->references('id')->on('User')->onDelete('cascade');
            $table->foreign('clubId')->references('id')->on('Club')->onDelete('cascade');
            $table->unique(['type', 'userAId', 'userBId']);
            $table->unique(['type', 'userAId', 'clubId']);
            $table->index('clubId');
        });

        Schema::create('Message', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('conversationId');
            $table->uuid('senderUserId');
            $table->text('body');
            $table->timestamp('readAt')->nullable();
            $table->timestamp('createdAt')->useCurrent();

            $table->foreign('conversationId')->references('id')->on('Conversation')->onDelete('cascade');
            $table->foreign('senderUserId')->references('id')->on('User')->onDelete('cascade');
            $table->index('conversationId');
        });

        Schema::create('Block', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('blockerUserId')->nullable();
            $table->uuid('blockerClubId')->nullable();
            $table->string('targetType'); // 'user' | 'club'
            $table->uuid('targetUserId')->nullable();
            $table->uuid('targetClubId')->nullable();
            $table->timestamp('createdAt')->useCurrent();

            $table->foreign('blockerUserId')->references('id')->on('User')->onDelete('cascade');
            $table->foreign('blockerClubId')->references('id')->on('Club')->onDelete('cascade');
            $table->foreign('targetUserId')->references('id')->on('User')->onDelete('cascade');
            $table->foreign('targetClubId')->references('id')->on('Club')->onDelete('cascade');
            $table->index(['blockerUserId', 'blockerClubId']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('Block');
        Schema::dropIfExists('Message');
        Schema::dropIfExists('Conversation');
    }
};
