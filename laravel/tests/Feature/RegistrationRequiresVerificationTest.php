<?php

use App\Models\User;
use App\Services\Auth\AuthService;

test('plain self-registration creates an inactive account and never returns a login token', function () {
    $result = app(AuthService::class)->register([
        'email' => 'newplayer@test.local',
        'password' => 'secret123',
        'name' => 'New Player',
    ]);

    expect($result)->not->toHaveKey('token');
    expect($result)->not->toHaveKey('user');

    $user = User::where('email', 'newplayer@test.local')->first();
    expect($user->isActivated)->toBeFalse();
    expect($user->activationToken)->not->toBeNull();
});

test('the same activation token from register() works with the existing verify-email flow', function () {
    app(AuthService::class)->register([
        'email' => 'verifyme@test.local',
        'password' => 'secret123',
        'name' => 'Verify Me',
    ]);

    $user = User::where('email', 'verifyme@test.local')->first();

    $result = app(AuthService::class)->verifyEmail($user->activationToken);

    expect($result)->toHaveKey('token');
    $user->refresh();
    expect($user->isActivated)->toBeTrue();
    expect($user->activationToken)->toBeNull();
});
