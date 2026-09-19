<?php

namespace App\Services\Tournament\Contracts;

/**
 * A pluggable "how do the participants who are actually playing this
 * round get paired up" algorithm (round robin, bracket, swiss...).
 * Registered by key in TournamentEngineRegistry; a tournament's
 * `config.matchGenerator.type` selects one.
 */
interface MatchGeneratorContract
{
    /**
     * @param array<int, array<int, string>> $units the teams available to
     *   play this round — each unit is already grouped (1 participant id
     *   for individual pairing, 2 for fixed_pairs) and already excludes
     *   anyone with a special non-playing role or an unresolved absence.
     * @param array $config the matchGenerator's own config block, e.g.
     *   {"type": "round_robin", "pairingMode": "fixed_pairs",
     *   "avoidRepeatsWithinRounds": 3}
     * @param array $context optional history a generator may use:
     *   - opponentHistory: array<int, array{round:int, a:string, b:string}>
     *     — every past match, as the two units' representative ids
     *     (a<b), for repeat-avoidance.
     *   - previousRound: array<int, array{unitA: array, unitB: array, winner: 'A'|'B'|null}>|null
     *     — the immediately preceding round's units + outcome, for
     *     bracket-style generators that advance winners.
     * @return array<int, array{team1: array<int,string>, team2: array<int,string>}>
     *   one entry per match; team1/team2 are each a unit (1 or 2 ids).
     */
    public function generate(array $units, array $config, array $context = []): array;
}
