<?php

namespace App\Services\Tournament;

use App\Exceptions\ApiException;
use App\Models\TournamentInstance;
use App\Models\TournamentType;
use App\Services\Tournament\Contracts\TournamentEngineContract;
use Illuminate\Container\Container;

/**
 * Resolves the right engine for a tournament: the shared GenericEngine
 * (config-interpreted) for `engine='configurable'` types, or an instance
 * of the type's own `custom_class` for `engine='custom'` types (e.g.
 * CimaPadel) — both satisfy TournamentEngineContract identically, so
 * callers (controllers) never need an if/else on tournament type.
 */
class TournamentEngineFactory
{
    public function __construct(protected Container $container) {}

    public function forTournament(TournamentInstance $tournament): TournamentEngineContract
    {
        $type = TournamentType::where('key', $tournament->structure)->first();

        if (! $type) {
            throw new ApiException("Tipo de torneo desconocido: \"{$tournament->structure}\"", 400);
        }

        if (! $type->isCustom()) {
            return $this->container->make(GenericEngine::class);
        }

        if (! $type->custom_class || ! class_exists($type->custom_class)) {
            throw new ApiException("El tipo \"{$type->key}\" está marcado como custom pero no tiene una clase válida configurada", 500);
        }

        $engine = $this->container->make($type->custom_class);

        if (! $engine instanceof TournamentEngineContract) {
            throw new ApiException("La clase \"{$type->custom_class}\" no implementa TournamentEngineContract", 500);
        }

        return $engine;
    }
}
