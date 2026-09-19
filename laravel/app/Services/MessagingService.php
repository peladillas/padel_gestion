<?php

namespace App\Services;

use App\Enums\ClubRole;
use App\Exceptions\ApiException;
use App\Models\Block;
use App\Models\Club;
use App\Models\ClubMembership;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Player;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * New (not an Express port) — no messaging existed before. See the
 * migration's docblock for the Conversation/Message/Block shapes this
 * builds on: a "user" conversation is a plain DM between two players;
 * a "club" conversation is between one player and a club, with every
 * admin of that club sharing the same inbox for it (not routed to one
 * specific admin).
 */
class MessagingService
{
    protected static function error(string $message, int $status, array $extra = []): ApiException
    {
        return new ApiException($message, $status, $extra);
    }

    /** Every clubId this user administers (ClubMembership.role = ADMIN). */
    protected function adminClubIds(User $user): Collection
    {
        return ClubMembership::where('role', ClubRole::ADMIN)
            ->whereHas('player', fn ($q) => $q->where('userId', $user->id))
            ->pluck('clubId');
    }

    protected function isClubAdmin(User $user, string $clubId): bool
    {
        return $this->adminClubIds($user)->contains($clubId);
    }

    public function startOrGetUserConversation(User $me, string $otherUserId): Conversation
    {
        if ($me->id === $otherUserId) {
            throw self::error('No podés enviarte mensajes a vos mismo', 400);
        }

        if (! User::whereKey($otherUserId)->exists()) {
            throw self::error('Usuario no encontrado', 404);
        }

        // Canonicalized (smaller id first) so "A starts with B" and "B
        // starts with A" resolve to the same row instead of two.
        [$a, $b] = $me->id < $otherUserId ? [$me->id, $otherUserId] : [$otherUserId, $me->id];

        return Conversation::firstOrCreate([
            'type' => 'user',
            'userAId' => $a,
            'userBId' => $b,
        ]);
    }

    /**
     * $targetPlayerUserId is required when $actingUser is an admin of
     * $clubId (they must say which player's conversation they're
     * opening/continuing) and ignored otherwise (a player always opens
     * their own conversation with the club).
     */
    public function startOrGetClubConversation(User $actingUser, string $clubId, ?string $targetPlayerUserId = null): Conversation
    {
        if (! Club::whereKey($clubId)->exists()) {
            throw self::error('Club no encontrado', 404);
        }

        if ($this->isClubAdmin($actingUser, $clubId)) {
            if (! $targetPlayerUserId) {
                throw self::error('Falta indicar con qué jugador es la conversación', 400);
            }

            $playerUserId = $targetPlayerUserId;
        } else {
            $playerUserId = $actingUser->id;
        }

        return Conversation::firstOrCreate([
            'type' => 'club',
            'userAId' => $playerUserId,
            'clubId' => $clubId,
        ]);
    }

    protected function ensureParticipant(Conversation $conv, User $me): void
    {
        if ($conv->type === 'user') {
            if ($me->id !== $conv->userAId && $me->id !== $conv->userBId) {
                throw self::error('No tenés acceso a esta conversación', 403);
            }

            return;
        }

        if ($me->id === $conv->userAId || $this->isClubAdmin($me, $conv->clubId)) {
            return;
        }

        throw self::error('No tenés acceso a esta conversación', 403);
    }

    public function findOwned(string $conversationId, User $me): Conversation
    {
        $conv = Conversation::find($conversationId);

        if (! $conv) {
            throw self::error('Conversación no encontrada', 404);
        }

        $this->ensureParticipant($conv, $me);

        return $conv;
    }

    /**
     * Display info for "the other side" of a conversation, from $me's
     * point of view — a player's name+avatar for a 'user' conversation,
     * the club's name+logo for a 'club' one (unless $me is the admin
     * viewing it, in which case it's the player they're talking to).
     */
    protected function otherPartyLabel(Conversation $conv, User $me): array
    {
        if ($conv->type === 'user') {
            $otherUserId = $me->id === $conv->userAId ? $conv->userBId : $conv->userAId;
            $player = Player::where('userId', $otherUserId)->first();

            return ['id' => $otherUserId, 'name' => $player?->name ?? '—', 'avatarUrl' => $player?->avatarUrl];
        }

        // type === 'club'
        if ($this->isClubAdmin($me, $conv->clubId)) {
            $player = Player::where('userId', $conv->userAId)->first();

            return ['id' => $conv->userAId, 'name' => $player?->name ?? '—', 'avatarUrl' => $player?->avatarUrl, 'isPlayer' => true];
        }

        $club = $conv->club;

        return ['id' => $conv->clubId, 'name' => $club?->name ?? '—', 'avatarUrl' => $club?->logoUrl, 'isClub' => true];
    }

    /** @return array<int, array> */
    public function listConversations(User $me, string $type): array
    {
        if ($type === 'club') {
            $adminClubIds = $this->adminClubIds($me);

            $query = $adminClubIds->isNotEmpty()
                ? Conversation::where('type', 'club')->whereIn('clubId', $adminClubIds)
                : Conversation::where('type', 'club')->where('userAId', $me->id);
        } else {
            $query = Conversation::where('type', 'user')
                ->where(fn ($q) => $q->where('userAId', $me->id)->orWhere('userBId', $me->id));
        }

        $conversations = $query->orderByDesc(DB::raw('COALESCE("lastMessageAt", "createdAt")'))->get();

        return $conversations->map(function (Conversation $conv) use ($me) {
            $lastMessage = Message::where('conversationId', $conv->id)->orderByDesc('createdAt')->first();
            $unread = Message::where('conversationId', $conv->id)
                ->where('senderUserId', '!=', $me->id)
                ->whereNull('readAt')
                ->count();

            return array_merge(['id' => $conv->id, 'type' => $conv->type, 'unread' => $unread,
                'lastMessage' => $lastMessage?->body, 'lastMessageAt' => $conv->lastMessageAt,
            ], ['with' => $this->otherPartyLabel($conv, $me)]);
        })->all();
    }

    /** @return array<int, Message> */
    public function getMessages(Conversation $conv, User $me): array
    {
        $this->ensureParticipant($conv, $me);

        $messages = Message::where('conversationId', $conv->id)->orderBy('createdAt')->get();

        Message::where('conversationId', $conv->id)
            ->where('senderUserId', '!=', $me->id)
            ->whereNull('readAt')
            ->update(['readAt' => now()]);

        return $messages->all();
    }

    protected function isBlockedBetween(Conversation $conv): bool
    {
        if ($conv->type === 'user') {
            return Block::where(function ($q) use ($conv) {
                $q->where('blockerUserId', $conv->userAId)->where('targetType', 'user')->where('targetUserId', $conv->userBId);
            })->orWhere(function ($q) use ($conv) {
                $q->where('blockerUserId', $conv->userBId)->where('targetType', 'user')->where('targetUserId', $conv->userAId);
            })->exists();
        }

        // type === 'club': blocked if the player blocked the club, or
        // the club (any of its admins, acting as the club) blocked the player.
        return Block::where(function ($q) use ($conv) {
            $q->where('blockerUserId', $conv->userAId)->where('targetType', 'club')->where('targetClubId', $conv->clubId);
        })->orWhere(function ($q) use ($conv) {
            $q->where('blockerClubId', $conv->clubId)->where('targetType', 'user')->where('targetUserId', $conv->userAId);
        })->exists();
    }

    public function sendMessage(Conversation $conv, User $me, string $body): Message
    {
        $this->ensureParticipant($conv, $me);

        $body = trim($body);

        if (! $body) {
            throw self::error('El mensaje no puede estar vacío', 400);
        }

        if ($this->isBlockedBetween($conv)) {
            throw self::error('No podés enviar mensajes en esta conversación — hay un bloqueo activo', 403);
        }

        return DB::transaction(function () use ($conv, $me, $body) {
            $message = Message::create([
                'conversationId' => $conv->id,
                'senderUserId' => $me->id,
                'body' => $body,
            ]);

            $conv->update(['lastMessageAt' => now()]);

            return $message;
        });
    }

    /**
     * $asClubId: when set, $actingUser must be an admin of that club —
     * the block is recorded as coming from the CLUB (applies to every
     * admin of it, not just whoever clicked it), not from that admin
     * personally.
     */
    public function block(User $actingUser, string $targetType, string $targetId, ?string $asClubId = null): void
    {
        if (! in_array($targetType, ['user', 'club'], true)) {
            throw self::error("targetType debe ser 'user' o 'club'", 400);
        }

        if (! $targetId) {
            throw self::error('targetId requerido', 400);
        }

        $targetExists = $targetType === 'user' ? User::whereKey($targetId)->exists() : Club::whereKey($targetId)->exists();

        if (! $targetExists) {
            throw self::error($targetType === 'user' ? 'Usuario no encontrado' : 'Club no encontrado', 404);
        }

        if ($asClubId && ! $this->isClubAdmin($actingUser, $asClubId)) {
            throw self::error('No administrás ese club', 403);
        }

        if ($targetType === 'user' && $actingUser->id === $targetId && ! $asClubId) {
            throw self::error('No podés bloquearte a vos mismo', 400);
        }

        $data = [
            'blockerUserId' => $asClubId ? null : $actingUser->id,
            'blockerClubId' => $asClubId,
            'targetType' => $targetType,
            'targetUserId' => $targetType === 'user' ? $targetId : null,
            'targetClubId' => $targetType === 'club' ? $targetId : null,
        ];

        if (! Block::where($data)->exists()) {
            Block::create($data);
        }
    }

    public function unblock(User $actingUser, string $targetType, string $targetId, ?string $asClubId = null): void
    {
        if (! in_array($targetType, ['user', 'club'], true)) {
            throw self::error("targetType debe ser 'user' o 'club'", 400);
        }

        if (! $targetId) {
            throw self::error('targetId requerido', 400);
        }

        if ($asClubId && ! $this->isClubAdmin($actingUser, $asClubId)) {
            throw self::error('No administrás ese club', 403);
        }

        Block::where('blockerUserId', $asClubId ? null : $actingUser->id)
            ->where('blockerClubId', $asClubId)
            ->where('targetType', $targetType)
            ->where($targetType === 'user' ? 'targetUserId' : 'targetClubId', $targetId)
            ->delete();
    }

    /** @return array<int, Block> */
    public function listBlocked(User $me): array
    {
        $clubIds = $this->adminClubIds($me);

        return Block::where(fn ($q) => $q->where('blockerUserId', $me->id)
            ->when($clubIds->isNotEmpty(), fn ($qq) => $qq->orWhereIn('blockerClubId', $clubIds)))
            ->orderByDesc('createdAt')
            ->get()
            ->all();
    }

    /** @return array{user: int, club: int} */
    public function unreadCounts(User $me): array
    {
        $userConvIds = Conversation::where('type', 'user')
            ->where(fn ($q) => $q->where('userAId', $me->id)->orWhere('userBId', $me->id))
            ->pluck('id');

        $adminClubIds = $this->adminClubIds($me);
        $clubConvIds = $adminClubIds->isNotEmpty()
            ? Conversation::where('type', 'club')->whereIn('clubId', $adminClubIds)->pluck('id')
            : Conversation::where('type', 'club')->where('userAId', $me->id)->pluck('id');

        $countUnread = fn ($ids) => $ids->isEmpty() ? 0 : Message::whereIn('conversationId', $ids)
            ->where('senderUserId', '!=', $me->id)
            ->whereNull('readAt')
            ->count();

        return ['user' => $countUnread($userConvIds), 'club' => $countUnread($clubConvIds)];
    }
}
