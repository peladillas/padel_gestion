<?php

namespace App\Services\Tournament;

use App\Models\TournamentParticipant;

/**
 * Groups a flat list of participant ids into [p1,p2] fixed-pair units
 * (or [p1] singleton units for individual pairing). Shared by GenericEngine
 * (role/match generation) and AbsenceResolver (a pair must sit out
 * together, never split).
 *
 * partnerId stores the partner's Player.id (not participant id) — a
 * known footgun, see App\Models\TournamentParticipant docblock.
 */
class PartnerGrouper
{
    /**
     * @param array<int, string> $participantIds
     * @return array<int, array<int, string>>
     */
    public function group(array $participantIds, bool $fixedPairs): array
    {
        if (! $fixedPairs) {
            return array_map(fn ($id) => [$id], $participantIds);
        }

        $participants = TournamentParticipant::whereIn('id', $participantIds)->get();
        $byPlayerId = $participants->keyBy('playerId');

        $seen = [];
        $units = [];

        foreach ($participants as $p) {
            if (isset($seen[$p->id])) {
                continue;
            }

            $partner = $p->partnerId ? $byPlayerId->get($p->partnerId) : null;
            $seen[$p->id] = true;

            if ($partner && ! isset($seen[$partner->id])) {
                $seen[$partner->id] = true;
                $units[] = [$p->id, $partner->id];
            } else {
                // Defensive: partner not in the given id list (e.g.
                // already excluded by AbsenceResolver) — this participant
                // can't field a complete pair alone.
                $units[] = [$p->id];
            }
        }

        return $units;
    }

    /** A stable representative id for a unit — same rule everywhere so history/counting stays consistent round to round. */
    public function representative(array $unit): string
    {
        return min($unit);
    }
}
