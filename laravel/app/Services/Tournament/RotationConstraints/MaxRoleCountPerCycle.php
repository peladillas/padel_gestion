<?php

namespace App\Services\Tournament\RotationConstraints;

use App\Services\Tournament\Contracts\RotationConstraintContract;

/**
 * "This participant may hold this role at most {max} times within any
 * window of {cycleLength} consecutive rounds ending at the round being
 * generated." Generalizes CimaPadel's "cada pareja cocina exactamente 1
 * vez por cada 3 jornadas".
 *
 * params: {"cycleLength": 3, "max": 1}
 */
class MaxRoleCountPerCycle implements RotationConstraintContract
{
    public function allows(string $role, string $participantId, int $round, array $history, array $params): bool
    {
        $cycleLength = $params['cycleLength'] ?? 1;
        $max = $params['max'] ?? 1;

        // Window covers the (cycleLength - 1) rounds before this one,
        // plus this one itself if the candidate were assigned — so count
        // existing history in [round - cycleLength + 1, round - 1].
        $windowStart = $round - $cycleLength + 1;

        $count = 0;

        foreach ($history as $entry) {
            if ($entry['participantId'] !== $participantId || $entry['role'] !== $role) {
                continue;
            }

            if ($entry['round'] >= $windowStart && $entry['round'] < $round) {
                $count++;
            }
        }

        return $count < $max;
    }
}
