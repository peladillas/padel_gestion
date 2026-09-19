<?php

namespace App\Services\Tournament\RotationConstraints;

use App\Services\Tournament\Contracts\RotationConstraintContract;

/**
 * "This participant may not hold this role in two consecutive rounds."
 *
 * params: {} (none needed)
 */
class NoConsecutiveRole implements RotationConstraintContract
{
    public function allows(string $role, string $participantId, int $round, array $history, array $params): bool
    {
        foreach ($history as $entry) {
            if ($entry['round'] === $round - 1
                && $entry['participantId'] === $participantId
                && $entry['role'] === $role) {
                return false;
            }
        }

        return true;
    }
}
