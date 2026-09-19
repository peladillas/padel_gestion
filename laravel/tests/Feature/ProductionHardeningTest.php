<?php

use App\Enums\Role;
use App\Models\Player;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

beforeEach(function () {
    // Limiters key on IP in the (array) cache; start every test clean.
    Cache::flush();
    RateLimiter::clear('x');
});

// ── health ──────────────────────────────────────────────────────────

test('the health endpoint reports the database and needs no auth', function () {
    $this->getJson('/api/health')
        ->assertOk()
        ->assertJsonPath('status', 'ok')
        ->assertJsonPath('db', 'up');
});

// ── security headers ────────────────────────────────────────────────

test('api responses carry security headers and are never cached', function () {
    $r = $this->getJson('/api/health');

    expect($r->headers->get('X-Content-Type-Options'))->toBe('nosniff');
    expect($r->headers->get('X-Frame-Options'))->toBe('DENY');
    expect($r->headers->get('Referrer-Policy'))->toBe('no-referrer');
    expect($r->headers->get('Cache-Control'))->toContain('no-store');
});

test('error responses also carry the security headers', function () {
    $r = $this->getJson('/api/players');   // 401, no token

    $r->assertUnauthorized();
    expect($r->headers->get('X-Content-Type-Options'))->toBe('nosniff');
});

// ── rate limiting ───────────────────────────────────────────────────

test('login is limited to 20 attempts per 15 minutes per IP', function () {
    for ($i = 0; $i < 20; $i++) {
        $this->postJson('/api/auth/login', ['email' => 'nobody@test.local', 'password' => 'wrong'])->assertStatus(401);
    }

    $this->postJson('/api/auth/login', ['email' => 'nobody@test.local', 'password' => 'wrong'])->assertStatus(429);
});

test('password recovery is limited to 5 requests per hour', function () {
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@test.local'])->assertOk();
    }

    $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@test.local'])->assertStatus(429);
});

test('one client being throttled does not throttle another IP', function () {
    for ($i = 0; $i < 21; $i++) {
        $this->postJson('/api/auth/login', ['email' => 'nobody@test.local', 'password' => 'wrong']);
    }

    $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.9'])
        ->postJson('/api/auth/login', ['email' => 'nobody@test.local', 'password' => 'wrong'])
        ->assertStatus(401);
});

test('behind a trusted proxy the limiter keys on the forwarded client IP, not the proxy', function () {
    // Two different real clients arriving through the SAME proxy address.
    $proxy = ['REMOTE_ADDR' => '10.0.0.5'];

    for ($i = 0; $i < 21; $i++) {
        $this->withServerVariables($proxy)->withHeader('X-Forwarded-For', '198.51.100.1')
            ->postJson('/api/auth/login', ['email' => 'a@test.local', 'password' => 'wrong']);
    }

    $this->withServerVariables($proxy)->withHeader('X-Forwarded-For', '198.51.100.2')
        ->postJson('/api/auth/login', ['email' => 'b@test.local', 'password' => 'wrong'])
        ->assertStatus(401);
});

test('rate limits can be switched off for local development', function () {
    config(['bonapinta.rate_limits_enabled' => false]);

    for ($i = 0; $i < 25; $i++) {
        $this->postJson('/api/auth/login', ['email' => 'nobody@test.local', 'password' => 'wrong'])->assertStatus(401);
    }
});

// ── secrets never reach production logs ─────────────────────────────

test('activation/verification links are logged outside production but never in production', function () {
    $service = new class extends \App\Services\Auth\AuthService
    {
        public function __construct() {}

        public function probe(string $m): void
        {
            $this->devLink($m);
        }
    };

    \Illuminate\Support\Facades\Log::shouldReceive('info')->once()->with('VERIFY URL x');
    $service->probe('VERIFY URL x');

    app()->detectEnvironment(fn () => 'production');
    \Illuminate\Support\Facades\Log::shouldReceive('info')->never();
    $service->probe('VERIFY URL secret-token');
    app()->detectEnvironment(fn () => 'testing');
});

// ── uploads path traversal ──────────────────────────────────────────

test('uploads cannot escape the uploads directory, even into a sibling with the same prefix', function () {
    $base = sys_get_temp_dir().'/bp-uploads-'.uniqid();
    $sibling = $base.'-evil';
    mkdir($base);
    mkdir($sibling);
    file_put_contents($base.'/ok.txt', 'fine');
    file_put_contents($sibling.'/secret.txt', 'leak');
    config(['bonapinta.uploads_path' => $base]);

    $this->get('/uploads/ok.txt')->assertOk();
    $this->get('/uploads/../'.basename($sibling).'/secret.txt')->assertNotFound();
});

// ── bootstrap commands ──────────────────────────────────────────────

test('create-admin makes an activated SUPER_ADMIN that can log in', function () {
    $this->artisan('bonapinta:create-admin', ['email' => 'Boss@Test.Local', '--name' => 'Jefe', '--password' => 'supersecret1'])
        ->assertSuccessful();

    $user = User::where('email', 'boss@test.local')->first();
    expect($user->role)->toBe(Role::SUPER_ADMIN)->and($user->isActivated)->toBeTrue();
    expect(Player::where('userId', $user->id)->value('name'))->toBe('Jefe');
    expect(Hash::check('supersecret1', $user->password))->toBeTrue();
});

test('create-admin rejects weak passwords and promotes existing accounts without touching the password', function () {
    $this->artisan('bonapinta:create-admin', ['email' => 'weak@test.local', '--password' => 'short'])->assertFailed();
    expect(User::where('email', 'weak@test.local')->exists())->toBeFalse();

    [$existing] = parityUser('promote@test.local');
    $hash = $existing->password;
    $this->artisan('bonapinta:create-admin', ['email' => 'promote@test.local'])->assertSuccessful();

    $existing->refresh();
    expect($existing->role)->toBe(Role::SUPER_ADMIN)->and($existing->password)->toBe($hash);
});

test('check-config fails production for a weak or missing setup and passes a good one', function () {
    config([
        'bonapinta.jwt_secret' => 'short', 'app.debug' => true, 'mail.default' => 'log',
        'bonapinta.resend_api_key' => null, 'bonapinta.frontend_url' => 'http://insecure',
        'bonapinta.rate_limits_enabled' => false,
    ]);

    $this->artisan('bonapinta:check-config', ['--strict' => true])
        ->expectsOutputToContain('JWT_SECRET')
        ->expectsOutputToContain('APP_DEBUG')
        ->expectsOutputToContain('MAIL_MAILER')
        ->expectsOutputToContain('RESEND_API_KEY')
        ->expectsOutputToContain('https://')
        ->expectsOutputToContain('rate limits')
        ->assertFailed();

    $uploads = sys_get_temp_dir().'/bp-uploads-ok-'.uniqid();
    mkdir($uploads);
    config([
        'bonapinta.jwt_secret' => str_repeat('a', 40), 'app.key' => 'base64:'.base64_encode(random_bytes(32)),
        'app.debug' => false, 'mail.default' => 'resend', 'bonapinta.resend_api_key' => 're_test',
        'bonapinta.frontend_url' => 'https://bonapinta.com', 'bonapinta.rate_limits_enabled' => true,
        'bonapinta.uploads_path' => $uploads,
    ]);

    $this->artisan('bonapinta:check-config', ['--strict' => true])->expectsOutputToContain('OK')->assertSuccessful();
});
