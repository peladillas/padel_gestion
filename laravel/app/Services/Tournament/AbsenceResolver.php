<?php

namespace App\Services\Tournament;

use App\Models\TournamentInstance;
use App\Models\TournamentParticipant;

/**
 * Resolves which enrolled participants can actually take part in the
 * round being generated, given each one's status
 * (active/absent/pair_requested) and, when absent, whether a substitute
 * has been assigned.
 *
 * Policy (documented since there's no spec for this — a deliberate
 * design choice, revisit if it doesn't match how clubs actually want it
 * to behave):
 *   - status='absent' WITH a substituteId → still counts as available.
 *     The original participant id keeps being used for matches/roles
 *     (rotation history for that couple stays continuous); the
 *     substitute's identity is a read-time display concern
 *     (TournamentParticipant::substitute()), not something this engine
 *     layer needs to know about.
 *   - status='absent' WITHOUT a substitute → unavailable.
 *   - Fixed pairs: if EITHER member of a couple is unavailable, the
 *     WHOLE couple sits out that round — a pair can't field a complete
 *     team with only one member, and this engine doesn't invent
 *     ad-hoc partners.
 */
class AbsenceResolver
{
    public function __construct(protected PartnerGrouper $grouper) {}

    /**
     * @param array<int, string> $enrolledParticipantIds every participant
     *   currently enrolled in the tournament (not yet filtered)
     * @param bool $fixedPairs whether this tournament pairs participants
     * @return array<int, string> ids actually available this round
     */
    public function resolveAvailable(array $enrolledParticipantIds, bool $fixedPairs): array
    {
        $participants = TournamentParticipant::whereIn('id', $enrolledParticipantIds)->get()->keyBy('id');

        $individuallyAvailable = array_values(array_filter($enrolledParticipantIds, function ($id) use ($participants) {
            $p = $participants->get($id);

            return $p && ($p->status !== 'absent' || $p->substituteId !== null);
        }));

        if (! $fixedPairs) {
            return $individuallyAvailable;
        }

        $units = $this->grouper->group($individuallyAvailable, fixedPairs: true);

        // Only keep units where BOTH members survived the individual
        // filter above (a singleton unit here means the partner was
        // excluded, or has no partner at all — either way it can't play
        // a fixed-pairs match alone).
        $completeUnits = array_filter($units, fn ($unit) => count($unit) === 2);

        return array_merge(...array_values($completeUnits ?: [[]]));
    }
}
