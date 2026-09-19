<?php

use App\Enums\ClubRole;
use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\Club;
use App\Models\ClubMembership;
use App\Models\Player;
use App\Models\User;
use App\Services\MessagingService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

function makeMsgUser(string $email, string $name): array
{
    $user = User::create([
        'email' => $email,
        'password' => Hash::make('x'),
        'username' => 'm'.substr(md5($email), 0, 10),
        'isActivated' => true,
        'role' => Role::PLAYER,
    ]);
    $player = Player::create(['userId' => $user->id, 'name' => $name, 'level' => 1]);

    return [$user, $player];
}

function makeMsgClub(string $name): Club
{
    return Club::create(['name' => $name, 'slug' => strtolower(str_replace(' ', '-', $name)).'-'.substr(md5($name.microtime()), 0, 6)]);
}

test('starting a user conversation twice from either side resolves to the same conversation', function () {
    [$a] = makeMsgUser('msg-a@test.local', 'A');
    [$b] = makeMsgUser('msg-b@test.local', 'B');
    $service = app(MessagingService::class);

    $conv1 = $service->startOrGetUserConversation($a, $b->id);
    $conv2 = $service->startOrGetUserConversation($b, $a->id);

    expect($conv1->id)->toBe($conv2->id);
});

test('you cannot start a conversation with yourself', function () {
    [$a] = makeMsgUser('msg-self@test.local', 'A');

    expect(fn () => app(MessagingService::class)->startOrGetUserConversation($a, $a->id))
        ->toThrow(ApiException::class);
});

test('sending a message appears in getMessages and marks it read for the recipient only', function () {
    [$a] = makeMsgUser('msg-send-a@test.local', 'A');
    [$b] = makeMsgUser('msg-send-b@test.local', 'B');
    $service = app(MessagingService::class);
    $conv = $service->startOrGetUserConversation($a, $b->id);

    $service->sendMessage($conv, $a, 'Hola B');

    expect($service->unreadCounts($b)['user'])->toBe(1);
    expect($service->unreadCounts($a)['user'])->toBe(0);

    $messages = $service->getMessages($conv, $b);
    expect($messages)->toHaveCount(1);
    expect($messages[0]->body)->toBe('Hola B');

    expect($service->unreadCounts($b)['user'])->toBe(0);
});

test('a non-participant cannot read or send in a user conversation', function () {
    [$a] = makeMsgUser('msg-np-a@test.local', 'A');
    [$b] = makeMsgUser('msg-np-b@test.local', 'B');
    [$intruder] = makeMsgUser('msg-np-c@test.local', 'C');
    $service = app(MessagingService::class);
    $conv = $service->startOrGetUserConversation($a, $b->id);

    expect(fn () => $service->findOwned($conv->id, $intruder))->toThrow(ApiException::class);
    expect(fn () => $service->sendMessage($conv, $intruder, 'hi'))->toThrow(ApiException::class);
});

test('blocking prevents sending in either direction until unblocked', function () {
    [$a] = makeMsgUser('msg-block-a@test.local', 'A');
    [$b] = makeMsgUser('msg-block-b@test.local', 'B');
    $service = app(MessagingService::class);
    $conv = $service->startOrGetUserConversation($a, $b->id);

    $service->block($a, 'user', $b->id);

    expect(fn () => $service->sendMessage($conv, $a, 'still blocked from my side too'))->toThrow(ApiException::class);
    expect(fn () => $service->sendMessage($conv, $b, 'blocked'))->toThrow(ApiException::class);

    $service->unblock($a, 'user', $b->id);
    $sent = $service->sendMessage($conv, $b, 'unblocked now');
    expect($sent->body)->toBe('unblocked now');
});

test('a player can start a club conversation and message it, an admin of that club can see and reply', function () {
    [$player] = makeMsgUser('msg-club-player@test.local', 'Player');
    [$admin, $adminPlayer] = makeMsgUser('msg-club-admin@test.local', 'Admin');
    $club = makeMsgClub('Msg Club A');
    ClubMembership::create(['clubId' => $club->id, 'playerId' => $adminPlayer->id, 'role' => ClubRole::ADMIN, 'status' => 'active']);

    $service = app(MessagingService::class);
    $conv = $service->startOrGetClubConversation($player, $club->id);
    $service->sendMessage($conv, $player, 'Hola club');

    $adminConvs = $service->listConversations($admin, 'club');
    expect($adminConvs)->toHaveCount(1);
    expect($adminConvs[0]['unread'])->toBe(1);

    $service->sendMessage($conv, $admin, 'Hola jugador, te leemos');
    $playerMessages = $service->getMessages($conv, $player);
    expect($playerMessages)->toHaveCount(2);
});

test('an admin must specify which player when starting a club conversation, a player never does', function () {
    [$player] = makeMsgUser('msg-club2-player@test.local', 'Player');
    [$admin, $adminPlayer] = makeMsgUser('msg-club2-admin@test.local', 'Admin');
    $club = makeMsgClub('Msg Club B');
    ClubMembership::create(['clubId' => $club->id, 'playerId' => $adminPlayer->id, 'role' => ClubRole::ADMIN, 'status' => 'active']);

    $service = app(MessagingService::class);

    expect(fn () => $service->startOrGetClubConversation($admin, $club->id))->toThrow(ApiException::class);

    $conv = $service->startOrGetClubConversation($admin, $club->id, $player->id);
    expect($conv->userAId)->toBe($player->id);
    expect($conv->clubId)->toBe($club->id);
});

test('two different admins of the same club share the same conversation inbox', function () {
    [$player] = makeMsgUser('msg-shared-player@test.local', 'Player');
    [$admin1, $adminPlayer1] = makeMsgUser('msg-shared-admin1@test.local', 'Admin1');
    [$admin2, $adminPlayer2] = makeMsgUser('msg-shared-admin2@test.local', 'Admin2');
    $club = makeMsgClub('Msg Shared Club');
    ClubMembership::create(['clubId' => $club->id, 'playerId' => $adminPlayer1->id, 'role' => ClubRole::ADMIN, 'status' => 'active']);
    ClubMembership::create(['clubId' => $club->id, 'playerId' => $adminPlayer2->id, 'role' => ClubRole::ADMIN, 'status' => 'active']);

    $service = app(MessagingService::class);
    $conv = $service->startOrGetClubConversation($player, $club->id);
    $service->sendMessage($conv, $player, 'hola');

    $conv1 = $service->startOrGetClubConversation($admin1, $club->id, $player->id);
    $conv2 = $service->startOrGetClubConversation($admin2, $club->id, $player->id);
    expect($conv1->id)->toBe($conv2->id);
    expect($service->listConversations($admin2, 'club'))->toHaveCount(1);
});

test('a club-level block (asClubId) stops the player from messaging any admin of that club', function () {
    [$player] = makeMsgUser('msg-clubblock-player@test.local', 'Player');
    [$admin, $adminPlayer] = makeMsgUser('msg-clubblock-admin@test.local', 'Admin');
    $club = makeMsgClub('Msg Block Club');
    ClubMembership::create(['clubId' => $club->id, 'playerId' => $adminPlayer->id, 'role' => ClubRole::ADMIN, 'status' => 'active']);

    $service = app(MessagingService::class);
    $conv = $service->startOrGetClubConversation($player, $club->id);

    $service->block($admin, 'user', $player->id, asClubId: $club->id);

    expect(fn () => $service->sendMessage($conv, $player, 'let me in'))->toThrow(ApiException::class);
});

test('only a club admin can block on behalf of that club', function () {
    [$notAdmin] = makeMsgUser('msg-notadmin@test.local', 'NotAdmin');
    $club = makeMsgClub('Msg NoAdmin Club');

    expect(fn () => app(MessagingService::class)->block($notAdmin, 'user', $notAdmin->id, asClubId: $club->id))
        ->toThrow(ApiException::class);
});

test('blocking rejects an empty targetId instead of hitting the database with it', function () {
    [$a] = makeMsgUser('msg-emptytarget@test.local', 'A');

    expect(fn () => app(MessagingService::class)->block($a, 'user', ''))->toThrow(ApiException::class);
    expect(fn () => app(MessagingService::class)->unblock($a, 'user', ''))->toThrow(ApiException::class);
});

test('blocking a nonexistent user or club is rejected', function () {
    [$a] = makeMsgUser('msg-ghosttarget@test.local', 'A');

    expect(fn () => app(MessagingService::class)->block($a, 'user', (string) Str::uuid()))->toThrow(ApiException::class);
    expect(fn () => app(MessagingService::class)->block($a, 'club', (string) Str::uuid()))->toThrow(ApiException::class);
});
