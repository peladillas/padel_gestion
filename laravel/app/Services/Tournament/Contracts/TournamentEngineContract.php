<?php

namespace App\Services\Tournament\Contracts;

use App\Models\TournamentInstance;
use Illuminate\Support\Collection;

/**
 * Every tournament type — whether interpreted generically from config
 * (GenericEngine) or fully custom (e.g. CimaPadel) — implements this
 * same contract, so the rest of the app (controllers, standings views)
 * never needs to know which kind it's dealing with.
 */
interface TournamentEngineContract
{
    /**
     * Generate the next round's matches (and, for configurable engines,
     * role assignments) for the given available participant ids
     * (TournamentParticipant.id — already filtered to exclude absent/
     * withdrawn participants by the caller).
     *
     * @param array<int, string> $availableParticipantIds
     * @return Collection<int, \App\Models\TournamentMatch>
     */
    public function generateRound(TournamentInstance $tournament, array $availableParticipantIds): Collection;

    /**
     * @return array{standings: array, completedMatches: int, totalMatches: int}
     */
    public function calculateStandings(TournamentInstance $tournament): array;

    /**
     * @param array<int, \App\Models\TournamentParticipant> $participants
     * @return array{valid: bool, errors: array<int, string>}
     */
    public function validate(array $participants, array $config): array;
}
