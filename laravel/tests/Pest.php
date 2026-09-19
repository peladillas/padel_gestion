<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind different classes or traits.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

function something()
{
    // ..
}

// ── Shared helpers for the tournament-parity feature tests ──────────────

/** @return array{0: \App\Models\User, 1: \App\Models\Player} */
function parityUser(string $email, \App\Enums\Role $role = \App\Enums\Role::PLAYER): array
{
    $user = \App\Models\User::create([
        'email' => $email,
        'password' => \Illuminate\Support\Facades\Hash::make('x'),
        'username' => 'u'.substr(md5($email), 0, 10),
        'isActivated' => true,
        'role' => $role,
    ]);
    $player = \App\Models\Player::create(['userId' => $user->id, 'name' => ucfirst(explode('@', $email)[0]), 'level' => 1]);

    return [$user, $player];
}

/** Authorization header for a real JWT, so tests exercise routes + middleware. */
function parityAuth(\App\Models\User $user): array
{
    return ['Authorization' => 'Bearer '.app(\App\Services\Auth\TokenService::class)->issue($user)];
}

function parityTournament(array $overrides = []): \App\Models\TournamentInstance
{
    return \App\Models\TournamentInstance::create(array_merge([
        'name' => 'Parity test', 'structure' => 'generic', 'pairingSystem' => 'fixed_pairs',
        'matchFormat' => 'sets_completos', 'status' => 'draft', 'createdBy' => (string) \Illuminate\Support\Str::uuid(),
        'config' => ['bestOf' => 3], 'resultMode' => 'creador',
    ], $overrides));
}

function parityEnroll(\App\Models\TournamentInstance $t, \App\Models\Player $p): \App\Models\TournamentParticipant
{
    return \App\Models\TournamentParticipant::create(['tournamentId' => $t->id, 'playerId' => $p->id]);
}

/** @param array<int, \App\Models\TournamentParticipant> $team1 */
function parityMatch(\App\Models\TournamentInstance $t, array $team1, array $team2, string $status = 'pending'): \App\Models\TournamentMatch
{
    return \App\Models\TournamentMatch::create([
        'tournamentId' => $t->id, 'round' => 1, 'status' => $status,
        'group' => json_encode(['team1' => array_map(fn ($p) => $p->id, $team1), 'team2' => array_map(fn ($p) => $p->id, $team2)]),
    ]);
}
