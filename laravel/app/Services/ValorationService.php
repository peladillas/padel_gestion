<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Player;
use App\Models\TournamentMatch;
use App\Models\TournamentParticipant;
use App\Models\Valoration;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * New build, not an Express port — the old system covered both the
 * classic Match table and TournamentMatch; this only ever covers
 * TournamentMatch (the classic system was never ported, and the user
 * explicitly decided not to bring it into valorations either).
 *
 * Business rules, as specified by the user (2026-09-18 conversation):
 *   - The valoration window is 7 days (not the old 24h), starting the
 *     moment a result is REGISTERED (TournamentMatch.result.completedAt,
 *     stamped by TournamentService::setResult — never derived from the
 *     match's `createdAt`, which is when it was merely scheduled/
 *     generated, not played).
 *   - A match marked "not played" (walkover/no-show/injury/abandono —
 *     see TournamentMatch::wasPlayed()) never produces any valoration
 *     option, regardless of elapsed time.
 *   - You can rate ANY other participant in the match — your own
 *     partner included, not just the rival team.
 *   - Uniqueness (one rating per fromPlayer→toPlayer→match) is enforced
 *     by the DB's UNIQUE constraint alone, not a check-then-insert
 *     (which would race) — see create()'s catch block.
 */
class ValorationService
{
    protected const WINDOW_DAYS = 7;

    /** Ratings are whole numbers from 1 to 5 (also enforced by a CHECK constraint). */
    public const SCORE_MIN = 1;

    public const SCORE_MAX = 5;

    public const SKILLS = ['smash', 'volea', 'globo', 'bandeja', 'bajadaPared', 'resto', 'saque', 'ambiente'];

    protected static function error(string $message, int $status, array $extra = []): ApiException
    {
        return new ApiException($message, $status, $extra);
    }

    /**
     * Every OTHER participant (teammate + rivals) in a match, resolved
     * to Player models, given the match's `group` JSON.
     *
     * @return array<int, Player>
     */
    protected function otherPlayersIn(TournamentMatch $match, string $excludePlayerId): array
    {
        $group = $match->getGroupData();

        if (! $group) {
            return [];
        }

        $participantIds = array_merge($group['team1'] ?? [], $group['team2'] ?? []);

        return TournamentParticipant::whereIn('id', $participantIds)
            ->with('player')
            ->get()
            ->pluck('player')
            ->filter(fn ($p) => $p && $p->id !== $excludePlayerId)
            ->unique('id')
            ->values()
            ->all();
    }

    /** @return array<int, string> every player id (including $excludePlayerId) in the match */
    protected function allPlayerIdsIn(TournamentMatch $match): array
    {
        $group = $match->getGroupData();

        if (! $group) {
            return [];
        }

        $participantIds = array_merge($group['team1'] ?? [], $group['team2'] ?? []);

        return TournamentParticipant::whereIn('id', $participantIds)->pluck('playerId')->all();
    }

    /** @return array<int, string> ids of the participants on the same team as $myPlayerId (including them) */
    protected function teammateIds(TournamentMatch $match, string $myPlayerId): array
    {
        $group = $match->getGroupData() ?? [];

        foreach (['team1', 'team2'] as $team) {
            $participants = TournamentParticipant::whereIn('id', $group[$team] ?? [])->pluck('playerId')->all();

            if (in_array($myPlayerId, $participants, true)) {
                return $participants;
            }
        }

        return [];
    }

    /** @return array<int, array> */
    public function pending(Player $me): array
    {
        $tournamentIds = TournamentParticipant::where('playerId', $me->id)->pluck('tournamentId')->unique();

        if ($tournamentIds->isEmpty()) {
            return [];
        }

        $matches = TournamentMatch::whereIn('tournamentId', $tournamentIds)
            ->where('status', 'completed')
            ->with('tournament:id,name')
            ->orderByDesc('createdAt')
            ->get()
            ->filter(fn ($m) => $m->wasPlayed()) // a no-show/forfeit/injury match never offers valorations
            ->filter(function ($m) use ($me) {
                $group = $m->getGroupData();
                $ids = array_merge($group['team1'] ?? [], $group['team2'] ?? []);

                return TournamentParticipant::whereIn('id', $ids)->where('playerId', $me->id)->exists();
            });

        $result = [];

        foreach ($matches as $match) {
            $others = $this->otherPlayersIn($match, $me->id);

            if (empty($others)) {
                continue;
            }

            $ratedIds = Valoration::where('tournamentMatchId', $match->id)
                ->where('fromPlayerId', $me->id)
                ->pluck('toPlayerId')
                ->all();

            $completedAt = $match->completedAt();
            $deadline = $completedAt?->copy()->addDays(self::WINDOW_DAYS);
            $expired = $deadline ? now()->greaterThan($deadline) : true;
            $hoursLeft = $deadline ? max(0, (int) round(now()->diffInHours($deadline, false))) : 0;

            $myTeam = $this->teammateIds($match, $me->id);

            $playersToRate = array_map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'avatarUrl' => $p->avatarUrl,
                // So the rater knows who is who: their own partner or a rival.
                'relation' => in_array($p->id, $myTeam, true) ? 'partner' : 'rival',
                'alreadyRated' => in_array($p->id, $ratedIds, true),
            ], $others);

            $result[] = [
                'id' => $match->id,
                'tournamentMatchId' => $match->id,
                'tournamentId' => $match->tournamentId,
                'tournamentName' => $match->tournament?->name ?? '—',
                'round' => $match->round,
                'result' => $match->result,
                'expired' => $expired,
                'hoursLeft' => $hoursLeft,
                'daysLeft' => (int) ceil($hoursLeft / 24),
                'playersToRate' => $playersToRate,
                'allRated' => collect($playersToRate)->every(fn ($p) => $p['alreadyRated']),
            ];
        }

        return $result;
    }

    public function create(Player $me, array $data): array
    {
        $tournamentMatchId = $data['tournamentMatchId'] ?? null;
        $toPlayerId = $data['toPlayerId'] ?? null;

        if (! $tournamentMatchId || ! $toPlayerId) {
            throw self::error('Faltan datos', 400);
        }

        if ($me->id === $toPlayerId) {
            throw self::error('No puedes valorarte a ti mismo', 400);
        }

        $match = TournamentMatch::find($tournamentMatchId);

        if (! $match) {
            throw self::error('Partido no encontrado', 404);
        }

        if ($match->status !== 'completed') {
            throw self::error('El partido no ha terminado', 400);
        }

        if (! $match->wasPlayed()) {
            throw self::error('Este partido no se jugó (baja, lesión o abandono) — no admite valoraciones', 400);
        }

        $completedAt = $match->completedAt();
        $deadline = $completedAt?->copy()->addDays(self::WINDOW_DAYS);

        if (! $deadline || now()->greaterThan($deadline)) {
            throw self::error('El plazo de '.self::WINDOW_DAYS.' días ha expirado', 400);
        }

        $allPlayerIds = $this->allPlayerIdsIn($match);

        if (! in_array($me->id, $allPlayerIds, true)) {
            throw self::error('No participaste en este partido', 403);
        }

        if (! in_array($toPlayerId, $allPlayerIds, true)) {
            throw self::error('El jugador valorado no participó', 403);
        }

        // Only the aspects actually rated; an unrated one is simply absent/null.
        $scores = array_filter(
            array_intersect_key($data, array_flip(self::SKILLS)),
            fn ($v) => $v !== null && $v !== '',
        );

        if (empty($scores)) {
            throw self::error('Debes valorar al menos un aspecto', 400);
        }

        foreach ($scores as $skill => $value) {
            // Whole numbers only: 3.5, "4x" or true are rejected, not truncated.
            $isWhole = (is_int($value) || (is_string($value) && ctype_digit($value)));

            if (! $isWhole || (int) $value < self::SCORE_MIN || (int) $value > self::SCORE_MAX) {
                throw self::error("La valoración de \"{$skill}\" debe ser un número entero de ".self::SCORE_MIN.' a '.self::SCORE_MAX, 400);
            }
        }

        $scores = array_map('intval', $scores);

        try {
            // Wrapped in its own transaction (a SAVEPOINT when nested
            // inside an outer one, e.g. Pest's RefreshDatabase) so that
            // a caught unique-violation rolls back just this statement
            // instead of poisoning the whole surrounding transaction —
            // Postgres aborts the entire transaction on any error, so
            // without this, every later query in the same request/test
            // would fail with "current transaction is aborted" even
            // though we handle the exception right here.
            DB::transaction(function () use ($tournamentMatchId, $me, $toPlayerId, $scores) {
                Valoration::create(array_merge([
                    'tournamentMatchId' => $tournamentMatchId,
                    'fromPlayerId' => $me->id,
                    'toPlayerId' => $toPlayerId,
                ], $scores));
            });
        } catch (QueryException $e) {
            // The DB's UNIQUE constraint is the sole source of truth for
            // "already rated this player in this match" — no
            // check-then-insert here, so no race window between a
            // SELECT and an INSERT (a double-tap on "enviar" is now
            // handled correctly instead of surfacing a raw Postgres
            // error to the user).
            if ((string) $e->getCode() === '23505' || str_contains($e->getMessage(), 'unique constraint')) {
                throw self::error('Ya has valorado a este jugador en este partido', 400);
            }

            throw $e;
        }

        return ['message' => 'Valoración guardada'];
    }

    /** `ROUND(AVG(col), 1)` per skill: with a 1–5 scale, whole-number averages would hide too much (3.6 ≠ 4). */
    public static function averagesSql(string $alias = ''): string
    {
        $prefix = $alias ? $alias.'.' : '';

        return implode(', ', array_map(
            fn ($c) => "ROUND(AVG({$prefix}\"{$c}\")::numeric, 1)::float8 as \"{$c}\"",
            self::SKILLS,
        ));
    }

    /** PDO may hand numerics back as strings; the API always speaks numbers. */
    protected static function toNumbers(array $row): array
    {
        return array_map(fn ($v) => is_numeric($v) ? $v + 0 : $v, $row);
    }

    public function statsForPlayer(string $playerId): array
    {
        $rows = DB::select(
            'SELECT COUNT(*)::int as total, '.self::averagesSql().' FROM "Valoration" WHERE "toPlayerId" = ?',
            [$playerId]
        );

        return $rows ? self::toNumbers((array) $rows[0]) : ['total' => 0];
    }

    /** @return array<int, array> */
    public function evolution(string $playerId): array
    {
        $matchDate = 'COALESCE((tm.result->>\'completedAt\')::timestamptz, tm."createdAt")';

        return array_map(fn ($r) => self::toNumbers((array) $r), DB::select(
            'SELECT v."tournamentMatchId" as "matchId", '.$matchDate.' as "matchDate", '.
            self::averagesSql('v').', COUNT(v.id)::int as count'.
            ' FROM "Valoration" v'.
            ' JOIN "TournamentMatch" tm ON tm.id = v."tournamentMatchId"'.
            ' WHERE v."toPlayerId" = ?'.
            ' GROUP BY v."tournamentMatchId", '.$matchDate.
            ' ORDER BY '.$matchDate.' ASC',
            [$playerId]
        ));
    }

    /** @return array<int, array> */
    public function received(string $playerId): array
    {
        return DB::select(
            'SELECT v.id, v.smash, v.volea, v.globo, v.bandeja, v."bajadaPared", v.resto, v.saque, v.ambiente,'.
            ' v."tournamentMatchId",'.
            ' fp.id AS "fromPlayerId", fp.name AS "fromPlayerName", fp."avatarUrl" AS "fromPlayerAvatar",'.
            ' COALESCE((tm.result->>\'completedAt\')::timestamptz, tm."createdAt") AS "matchDate"'.
            ' FROM "Valoration" v'.
            ' JOIN "Player" fp ON fp.id = v."fromPlayerId"'.
            ' JOIN "TournamentMatch" tm ON tm.id = v."tournamentMatchId"'.
            ' WHERE v."toPlayerId" = ?'.
            ' ORDER BY COALESCE((tm.result->>\'completedAt\')::timestamptz, tm."createdAt") DESC',
            [$playerId]
        );
    }
}
