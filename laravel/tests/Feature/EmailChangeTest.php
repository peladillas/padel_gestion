<?php

use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\User;
use App\Services\Auth\AuthService;
use Illuminate\Support\Facades\Hash;

function makeAuthUser(string $email): User
{
    return User::create([
        'email' => $email,
        'password' => Hash::make('correctpass'),
        'username' => 'u'.substr(md5($email), 0, 10),
        'isActivated' => true,
        'role' => Role::PLAYER,
    ]);
}

test('requesting an email change does not touch the live email column', function () {
    $user = makeAuthUser('old@test.local');

    $result = app(AuthService::class)->updateEmail($user->id, 'new@test.local', 'correctpass');

    expect($result['pendingEmail'])->toBe('new@test.local');
    $user->refresh();
    expect($user->email)->toBe('old@test.local');
    expect($user->pendingEmail)->toBe('new@test.local');
    expect($user->pendingEmailToken)->not->toBeNull();
});

test('the wrong current password is rejected', function () {
    $user = makeAuthUser('old2@test.local');

    expect(fn () => app(AuthService::class)->updateEmail($user->id, 'new2@test.local', 'wrongpass'))
        ->toThrow(ApiException::class);

    $user->refresh();
    expect($user->pendingEmail)->toBeNull();
});

test('requesting your own current email as the new one is rejected', function () {
    $user = makeAuthUser('same@test.local');

    expect(fn () => app(AuthService::class)->updateEmail($user->id, 'same@test.local', 'correctpass'))
        ->toThrow(ApiException::class, 'Ese ya es tu email actual');
});

test('requesting an email already taken by another user is rejected', function () {
    makeAuthUser('taken@test.local');
    $user = makeAuthUser('requester@test.local');

    expect(fn () => app(AuthService::class)->updateEmail($user->id, 'taken@test.local', 'correctpass'))
        ->toThrow(ApiException::class, 'Este email ya está en uso');
});

test('confirming with a valid token flips the live email and clears pending fields', function () {
    $user = makeAuthUser('confirm-old@test.local');
    app(AuthService::class)->updateEmail($user->id, 'confirm-new@test.local', 'correctpass');
    $user->refresh();

    $result = app(AuthService::class)->confirmEmailChange($user->pendingEmailToken);

    expect($result['email'])->toBe('confirm-new@test.local');
    $user->refresh();
    expect($user->email)->toBe('confirm-new@test.local');
    expect($user->pendingEmail)->toBeNull();
    expect($user->pendingEmailToken)->toBeNull();
    expect($user->pendingEmailTokenExpiry)->toBeNull();
});

test('confirming with an expired token is rejected and the live email is unchanged', function () {
    $user = makeAuthUser('expired-old@test.local');
    app(AuthService::class)->updateEmail($user->id, 'expired-new@test.local', 'correctpass');
    $user->refresh();
    $user->forceFill(['pendingEmailTokenExpiry' => now()->subDay()])->save();

    expect(fn () => app(AuthService::class)->confirmEmailChange($user->pendingEmailToken))
        ->toThrow(ApiException::class);

    $user->refresh();
    expect($user->email)->toBe('expired-old@test.local');
});

test('confirming with an unknown token is rejected', function () {
    expect(fn () => app(AuthService::class)->confirmEmailChange('not-a-real-token'))
        ->toThrow(ApiException::class);
});

test('confirming is rejected if the requested address was taken by someone else in the meantime', function () {
    $user = makeAuthUser('race-old@test.local');
    app(AuthService::class)->updateEmail($user->id, 'race-new@test.local', 'correctpass');
    $user->refresh();

    // Someone else registers the pending address before confirmation.
    makeAuthUser('race-new@test.local');

    expect(fn () => app(AuthService::class)->confirmEmailChange($user->pendingEmailToken))
        ->toThrow(ApiException::class, 'Este email ya está en uso');

    $user->refresh();
    expect($user->email)->toBe('race-old@test.local');
});
