<?php

namespace App\Services\Tournament;

/**
 * Assigns each available participant a role for the round being
 * generated, respecting whatever rotation constraints apply to each
 * special (non-default) role. Participants left over after special
 * roles are filled get the default "plays the match" role.
 *
 * This is the generalization of the old CimaPadel-specific
 * "who cooks next" scheduler: instead of hardcoded BBQ logic, any
 * special role + any combination of rotation constraints can produce
 * the same kind of behavior purely from config.
 */
class RoleAssigner
{
    public function __construct(protected TournamentEngineRegistry $registry) {}

    /**
     * @param array $roles [{key, playsMatch, slotsPerRound?}, ...]
     * @param array $rotationConstraints [{type, role, ...params}, ...]
     * @param array<int, string> $participantIds available this round
     * @param array<int, array{round:int, participantId:string, role:string}> $history
     * @return array<string, string> participantId => role key
     */
    public function assign(array $roles, array $rotationConstraints, array $participantIds, array $history, int $round): array
    {
        $assignment = [];
        $remaining = $participantIds;

        $specialRoles = array_values(array_filter($roles, fn ($r) => empty($r['playsMatch'])));
        $defaultRole = collect($roles)->first(fn ($r) => ! empty($r['playsMatch']));
        $defaultRoleKey = $defaultRole['key'] ?? 'jugador';

        foreach ($specialRoles as $roleConfig) {
            $roleKey = $roleConfig['key'];
            $slots = $roleConfig['slotsPerRound'] ?? 0;

            if ($slots <= 0 || empty($remaining)) {
                continue;
            }

            $constraintsForRole = array_values(array_filter(
                $rotationConstraints,
                fn ($c) => ($c['role'] ?? null) === $roleKey
            ));

            $eligible = array_values(array_filter(
                $remaining,
                fn ($pid) => $this->satisfiesAll($roleKey, $pid, $round, $history, $constraintsForRole)
            ));

            // Fewest-prior-assignments-first — same heuristic the old
            // CimaPadelScheduler used ("lowest count goes first"),
            // generalized to any role.
            usort($eligible, fn ($a, $b) => $this->roleCount($roleKey, $a, $history) <=> $this->roleCount($roleKey, $b, $history));

            $chosen = array_slice($eligible, 0, $slots);

            foreach ($chosen as $pid) {
                $assignment[$pid] = $roleKey;
                $remaining = array_values(array_diff($remaining, [$pid]));
            }
        }

        foreach ($remaining as $pid) {
            $assignment[$pid] = $defaultRoleKey;
        }

        return $assignment;
    }

    protected function satisfiesAll(string $role, string $participantId, int $round, array $history, array $constraints): bool
    {
        foreach ($constraints as $constraintConfig) {
            $constraint = $this->registry->constraint($constraintConfig['type']);

            if (! $constraint->allows($role, $participantId, $round, $history, $constraintConfig)) {
                return false;
            }
        }

        return true;
    }

    protected function roleCount(string $role, string $participantId, array $history): int
    {
        $count = 0;

        foreach ($history as $entry) {
            if ($entry['participantId'] === $participantId && $entry['role'] === $role) {
                $count++;
            }
        }

        return $count;
    }
}
