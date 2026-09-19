<?php

namespace App\Services\Tournament;

use App\Exceptions\ApiException;
use App\Models\TournamentInstance;
use App\Models\TournamentMatch;
use App\Models\TournamentParticipant;
use App\Models\TournamentRoundRole;
use App\Services\Tournament\Contracts\TournamentEngineContract;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Interprets a tournament's `config` JSON (roles, rotationConstraints,
 * matchGenerator, scoring) to generate rounds and standings — this is
 * the "configurable, no code" path. See TournamentEngineContract for why
 * this has the exact same shape as a fully custom engine (CimaPadel).
 */
class GenericEngine implements TournamentEngineContract
{
    public function __construct(
        protected RoleAssigner $roleAssigner,
        protected TournamentEngineRegistry $registry,
        protected PartnerGrouper $grouper,
        protected AbsenceResolver $absence,
    ) {}

    /**
     * @param array<int, string> $enrolledParticipantIds every participant
     *   currently enrolled (active or absent — absence is resolved
     *   internally, see AbsenceResolver).
     */
    public function generateRound(TournamentInstance $tournament, array $enrolledParticipantIds): Collection
    {
        $config = $tournament->config ?? [];
        $roles = $config['roles'] ?? [['key' => 'jugador', 'playsMatch' => true]];
        $rotationConstraints = $config['rotationConstraints'] ?? [];
        $generatorConfig = $config['matchGenerator'] ?? ['type' => 'round_robin', 'pairingMode' => 'individual'];
        $isFixedPairs = ($generatorConfig['pairingMode'] ?? 'individual') === 'fixed_pairs';
        $advancesFromPrevious = ! empty($generatorConfig['advancesFromPreviousRound']);

        $round = ((int) TournamentMatch::where('tournamentId', $tournament->id)->max('round')) + 1;
        $previousRoundContext = $round > 1 ? $this->buildPreviousRoundContext($tournament, $round - 1) : null;

        $generator = $this->registry->generator($generatorConfig['type']);

        // Bracket-style generators: only winners advance, the caller's
        // enrolled list is irrelevant past round 1 (eliminated units
        // never return), and there are no roles/rotation to assign.
        if ($advancesFromPrevious && $previousRoundContext !== null) {
            // Real bug, found against live data (torneo "enano al
            // hombro"): generating the next round while the previous
            // one still had an undecided (pending) match silently
            // DROPPED that match's winner from the bracket forever —
            // EliminationGenerator::advance() has no way to "wait" for
            // a null winner, it just skips that slot. Block it here
            // instead, before any damage is done.
            $previousIncomplete = TournamentMatch::where('tournamentId', $tournament->id)
                ->where('round', $round - 1)
                ->where('status', '!=', 'completed')
                ->exists();

            if ($previousIncomplete) {
                throw new ApiException(
                    'Hay partidos sin resultado en la fecha anterior — regístralos antes de generar la siguiente.',
                    400,
                );
            }

            $matchPairs = $generator->generate([], $generatorConfig, ['previousRound' => $previousRoundContext]);

            // Empty means the bracket is down to a single winner (the
            // champion) — EliminationGenerator::advance() returns []
            // in that case rather than an endless stream of pointless
            // byes (the second half of the same bug: nothing used to
            // stop generateRound() from being called forever).
            if (empty($matchPairs)) {
                $tournament->update(['status' => 'completed']);

                throw new ApiException('El torneo ya tiene campeón — no hay más fechas para generar.', 400);
            }

            return $this->persist($tournament, $round, [], $matchPairs);
        }

        $available = $this->absence->resolveAvailable($enrolledParticipantIds, $isFixedPairs);

        $history = TournamentRoundRole::where('tournament_id', $tournament->id)
            ->get(['round', 'participant_id', 'role'])
            ->map(fn ($r) => ['round' => $r->round, 'participantId' => $r->participant_id, 'role' => $r->role])
            ->all();

        // Roles must be assigned per COUPLE, not per individual, when
        // pairing is fixed — a role like "cocina" applies to both
        // members of a pair together, never to just one of them. One
        // stable "representative" id per unit is fed into RoleAssigner,
        // then its role is expanded back onto every member of that unit.
        $units = $this->grouper->group($available, $isFixedPairs);
        $representatives = array_map(fn ($unit) => $this->grouper->representative($unit), $units);
        $unitByRepresentative = array_combine($representatives, $units);

        $repAssignment = $this->roleAssigner->assign($roles, $rotationConstraints, $representatives, $history, $round);

        $assignment = [];

        foreach ($repAssignment as $repId => $role) {
            foreach ($unitByRepresentative[$repId] as $memberId) {
                $assignment[$memberId] = $role;
            }
        }

        $defaultRole = collect($roles)->first(fn ($r) => ! empty($r['playsMatch']));
        $defaultRoleKey = $defaultRole['key'] ?? 'jugador';

        $playingUnits = array_values(array_filter(
            $units,
            fn ($unit) => $assignment[$this->grouper->representative($unit)] === $defaultRoleKey
        ));

        $opponentHistory = $this->buildOpponentHistory($tournament);
        $matchPairs = $generator->generate($playingUnits, $generatorConfig, [
            'opponentHistory' => $opponentHistory,
            'currentRound' => $round,
        ]);

        return $this->persist($tournament, $round, $assignment, $matchPairs);
    }

    /** @return Collection<int, TournamentMatch> */
    protected function persist(TournamentInstance $tournament, int $round, array $roleAssignment, array $matchPairs): Collection
    {
        return DB::transaction(function () use ($tournament, $round, $roleAssignment, $matchPairs) {
            foreach ($roleAssignment as $participantId => $role) {
                TournamentRoundRole::create([
                    'tournament_id' => $tournament->id,
                    'round' => $round,
                    'participant_id' => $participantId,
                    'role' => $role,
                ]);
            }

            $matches = collect();

            foreach ($matchPairs as $pair) {
                $isBye = ! empty($pair['bye']);

                $matches->push(TournamentMatch::create([
                    'tournamentId' => $tournament->id,
                    'round' => $round,
                    'group' => json_encode(['team1' => $pair['team1'], 'team2' => $pair['team2']]),
                    // A bye auto-completes: the lone unit "wins" without
                    // playing, so bracket advancement can pick it up on
                    // the next generateRound() call without needing a
                    // human to register a result for a match that never
                    // happened.
                    'status' => $isBye ? 'completed' : 'pending',
                    'result' => $isBye ? ['outcome' => 'team1', 'bye' => true] : null,
                ]));
            }

            return $matches;
        });
    }

    /**
     * Every prior match, as the two units' representative ids (a<b), for
     * round-robin's optional repeat-avoidance.
     *
     * @return array<int, array{round:int, a:string, b:string}>
     */
    protected function buildOpponentHistory(TournamentInstance $tournament): array
    {
        return TournamentMatch::where('tournamentId', $tournament->id)
            ->whereNotNull('group')
            ->get(['round', 'group'])
            ->map(function ($m) {
                $g = json_decode($m->group, true);

                if (empty($g['team1']) || empty($g['team2'])) {
                    return null;
                }

                $a = $this->grouper->representative($g['team1']);
                $b = $this->grouper->representative($g['team2']);

                return ['round' => $m->round, 'a' => min($a, $b), 'b' => max($a, $b)];
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * @return array<int, array{unitA:array,unitB:array,winner:?string,bye:bool}>|null
     */
    protected function buildPreviousRoundContext(TournamentInstance $tournament, int $round): ?array
    {
        $matches = TournamentMatch::where('tournamentId', $tournament->id)->where('round', $round)->get();

        if ($matches->isEmpty()) {
            return null;
        }

        return $matches->map(function ($m) {
            $g = $m->group ? json_decode($m->group, true) : ['team1' => [], 'team2' => []];
            $outcome = $m->result['outcome'] ?? null;

            return [
                'unitA' => $g['team1'] ?? [],
                'unitB' => $g['team2'] ?? [],
                'winner' => $outcome === 'team1' ? 'A' : ($outcome === 'team2' ? 'B' : null),
                'bye' => ! empty($m->result['bye']),
            ];
        })->all();
    }

    /**
     * Aggregates at the COUPLE level for fixed_pairs tournaments (one row
     * per pair, both members sharing the same stats — never one row per
     * individual participant), and at the participant level otherwise.
     * Response shape deliberately matches what the pre-existing
     * TournamentView.jsx (player-facing, reused as-is rather than
     * rewritten) already expects: `{type:'pair', player1, player2, ...}`
     * or `{type:'individual', participant, ...}`, with real Player
     * objects embedded so the frontend can resolve names/avatars/ids
     * directly (`s.participant.player.name`, `s.player1.id`) without a
     * second round-trip.
     */
    public function calculateStandings(TournamentInstance $tournament): array
    {
        $scoring = $tournament->config['scoring'] ?? ['win' => 3, 'draw' => 1, 'loss' => 0];
        $isPairs = $tournament->pairingSystem === 'fixed_pairs';

        $participants = TournamentParticipant::where('tournamentId', $tournament->id)->with('player')->get();
        $units = $this->grouper->group($participants->pluck('id')->all(), $isPairs);

        $stats = [];
        $repOf = [];

        foreach ($units as $unit) {
            $rep = $this->grouper->representative($unit);
            $stats[$rep] = ['unit' => $unit, 'played' => 0, 'won' => 0, 'draw' => 0, 'lost' => 0, 'points' => 0];

            foreach ($unit as $pid) {
                $repOf[$pid] = $rep;
            }
        }

        $matches = TournamentMatch::where('tournamentId', $tournament->id)->get();
        $completedMatches = $matches->where('status', 'completed');

        foreach ($completedMatches as $match) {
            $group = $match->group ? json_decode($match->group, true) : null;

            if (! $group) {
                continue;
            }

            $team1 = $group['team1'] ?? [];
            $team2 = $group['team2'] ?? [];
            $outcome = $match->result['outcome'] ?? null; // 'team1' | 'team2' | 'draw'

            $rep1 = ! empty($team1) ? ($repOf[$team1[0]] ?? null) : null;
            $rep2 = ! empty($team2) ? ($repOf[$team2[0]] ?? null) : null;

            if ($rep1 !== null && isset($stats[$rep1])) {
                $stats[$rep1]['played']++;

                if ($outcome === 'team1') {
                    $stats[$rep1]['won']++;
                    $stats[$rep1]['points'] += $scoring['win'];
                } elseif ($outcome === 'draw') {
                    $stats[$rep1]['draw']++;
                    $stats[$rep1]['points'] += $scoring['draw'];
                } elseif ($outcome === 'team2') {
                    $stats[$rep1]['lost']++;
                    $stats[$rep1]['points'] += $scoring['loss'];
                }
            }

            if ($rep2 !== null && isset($stats[$rep2])) {
                $stats[$rep2]['played']++;

                if ($outcome === 'team2') {
                    $stats[$rep2]['won']++;
                    $stats[$rep2]['points'] += $scoring['win'];
                } elseif ($outcome === 'draw') {
                    $stats[$rep2]['draw']++;
                    $stats[$rep2]['points'] += $scoring['draw'];
                } elseif ($outcome === 'team1') {
                    $stats[$rep2]['lost']++;
                    $stats[$rep2]['points'] += $scoring['loss'];
                }
            }
        }

        $byId = $participants->keyBy('id');
        $standings = [];

        foreach ($stats as $row) {
            $unit = $row['unit'];
            $base = ['played' => $row['played'], 'won' => $row['won'], 'lost' => $row['lost'], 'draw' => $row['draw'], 'points' => $row['points']];

            if ($isPairs && count($unit) === 2) {
                $standings[] = array_merge(['type' => 'pair', 'player1' => $byId->get($unit[0])?->player, 'player2' => $byId->get($unit[1])?->player], $base);
            } else {
                $standings[] = array_merge(['type' => 'individual', 'participant' => $byId->get($unit[0])], $base);
            }
        }

        usort($standings, fn ($a, $b) => $b['points'] <=> $a['points']);

        return [
            'standings' => $standings,
            'completedMatches' => $completedMatches->count(),
            'totalMatches' => $matches->count(),
        ];
    }

    public function validate(array $participants, array $config): array
    {
        $errors = [];

        if (count($participants) < 2) {
            $errors[] = 'Mínimo 2 participantes';
        }

        $pairingMode = $config['matchGenerator']['pairingMode'] ?? 'individual';

        if ($pairingMode === 'fixed_pairs') {
            foreach ($participants as $p) {
                if (! $p->partnerId) {
                    $errors[] = 'Hay participantes sin pareja confirmada';
                    break;
                }
            }
        }

        return ['valid' => empty($errors), 'errors' => $errors];
    }
}
