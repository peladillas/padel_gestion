<?php

namespace App\Services\Tournament\Contracts;

/**
 * A pluggable rule limiting how a special (non-default) role can be
 * assigned across rounds — e.g. "at most once every 3 rounds", "never
 * two rounds in a row". Registered by `type` key in
 * TournamentEngineRegistry; a tournament's `config.rotationConstraints`
 * list selects and parameterizes zero or more of these per role.
 */
interface RotationConstraintContract
{
    /**
     * @param string $role the role key being tested (e.g. "cocina")
     * @param string $participantId the candidate for that role this round
     * @param int $round the round currently being generated
     * @param array<int, array{round:int, participantId:string, role:string}> $history
     *   every prior round-role assignment for this tournament, oldest
     *   first — already scoped to the tournament, not filtered by role.
     * @param array $params this constraint's own config block (e.g.
     *   {"cycleLength": 3, "max": 1})
     */
    public function allows(string $role, string $participantId, int $round, array $history, array $params): bool;
}
