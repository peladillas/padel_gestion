<?php

namespace App\Services\Tournament\MatchGenerators;

use App\Services\Tournament\Contracts\MatchGeneratorContract;

/**
 * Single-elimination bracket. Structurally different from round-robin:
 * round 1 seeds the whole bracket (with byes if the unit count isn't a
 * power of 2); every later round re-pairs only the WINNERS of the round
 * before — GenericEngine detects this via
 * `config.advancesFromPreviousRound = true` and feeds this generator
 * only the advancing units, not the full roster (eliminated units never
 * come back).
 *
 * config: {"type": "elimination", "pairingMode": "individual"|"fixed_pairs",
 *          "advancesFromPreviousRound": true}
 */
class EliminationGenerator implements MatchGeneratorContract
{
    public function generate(array $units, array $config, array $context = []): array
    {
        if (empty($context['previousRound'])) {
            return $this->seedFirstRound($units);
        }

        return $this->advance($context['previousRound']);
    }

    /** @return array<int, array{team1:array,team2:array,bye?:bool}> */
    protected function seedFirstRound(array $units): array
    {
        $units = array_values($units);
        $n = count($units);

        if ($n < 2) {
            return [];
        }

        $bracketSize = 2 ** (int) ceil(log($n, 2));
        $byeCount = $bracketSize - $n;

        // Byes go to the first $byeCount units in seed order (the
        // caller/admin controls seed order via the order participants
        // are passed in — no ranking data exists yet to seed by).
        $byeUnits = array_slice($units, 0, $byeCount);
        $playingUnits = array_slice($units, $byeCount);

        $matches = [];

        foreach ($byeUnits as $unit) {
            $matches[] = ['team1' => $unit, 'team2' => [], 'bye' => true];
        }

        for ($i = 0; $i + 1 < count($playingUnits); $i += 2) {
            $matches[] = ['team1' => $playingUnits[$i], 'team2' => $playingUnits[$i + 1]];
        }

        return $matches;
    }

    /**
     * @param array<int, array{unitA:array,unitB:array,winner:?string,bye:bool}> $previousRound
     * @return array<int, array{team1:array,team2:array,bye?:bool}>
     */
    protected function advance(array $previousRound): array
    {
        $winners = [];

        foreach ($previousRound as $entry) {
            if (! empty($entry['bye'])) {
                $winners[] = $entry['unitA'];

                continue;
            }

            if ($entry['winner'] === 'A') {
                $winners[] = $entry['unitA'];
            } elseif ($entry['winner'] === 'B') {
                $winners[] = $entry['unitB'];
            }
            // winner === null (not yet completed) — can't advance that
            // slot; GenericEngine is responsible for not calling
            // generateRound() again until the round is fully decided.
        }

        // A single winner means the bracket is DECIDED — that unit is
        // the champion, not someone still waiting on an opponent.
        // Returning another bye here (the old behavior) had no stop
        // condition: every future generateRound() call would keep
        // producing a meaningless bye for the champion, forever. An
        // empty return tells GenericEngine there's nothing left to
        // generate, so it can mark the tournament finished instead.
        if (count($winners) <= 1) {
            return [];
        }

        $matches = [];

        for ($i = 0; $i + 1 < count($winners); $i += 2) {
            $matches[] = ['team1' => $winners[$i], 'team2' => $winners[$i + 1]];
        }

        if (count($winners) % 2 === 1) {
            $matches[] = ['team1' => $winners[count($winners) - 1], 'team2' => [], 'bye' => true];
        }

        return $matches;
    }
}
