<?php

namespace App\Services;

use App\Models\Availability;

/**
 * Direct port of backend/src/services/AvailabilityService.js +
 * PrismaAvailabilityRepository.js. SEASON_ID stays hardcoded on purpose —
 * see config/bonapinta.php's `default_season_id` docblock and
 * App\Models\Season.
 */
class AvailabilityService
{
    protected function seasonId(): string
    {
        return config('bonapinta.default_season_id');
    }

    public function getByPlayer(string $playerId): ?Availability
    {
        return Availability::where('playerId', $playerId)
            ->where('seasonId', $this->seasonId())
            ->first();
    }

    public function updateSlots(string $playerId, array $slots): Availability
    {
        return Availability::updateOrCreate(
            ['playerId' => $playerId, 'seasonId' => $this->seasonId()],
            ['slots' => $slots],
        );
    }

    /** @param array<int, string> $playerIds */
    public function getMatchingSlots(array $playerIds): array
    {
        if (count($playerIds) < 2) {
            return [];
        }

        $availList = array_map(fn ($id) => $this->getByPlayer($id), $playerIds);

        if (in_array(null, $availList, true)) {
            return [];
        }

        $slotSets = array_map(fn ($a) => array_keys($a->slots ?? []), $availList);

        return array_values(array_reduce(
            $slotSets,
            fn ($common, $slots) => $common === null ? $slots : array_intersect($common, $slots),
            null,
        ) ?? []);
    }
}
