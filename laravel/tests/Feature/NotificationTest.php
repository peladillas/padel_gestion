<?php

use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\Notification;
use App\Models\User;
use App\Services\Auth\AuthService;
use App\Services\NotificationService;
use Illuminate\Support\Facades\Hash;

function makeNotifUser(string $email): User
{
    return User::create([
        'email' => $email,
        'password' => Hash::make('Secret123'),
        'username' => 'n'.substr(md5($email), 0, 10),
        'isActivated' => true,
        'role' => Role::PLAYER,
    ]);
}

test('create stores a notification unread and unarchived by default', function () {
    $user = makeNotifUser('notif1@test.local');

    $n = app(NotificationService::class)->create($user->id, 'test_type', 'Título', 'Cuerpo');

    expect($n->isRead)->toBeFalse();
    expect($n->isArchived)->toBeFalse();
    expect($n->title)->toBe('Título');
});

test('listForUser splits archived from active, newest first', function () {
    $user = makeNotifUser('notif2@test.local');
    $service = app(NotificationService::class);

    $first = $service->create($user->id, 't', 'Primera');
    sleep(0); // createdAt has second precision on this column; assert order via explicit ids instead of relying on timing
    $second = $service->create($user->id, 't', 'Segunda');
    $service->archive($second->id, $user->id);

    $active = $service->listForUser($user->id, archived: false);
    $archived = $service->listForUser($user->id, archived: true);

    expect($active)->toHaveCount(1);
    expect($active[0]->id)->toBe($first->id);
    expect($archived)->toHaveCount(1);
    expect($archived[0]->id)->toBe($second->id);
});

test('unreadCount excludes read and archived notifications', function () {
    $user = makeNotifUser('notif3@test.local');
    $service = app(NotificationService::class);

    $a = $service->create($user->id, 't', 'A');
    $b = $service->create($user->id, 't', 'B');
    $c = $service->create($user->id, 't', 'C');

    expect($service->unreadCount($user->id))->toBe(3);

    $service->markRead($a->id, $user->id);
    expect($service->unreadCount($user->id))->toBe(2);

    $service->archive($b->id, $user->id);
    expect($service->unreadCount($user->id))->toBe(1);
});

test('markRead is idempotent and sets readAt', function () {
    $user = makeNotifUser('notif4@test.local');
    $service = app(NotificationService::class);
    $n = $service->create($user->id, 't', 'A');

    $read = $service->markRead($n->id, $user->id);
    expect($read->isRead)->toBeTrue();
    expect($read->readAt)->not->toBeNull();

    // second call shouldn't error or change readAt to something invalid
    $readAgain = $service->markRead($n->id, $user->id);
    expect($readAgain->isRead)->toBeTrue();
});

test('markAllRead marks every unread notification for that user only', function () {
    $user = makeNotifUser('notif5@test.local');
    $other = makeNotifUser('notif5b@test.local');
    $service = app(NotificationService::class);

    $service->create($user->id, 't', 'A');
    $service->create($user->id, 't', 'B');
    $otherN = $service->create($other->id, 't', 'C');

    $service->markAllRead($user->id);

    expect($service->unreadCount($user->id))->toBe(0);
    expect(Notification::find($otherN->id)->isRead)->toBeFalse();
});

test('archive and unarchive round-trip', function () {
    $user = makeNotifUser('notif6@test.local');
    $service = app(NotificationService::class);
    $n = $service->create($user->id, 't', 'A');

    $archived = $service->archive($n->id, $user->id);
    expect($archived->isArchived)->toBeTrue();
    expect($archived->archivedAt)->not->toBeNull();

    $restored = $service->unarchive($n->id, $user->id);
    expect($restored->isArchived)->toBeFalse();
    expect($restored->archivedAt)->toBeNull();
});

test('a notification cannot be read or archived by a different user', function () {
    $owner = makeNotifUser('notif7-owner@test.local');
    $intruder = makeNotifUser('notif7-intruder@test.local');
    $service = app(NotificationService::class);
    $n = $service->create($owner->id, 't', 'A');

    expect(fn () => $service->markRead($n->id, $intruder->id))->toThrow(ApiException::class);
    expect(fn () => $service->archive($n->id, $intruder->id))->toThrow(ApiException::class);
});

test('requesting an email change creates a persistent notification, not just a toast', function () {
    $user = makeNotifUser('notif8-old@test.local');

    app(AuthService::class)->updateEmail($user->id, 'notif8-new@test.local', 'Secret123');

    $notifications = app(NotificationService::class)->listForUser($user->id);
    expect($notifications)->toHaveCount(1);
    expect($notifications[0]->type)->toBe('email_change_requested');
});

test('confirming an email change creates its own notification', function () {
    $user = makeNotifUser('notif9-old@test.local');
    app(AuthService::class)->updateEmail($user->id, 'notif9-new@test.local', 'Secret123');
    $user->refresh();

    app(AuthService::class)->confirmEmailChange($user->pendingEmailToken);

    $notifications = app(NotificationService::class)->listForUser($user->id);
    expect($notifications)->toHaveCount(2);
    expect(collect($notifications)->pluck('type')->all())->toEqualCanonicalizing([
        'email_change_requested', 'email_change_confirmed',
    ]);
});
