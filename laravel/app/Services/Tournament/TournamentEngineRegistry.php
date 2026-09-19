<?php

namespace App\Services\Tournament;

use App\Services\Tournament\Contracts\MatchGeneratorContract;
use App\Services\Tournament\Contracts\RotationConstraintContract;

/**
 * Container-bound singleton holding the small, developer-maintained
 * library of match-generator and rotation-constraint "pieces" that admins
 * combine via a tournament's config JSON — see
 * App\Providers\TournamentEngineServiceProvider::boot() for the actual
 * registrations. This IS the extension point: adding a genuinely new
 * piece means registering a new class here once, not touching any
 * existing tournament's configuration.
 */
class TournamentEngineRegistry
{
    /** @var array<string, MatchGeneratorContract> */
    protected array $generators = [];

    /** @var array<string, RotationConstraintContract> */
    protected array $constraints = [];

    public function registerGenerator(string $key, MatchGeneratorContract $generator): static
    {
        $this->generators[$key] = $generator;

        return $this;
    }

    public function registerConstraint(string $key, RotationConstraintContract $constraint): static
    {
        $this->constraints[$key] = $constraint;

        return $this;
    }

    public function generator(string $key): MatchGeneratorContract
    {
        if (! isset($this->generators[$key])) {
            throw new \InvalidArgumentException("Generador de partidos desconocido: \"{$key}\". Disponibles: ".implode(', ', array_keys($this->generators)));
        }

        return $this->generators[$key];
    }

    public function constraint(string $key): RotationConstraintContract
    {
        if (! isset($this->constraints[$key])) {
            throw new \InvalidArgumentException("Restricción de rotación desconocida: \"{$key}\". Disponibles: ".implode(', ', array_keys($this->constraints)));
        }

        return $this->constraints[$key];
    }

    public function listGenerators(): array
    {
        return array_keys($this->generators);
    }

    public function listConstraints(): array
    {
        return array_keys($this->constraints);
    }
}
