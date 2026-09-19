<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Notification;

/**
 * New (not an Express port) — no notification system existed before.
 * Every account (admin or player, including admins without a Player
 * row) gets one, keyed by User.id. Read/archived are independent
 * flags, not a single status — an archived notification keeps
 * whatever read state it had, matching how email clients treat
 * "archive" (a shelf, not a trash can).
 */
class NotificationService
{
    protected static function error(string $message, int $status): ApiException
    {
        return new ApiException($message, $status);
    }

    public function create(string $userId, string $type, string $title, ?string $body = null, ?string $actionUrl = null): Notification
    {
        return Notification::create([
            'userId' => $userId,
            'type' => $type,
            'title' => $title,
            'body' => $body,
            'actionUrl' => $actionUrl,
            // Explicit rather than relying on the DB default — a
            // freshly created Eloquent model doesn't re-fetch the row,
            // so an omitted column would read as null in memory (only
            // matters for whatever runs before another findOrFail).
            'isRead' => false,
            'isArchived' => false,
        ]);
    }

    /** @return array<int, Notification> */
    public function listForUser(string $userId, bool $archived = false): array
    {
        return Notification::where('userId', $userId)
            ->where('isArchived', $archived)
            ->orderByDesc('createdAt')
            ->get()
            ->all();
    }

    public function unreadCount(string $userId): int
    {
        return Notification::where('userId', $userId)
            ->where('isRead', false)
            ->where('isArchived', false)
            ->count();
    }

    protected function findOwned(string $id, string $userId): Notification
    {
        $notification = Notification::where('userId', $userId)->find($id);

        if (! $notification) {
            throw self::error('Notificación no encontrada', 404);
        }

        return $notification;
    }

    public function markRead(string $id, string $userId): Notification
    {
        $notification = $this->findOwned($id, $userId);

        if (! $notification->isRead) {
            $notification->update(['isRead' => true, 'readAt' => now()]);
        }

        return $notification;
    }

    public function markAllRead(string $userId): void
    {
        Notification::where('userId', $userId)
            ->where('isRead', false)
            ->update(['isRead' => true, 'readAt' => now()]);
    }

    public function archive(string $id, string $userId): Notification
    {
        $notification = $this->findOwned($id, $userId);
        $notification->update(['isArchived' => true, 'archivedAt' => now()]);

        return $notification;
    }

    public function unarchive(string $id, string $userId): Notification
    {
        $notification = $this->findOwned($id, $userId);
        $notification->update(['isArchived' => false, 'archivedAt' => null]);

        return $notification;
    }
}
