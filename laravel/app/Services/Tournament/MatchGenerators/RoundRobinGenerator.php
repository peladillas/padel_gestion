<?php

namespace App\Services\Tournament\MatchGenerators;

use App\Services\Tournament\Contracts\MatchGeneratorContract;
use App\Services\Tournament\PartnerGrouper;

/**
 * Pairs up whoever is playing THIS round. Not a full round-robin
 * schedule by itself (that emerges naturally as this runs once per round
 * across a tournament's life) — each call just pairs the given playing
 * set for the current round.
 *
 * config:
 *   - avoidRepeatsWithinRounds (optional int): limits repeat-avoidance to
 *     a sliding window of the last N rounds instead of the whole
 *     history — useful for a never-ending social league where repeating
 *     an opponent eventually is fine. When omitted (the common case —
 *     an actual round-robin tournament), the whole history is
 *     considered instead: no repeat is allowed until every possible
 *     pairing has happened at least once.
 *
 *     Real bug fixed here: round 1 has no history, so it always used
 *     pairSequentially() — fine. But every later round used to ALSO
 *     fall back to pairSequentially() unless avoidRepeatsWithinRounds
 *     was explicitly set (it never was for the seeded round_robin_generic
 *     type), which just re-pairs the same fixed unit order every time —
 *     i.e. the exact same matches, every round, forever, confirmed
 *     against a real tournament. Repeat-avoidance now always runs once
 *     there's any history, regardless of whether a window was configured.
 *
 *   Best-effort either way — a greedy match with fallback to allowing a
 *   repeat if no valid pairing exists (documented trade-off: "everyone
 *   plays" beats "no repeat" when they conflict, e.g. an odd number of
 *   units, a very small pool, or the round-robin cycle is actually
 *   complete and every pairing has already happened).
 */
class RoundRobinGenerator implements MatchGeneratorContract
{
    public function __construct(protected PartnerGrouper $grouper) {}

    public function generate(array $units, array $config, array $context = []): array
    {
        $units = array_values($units);
        $opponentHistory = $context['opponentHistory'] ?? [];

        if (empty($opponentHistory)) {
            return $this->pairSequentially($units);
        }

        $avoidWithin = $config['avoidRepeatsWithinRounds'] ?? null; // null = consider all history, not just a window
        return $this->pairAvoidingRepeats($units, $opponentHistory, $avoidWithin, $context['currentRound'] ?? null);
    }

    /** @return array<int, array{team1:array,team2:array}> */
    protected function pairSequentially(array $units): array
    {
        $matches = [];

        for ($i = 0; $i + 1 < count($units); $i += 2) {
            $matches[] = ['team1' => $units[$i], 'team2' => $units[$i + 1]];
        }

        return $matches;
    }

    /**
     * A greedy first-fit (process units in a fixed order, take the first
     * non-repeat opponent found) can paint itself into a corner and miss
     * a valid zero-repeat pairing that does exist — e.g. 6 units, round 2
     * after a round-1 pairing of (A,B)(C,D)(E,F): greedily pairing A
     * first grabs C (fine), then B grabs D (fine), leaving E and F
     * forced together again, even though (A,C)(B,E)(D,F) has zero
     * repeats elsewhere. A bounded number of random-shuffle retries
     * doesn't reliably fix this either — round-robin repeat-avoidance is
     * a perfect-matching problem, not something random sampling is
     * guaranteed to solve, and it visibly failed to find an existing
     * zero-repeat schedule in testing. So instead: exact backtracking —
     * try every non-repeat partner for the first unit, recurse on the
     * rest, backtrack on dead ends. Guaranteed to find a zero-repeat
     * pairing whenever one exists. Cheap at realistic club sizes (a few
     * dozen units at most); only degrades to allowing repeats when
     * that's genuinely unavoidable (the round-robin cycle is complete,
     * an odd leftover, etc).
     */
    protected function pairAvoidingRepeats(array $units, array $opponentHistory, ?int $avoidWithin, ?int $currentRound): array
    {
        $recentPairs = [];

        foreach ($opponentHistory as $entry) {
            if ($avoidWithin !== null && $currentRound !== null && $entry['round'] < $currentRound - $avoidWithin) {
                continue; // outside the configured window, irrelevant
            }

            $recentPairs[$entry['a'].'|'.$entry['b']] = true;
        }

        $matching = $this->findMatchingWithoutRepeats($units, $recentPairs);

        if ($matching !== null) {
            return $matching;
        }

        // No zero-repeat matching exists from this state (cycle complete,
        // or the remaining pool structurally can't avoid it) — fall back
        // to a greedy pass that just minimizes forced repeats.
        [$pairing] = $this->greedyPairOnce($units, $recentPairs);

        return $pairing;
    }

    /**
     * Exact backtracking search for a perfect matching using only
     * non-repeat pairs. Handles an odd unit count by trying each unit as
     * the round's sit-out in turn, keeping the first choice that lets
     * everyone else form a full zero-repeat matching.
     *
     * @return array<int, array{team1:array,team2:array}>|null null means
     *   no zero-repeat matching exists for this set at all.
     */
    protected function findMatchingWithoutRepeats(array $units, array $recentPairs): ?array
    {
        $units = array_values($units);

        if (count($units) % 2 === 1) {
            foreach ($units as $i => $sitOut) {
                $rest = $units;
                unset($rest[$i]);
                $matching = $this->backtrackMatch(array_values($rest), $recentPairs);

                if ($matching !== null) {
                    return $matching;
                }
            }

            return null;
        }

        return $this->backtrackMatch($units, $recentPairs);
    }

    /** @return array<int, array{team1:array,team2:array}>|null */
    protected function backtrackMatch(array $units, array $recentPairs): ?array
    {
        if (empty($units)) {
            return [];
        }

        $first = $units[0];
        $rest = array_slice($units, 1);
        $repFirst = $this->grouper->representative($first);

        foreach ($rest as $idx => $candidate) {
            $repCandidate = $this->grouper->representative($candidate);
            $key = min($repFirst, $repCandidate).'|'.max($repFirst, $repCandidate);

            if (isset($recentPairs[$key])) {
                continue; // this pairing would repeat — skip it in this exact search
            }

            $remaining = $rest;
            unset($remaining[$idx]);

            $subMatching = $this->backtrackMatch(array_values($remaining), $recentPairs);

            if ($subMatching !== null) {
                return array_merge([['team1' => $first, 'team2' => $candidate]], $subMatching);
            }
        }

        return null;
    }

    /** @return array{0: array<int, array{team1:array,team2:array}>, 1: int} */
    protected function greedyPairOnce(array $remaining, array $recentPairs): array
    {
        $matches = [];
        $violations = 0;

        while (count($remaining) > 1) {
            $unitA = array_shift($remaining);
            $repA = $this->grouper->representative($unitA);

            $chosenIndex = null;

            foreach ($remaining as $idx => $candidate) {
                $repB = $this->grouper->representative($candidate);
                $key = min($repA, $repB).'|'.max($repA, $repB);

                if (! isset($recentPairs[$key])) {
                    $chosenIndex = $idx;
                    break;
                }
            }

            if ($chosenIndex === null) {
                $chosenIndex = 0; // no non-repeat opponent left — forced repeat
                $violations++;
            }

            $unitB = $remaining[$chosenIndex];
            array_splice($remaining, $chosenIndex, 1);

            $matches[] = ['team1' => $unitA, 'team2' => $unitB];
        }

        return [$matches, $violations];
    }
}
