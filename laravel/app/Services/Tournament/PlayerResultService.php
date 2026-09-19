<?php

namespace App\Services\Tournament;

use App\Exceptions\ApiException;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\TournamentLog;
use App\Models\TournamentMatch;
use App\Models\TournamentParticipant;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Support\Facades\DB;

/**
 * `resultMode = 'jugador'`: a player of the match proposes the score, the
 * OTHER team confirms it (or rejects it). If nobody answers within 24h the
 * proposal auto-confirms — run by `tournaments:auto-confirm` (scheduled)
 * and, defensively, whenever a player's matches or a tournament's
 * standings are read.
 *
 * Port of proposeResult/acceptResult/rejectResult from the Express
 * TournamentMatchService, with these tightenings:
 *  - a proposal is validated with the same ResultEvaluator as an admin
 *    result (complete sets, best-of, no tied set) — Express stored
 *    whatever came in and only failed at confirmation time;
 *  - only the opposing team can accept/reject (Express let the
 *    proposer's own partner confirm it);
 *  - the resulting `result` JSON is the same shape the engine's
 *    standings read (`outcome`, `sets`, `played`, `completedAt`) plus the
 *    proposal bookkeeping (`status`, `date`, `time`, ...).
 */
class PlayerResultService
{
    public const CONFIRMATION_WINDOW_HOURS = 24;

    public function __construct(
        protected ResultEvaluator $results,
        protected NotificationService $notifications,
    ) {}

    protected static function error(string $message, int $status): ApiException
    {
        return new ApiException($message, $status);
    }

    protected function log(TournamentInstance $tournament, ?User $user, ?string $playerName, string $action, string $detail): void
    {
        TournamentLog::create([
            'tournamentId' => $tournament->id,
            'userId' => $user?->id,
            'playerName' => $playerName,
            'action' => $action,
            'detail' => $detail,
        ]);
    }

    protected function requireJugadorMode(TournamentInstance $tournament): void
    {
        if ($tournament->resultMode !== 'jugador') {
            throw self::error('Los jugadores no pueden cargar resultados en este torneo', 403);
        }
    }

    /**
     * Resolves the caller's participant row and which team of the match
     * they're on. Never trusts a client-sent participantId on its own —
     * it must match the participant the caller actually is.
     *
     * @return array{0: TournamentParticipant, 1: 'team1'|'team2'}
     */
    protected function resolveSide(TournamentInstance $tournament, TournamentMatch $match, User $user, ?string $participantId): array
    {
        $player = Player::where('userId', $user->id)->first();

        $participant = $player
            ? TournamentParticipant::where('tournamentId', $tournament->id)->where('playerId', $player->id)->with('player:id,name,userId')->first()
            : null;

        if (! $participant || ($participantId && $participantId !== $participant->id)) {
            throw self::error('No eres participante de este partido', 403);
        }

        $group = $match->getGroupData() ?? [];

        if (in_array($participant->id, $group['team1'] ?? [], true)) {
            return [$participant, 'team1'];
        }

        if (in_array($participant->id, $group['team2'] ?? [], true)) {
            return [$participant, 'team2'];
        }

        throw self::error('No participas en este partido', 403);
    }

    protected function teamOf(TournamentMatch $match, string $participantId): ?string
    {
        $group = $match->getGroupData() ?? [];

        return in_array($participantId, $group['team1'] ?? [], true) ? 'team1'
            : (in_array($participantId, $group['team2'] ?? [], true) ? 'team2' : null);
    }

    protected function findMatch(TournamentInstance $tournament, string $matchId): TournamentMatch
    {
        $match = TournamentMatch::where('tournamentId', $tournament->id)->find($matchId);

        if (! $match) {
            throw self::error('Partido no encontrado', 404);
        }

        return $match->setRelation('tournament', $tournament);
    }

    /** @return array<int, string> User ids of every participant of one team of the match. */
    protected function userIdsOfTeam(TournamentMatch $match, string $team): array
    {
        $ids = ($match->getGroupData() ?? [])[$team] ?? [];

        return TournamentParticipant::whereIn('id', $ids)->with('player:id,userId')->get()
            ->pluck('player.userId')->filter()->unique()->values()->all();
    }

    protected function notifyTeam(TournamentMatch $match, string $team, string $type, string $title, string $body): void
    {
        foreach ($this->userIdsOfTeam($match, $team) as $userId) {
            $this->notifications->create($userId, $type, $title, $body, "/tournaments/{$match->tournamentId}/view");
        }
    }

    public function propose(TournamentInstance $tournament, string $matchId, User $user, array $data): TournamentMatch
    {
        $this->requireJugadorMode($tournament);

        if ($tournament->status !== 'active') {
            throw self::error('El torneo debe estar iniciado', 400);
        }

        $match = $this->findMatch($tournament, $matchId);

        if ($match->status === 'completed') {
            throw self::error('El partido ya tiene resultado confirmado', 400);
        }

        if ($match->status === 'suspended') {
            throw self::error('El partido está suspendido', 400);
        }

        [$participant, $team] = $this->resolveSide($tournament, $match, $user, $data['participantId'] ?? null);

        // Validate now, not at confirmation: a malformed score is rejected
        // to the proposer instead of sitting there until it auto-confirms.
        $evaluated = $this->results->evaluate(['sets' => $data['sets'] ?? null], (int) ($tournament->config['bestOf'] ?? 3));

        $expiresAt = now()->addHours(self::CONFIRMATION_WINDOW_HOURS);

        $match->update([
            'result' => [
                'sets' => $evaluated['sets'],
                'date' => $data['date'] ?? null,
                'time' => $data['time'] ?? null,
                'status' => 'pending',
                'proposedAt' => now()->toIso8601String(),
                'expiresAt' => $expiresAt->toIso8601String(),
            ],
            'proposedByParticipant' => $participant->id,
            'confirmedByParticipants' => [$participant->id],
            'expiresAt' => $expiresAt,
        ]);

        $setsText = collect($evaluated['sets'])->map(fn ($s) => "{$s['t1']}-{$s['t2']}")->implode(', ');
        $this->log($tournament, $user, $participant->player?->name, 'result_proposed', "{$setsText} · {$evaluated['outcome']}");

        $opponents = $team === 'team1' ? 'team2' : 'team1';
        $this->notifyTeam($match, $opponents, 'result_proposed', 'Resultado propuesto',
            "Propusieron el resultado ({$setsText}) de tu partido en \"{$tournament->name}\". Confírmalo o recházalo: si no respondes se confirma solo en 24h.");

        return $match;
    }

    public function accept(TournamentInstance $tournament, string $matchId, User $user, ?string $participantId): TournamentMatch
    {
        $this->requireJugadorMode($tournament);

        $match = $this->findMatch($tournament, $matchId);

        if ($match->status === 'completed') {
            throw self::error('Ya confirmado', 400);
        }

        if ($match->status === 'suspended') {
            throw self::error('El partido está suspendido', 400);
        }

        if (! $match->proposedByParticipant || ($match->result['status'] ?? null) !== 'pending') {
            throw self::error('Sin propuesta pendiente', 400);
        }

        [$participant, $team] = $this->resolveSide($tournament, $match, $user, $participantId);

        if ($team === $this->teamOf($match, $match->proposedByParticipant)) {
            throw self::error('El resultado debe confirmarlo el equipo rival', 403);
        }

        $this->finalize($match, [$participant->id]);

        $setsText = collect($match->result['sets'] ?? [])->map(fn ($s) => "{$s['t1']}-{$s['t2']}")->implode(', ');
        $this->log($tournament, $user, $participant->player?->name, 'result_accepted', "{$setsText} · {$match->result['outcome']}");

        $this->notifyTeam($match, $team === 'team1' ? 'team2' : 'team1', 'result_accepted', 'Resultado confirmado',
            "Tus rivales confirmaron el resultado de tu partido en \"{$tournament->name}\".");

        return $match;
    }

    public function reject(TournamentInstance $tournament, string $matchId, User $user, ?string $participantId, ?string $reason): TournamentMatch
    {
        $this->requireJugadorMode($tournament);

        $match = $this->findMatch($tournament, $matchId);

        if ($match->status === 'completed') {
            throw self::error('No se puede rechazar un resultado ya confirmado', 400);
        }

        if (! $match->proposedByParticipant || ($match->result['status'] ?? null) !== 'pending') {
            throw self::error('Sin propuesta pendiente', 400);
        }

        [$participant, $team] = $this->resolveSide($tournament, $match, $user, $participantId);

        if ($team === $this->teamOf($match, $match->proposedByParticipant)) {
            throw self::error('El resultado debe rechazarlo el equipo rival', 403);
        }

        $proposerTeam = $team === 'team1' ? 'team2' : 'team1';

        $match->update([
            'result' => array_merge($match->result ?? [], [
                'status' => 'rejected',
                'rejectedBy' => $participant->id,
                'reason' => $reason ?? '',
            ]),
            'proposedByParticipant' => null,
            'confirmedByParticipants' => [],
            'expiresAt' => null,
        ]);

        $this->log($tournament, $user, $participant->player?->name, 'result_rejected', $reason ? "Rechazado: \"{$reason}\"" : 'Resultado rechazado.');

        $this->notifyTeam($match, $proposerTeam, 'result_rejected', 'Resultado rechazado',
            "Tus rivales rechazaron el resultado que propusiste en \"{$tournament->name}\"".($reason ? ": {$reason}" : '.'));

        return $match;
    }

    /**
     * Turns a pending proposal into the match's real, completed result.
     *
     * @param array<int, string> $confirmedBy participant ids added to the confirmations
     */
    protected function finalize(TournamentMatch $match, array $confirmedBy): void
    {
        $evaluated = $this->results->evaluate(
            ['sets' => $match->result['sets'] ?? null],
            (int) ($match->tournament?->config['bestOf'] ?? 3),
        );

        $match->update([
            'status' => 'completed',
            'result' => array_merge($match->result ?? [], [
                'outcome' => $evaluated['outcome'],
                'sets' => $evaluated['sets'],
                'retired' => null,
                'played' => true,
                'status' => 'confirmed',
                'completedAt' => now()->toIso8601String(),
            ]),
            'confirmedByParticipants' => array_values(array_unique(array_merge($match->confirmedByParticipants ?? [], $confirmedBy))),
            'expiresAt' => null,
        ]);
    }

    /**
     * Confirms every proposal whose 24h window lapsed without an answer.
     * Only matches still `pending` (a suspended match's clock is paused).
     *
     * @return int how many were confirmed
     */
    public function autoConfirmExpired(?string $tournamentId = null): int
    {
        $query = TournamentMatch::with('tournament')
            ->where('status', 'pending')
            ->whereNotNull('expiresAt')
            ->where('expiresAt', '<', now());

        if ($tournamentId) {
            $query->where('tournamentId', $tournamentId);
        }

        $confirmed = 0;

        foreach ($query->get() as $match) {
            if (($match->result['status'] ?? null) !== 'pending') {
                continue;
            }

            try {
                DB::transaction(function () use ($match) {
                    $this->finalize($match, []);

                    if ($match->tournament) {
                        $this->log($match->tournament, null, null, 'result_auto_confirmed', 'Resultado confirmado automáticamente (24h sin respuesta).');
                    }
                });

                foreach (['team1', 'team2'] as $team) {
                    $this->notifyTeam($match, $team, 'result_auto_confirmed', 'Resultado confirmado',
                        "El resultado de tu partido en \"{$match->tournament?->name}\" se confirmó automáticamente.");
                }

                $confirmed++;
            } catch (ApiException) {
                // Corrupt proposal (can't be evaluated) — leave it for an
                // admin to overwrite rather than looping on it forever.
                continue;
            }
        }

        return $confirmed;
    }
}
