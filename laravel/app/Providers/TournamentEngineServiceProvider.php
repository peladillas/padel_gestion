<?php

namespace App\Providers;

use App\Services\Tournament\MatchGenerators\EliminationGenerator;
use App\Services\Tournament\MatchGenerators\RoundRobinGenerator;
use App\Services\Tournament\PartnerGrouper;
use App\Services\Tournament\RotationConstraints\MaxRoleCountPerCycle;
use App\Services\Tournament\RotationConstraints\NoConsecutiveRole;
use App\Services\Tournament\TournamentEngineRegistry;
use Illuminate\Support\ServiceProvider;

/**
 * Registers the built-in library of match-generator and
 * rotation-constraint "pieces" — see TournamentEngineRegistry's
 * docblock. Adding a genuinely new piece (not just a new combination of
 * existing ones) means adding one line here.
 */
class TournamentEngineServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(TournamentEngineRegistry::class);
    }

    public function boot(TournamentEngineRegistry $registry): void
    {
        $registry->registerGenerator('round_robin', new RoundRobinGenerator(new PartnerGrouper()));
        $registry->registerGenerator('elimination', new EliminationGenerator());

        $registry->registerConstraint('max_role_count_per_cycle', new MaxRoleCountPerCycle());
        $registry->registerConstraint('no_consecutive_role', new NoConsecutiveRole());
    }
}
