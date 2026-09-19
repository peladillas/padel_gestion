<?php

namespace App\Services\Tournament;

use App\Enums\ClubRole;
use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\Club;
use App\Models\ClubMembership;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\TournamentLog;
use App\Models\TournamentMatch;
use App\Models\TournamentParticipant;
use App\Models\TournamentRoundRole;
use App\Models\TournamentType;
use App\Models\User;
use App\Models\Valoration;
use App\Services\NotificationService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * New tournament service built on the configurable engine (see
 * App\Services\Tournament\GenericEngine and TournamentEngineFactory) —
 * NOT a port of the old Express TournamentService.js, which used the
 * hardcoded Strategy Registry this whole subsystem replaces.
 */
class TournamentService
{
    public function __construct(
        protected TournamentEngineFactory $engines,
        protected NotificationService $notifications,
        protected ResultEvaluator $results,
        protected PlayerResultService $playerResults,
    ) {}

    protected static function error(string $message, int $status, array $extra = []): ApiException
    {
        return new ApiException($message, $status, $extra);
    }

    /**
     * New (not an Express port) — the `logs()` endpoint already existed
     * (wired to `TournamentLog` for the reused TournamentView.jsx's
     * "Actividad" tab) but nothing in the new engine ever wrote to it.
     * $actingUser is nullable so every call site here stays optional —
     * tests and any future system-initiated action don't need to
     * fabricate a User just to call these methods.
     */
    protected function log(TournamentInstance $tournament, ?User $actingUser, string $action, ?string $detail = null): void
    {
        $playerName = $actingUser
            ? (Player::where('userId', $actingUser->id)->value('name') ?? $actingUser->email)
            : null;

        TournamentLog::create([
            'tournamentId' => $tournament->id,
            'userId' => $actingUser?->id,
            'playerName' => $playerName,
            'action' => $action,
            'detail' => $detail,
        ]);
    }

    public function create(User $creator, array $data): TournamentInstance
    {
        $typeKey = $data['typeKey'] ?? null;
        $name = $data['name'] ?? null;

        if (! $typeKey || ! $name) {
            throw self::error('typeKey y name son requeridos', 400);
        }

        $type = TournamentType::where('key', $typeKey)->where('is_active', true)->first();

        if (! $type) {
            throw self::error("Tipo de torneo desconocido o inactivo: \"{$typeKey}\"", 400);
        }

        // A club ADMIN's tournaments auto-assign to their own club
        // (matching the old Express behavior — CLAUDE.md #24) unless
        // they're SUPER_ADMIN, who must pick one explicitly (or leave it
        // unset for a club-less/global tournament).
        $clubId = $data['clubId'] ?? null;

        if (! $clubId && $creator->role === Role::ADMIN) {
            $clubId = ClubMembership::where('role', ClubRole::ADMIN)
                ->whereHas('player', fn ($q) => $q->where('userId', $creator->id))
                ->value('clubId');
        }

        if ($clubId) {
            $club = Club::find($clubId);

            if ($club && is_array($club->allowedStructures) && ! in_array($typeKey, $club->allowedStructures, true)) {
                throw self::error("El tipo \"{$typeKey}\" no está disponible para este club", 400);
            }
        }

        $resultMode = $data['resultMode'] ?? 'creador';

        if (! in_array($resultMode, ['creador', 'jugador', 'arbitro'], true)) {
            throw self::error('resultMode debe ser creador, jugador o arbitro', 400);
        }

        if ($resultMode === 'arbitro' && empty($data['arbitroId'])) {
            throw self::error('Debes asignar un árbitro', 400);
        }

        $config = $data['config'] ?? $type->default_config_schema ?? [];

        // Explicit per-tournament choice, independent of the type's own
        // default — most tipos here default to 'individual' in their
        // seeded config (round_robin_generic, elimination_generic), but
        // the actual club usage is overwhelmingly parejas, so this
        // deliberately does NOT fall back to the type's own default —
        // 'fixed_pairs' always wins unless the caller explicitly asked
        // for 'individual'. The frontend's create form defaults its own
        // selector to 'fixed_pairs' too, so this fallback mostly only
        // matters for direct API callers that omit the field.
        $pairingMode = $data['pairingMode'] ?? 'fixed_pairs';

        if (isset($config['matchGenerator'])) {
            $config['matchGenerator']['pairingMode'] = $pairingMode;
        }

        if (isset($data['bestOf'])) {
            $config['bestOf'] = (int) $data['bestOf'];
        } elseif (! isset($config['bestOf'])) {
            $config['bestOf'] = 3;
        }

        $tournament = TournamentInstance::create([
            'name' => $name,
            'description' => $data['description'] ?? null,
            'structure' => $typeKey,
            'pairingSystem' => $pairingMode,
            'matchFormat' => $data['matchFormat'] ?? 'sets_completos',
            'status' => 'draft',
            'startDate' => $data['startDate'] ?? null,
            'endDate' => $data['endDate'] ?? null,
            'createdBy' => $creator->id,
            'responsableId' => $data['responsableId'] ?? $creator->id,
            'config' => $config,
            'resultMode' => $resultMode,
            'arbitroId' => $resultMode === 'arbitro' ? $data['arbitroId'] : null,
            'allowInvitations' => (bool) ($data['allowInvitations'] ?? false),
            'maxParticipants' => $data['maxParticipants'] ?? null,
            'visibility' => $data['visibility'] ?? 'internal',
            'clubId' => $clubId,
        ]);

        $this->log($tournament, $creator, 'tournament_created', "Torneo \"{$name}\" creado ({$type->label}).");

        return $tournament;
    }

    /** @return array<int, TournamentInstance> */
    public function getAllForUser(User $user): array
    {
        $query = TournamentInstance::with(['club:id,name', 'participants.player'])
            ->withCount(['participants', 'matches']);

        if ($user->role === Role::SUPER_ADMIN) {
            // sees everything
        } elseif ($user->role === Role::ADMIN) {
            $clubIds = ClubMembership::where('role', ClubRole::ADMIN)
                ->whereHas('player', fn ($q) => $q->where('userId', $user->id))
                ->pluck('clubId');

            $query->whereIn('clubId', $clubIds);
        } else {
            $player = Player::where('userId', $user->id)->first();
            $playerId = $player?->id ?? 'no-player';

            $query->whereHas('participants', fn ($q) => $q->where('playerId', $playerId));
        }

        return $query->orderByDesc('createdAt')->get()->all();
    }

    public function getById(string $id): TournamentInstance
    {
        $tournament = TournamentInstance::with([
            'club:id,name',
            'participants.player',
            'participants.substitute:id,name,avatarUrl',
            'courts' => fn ($q) => $q->orderBy('displayOrder'),
            'courts.court:id,name,alias,isActive',
            'matches' => fn ($q) => $q->orderBy('round')->orderBy('createdAt'),
        ])->find($id);

        if (! $tournament) {
            throw self::error('Torneo no encontrado', 404);
        }

        return $tournament;
    }

    /**
     * arbitroId is a soft User.id reference (no relation): resolve who it
     * is so the settings screen can show a name, not a uuid. Kept OUT of
     * the model (setAttribute would make it dirty and the next update()
     * would try to write a non-existent column).
     *
     * @return array{id: string, name: string}|null
     */
    public function arbitroSummary(TournamentInstance $tournament): ?array
    {
        $arbitro = $tournament->arbitroId ? User::find($tournament->arbitroId) : null;

        return $arbitro ? [
            'id' => $arbitro->id,
            'name' => Player::where('userId', $arbitro->id)->value('name') ?? $arbitro->email,
        ] : null;
    }

    public function ensureCanManage(TournamentInstance $tournament, User $user): void
    {
        if (! $tournament->canManage($user)) {
            throw self::error('No tienes permiso para gestionar este torneo', 403);
        }
    }

    public function update(TournamentInstance $tournament, array $data, ?User $actingUser = null): TournamentInstance
    {
        $changed = [];

        foreach (['name', 'description', 'startDate', 'endDate', 'visibility', 'responsableId'] as $field) {
            if (array_key_exists($field, $data) && $data[$field] != $tournament->{$field}) {
                $changed[] = $field;
                $tournament->{$field} = $data[$field];
            }
        }

        // Raising/clearing the cap is harmless. Lowering it below the
        // roster is not — that needs to name who leaves (and wipes any
        // generated matches), so it lives in updateMaxParticipants().
        if (array_key_exists('maxParticipants', $data)) {
            $newMax = $data['maxParticipants'] === null || $data['maxParticipants'] === '' ? null : (int) $data['maxParticipants'];

            if ($newMax !== null && $newMax < TournamentParticipant::where('tournamentId', $tournament->id)->count()) {
                throw self::error('Hay más inscritos que el nuevo cupo — usa el ajuste de cupo máximo para elegir a quién quitar.', 400);
            }

            if ($newMax !== $tournament->maxParticipants) {
                $changed[] = 'maxParticipants';
                $tournament->maxParticipants = $newMax;
            }
        }

        if (array_key_exists('config', $data)) {
            $changed[] = 'config';
            $tournament->config = $data['config'];
        }

        if (array_key_exists('bestOf', $data)) {
            $newBestOf = (int) $data['bestOf'];

            if ($newBestOf !== (int) ($tournament->config['bestOf'] ?? 3)) {
                $changed[] = 'bestOf';
                $tournament->config = array_merge($tournament->config ?? [], ['bestOf' => $newBestOf]);
            }
        }

        $tournament->save();

        if ($changed) {
            $this->log($tournament, $actingUser, 'tournament_updated', 'Campos editados: '.implode(', ', $changed).'.');
        }

        return $tournament;
    }

    /**
     * Same two-step contract as Express: a tournament with played
     * matches is only deleted once the caller re-sends `confirmed`; the
     * 409 body carries the counts the frontend's confirm dialog shows.
     */
    public function delete(TournamentInstance $tournament, bool $confirmed = false): void
    {
        $playedCount = TournamentMatch::where('tournamentId', $tournament->id)->where('status', 'completed')->count();

        if ($playedCount > 0 && ! $confirmed) {
            throw self::error('Requiere confirmación', 409, [
                'requiresConfirmation' => true,
                'playedCount' => $playedCount,
                'totalMatches' => TournamentMatch::where('tournamentId', $tournament->id)->count(),
            ]);
        }

        $tournament->delete();
    }

    /**
     * Whoever may write a result directly: management (club admin /
     * super admin / responsable) or, in 'arbitro' mode, the assigned
     * referee (`arbitroId` is a User.id — see TournamentInstance::arbitro()).
     */
    public function canRegisterResult(TournamentInstance $tournament, User $user): bool
    {
        return $tournament->canManage($user)
            || ($tournament->resultMode === 'arbitro' && $tournament->arbitroId === $user->id);
    }

    public function updateResultMode(TournamentInstance $tournament, string $resultMode, ?string $arbitroId, ?User $actingUser = null): TournamentInstance
    {
        if (! in_array($resultMode, ['creador', 'jugador', 'arbitro'], true)) {
            throw self::error('resultMode debe ser creador, jugador o arbitro', 400);
        }

        if ($resultMode === 'arbitro' && ! $arbitroId) {
            throw self::error('Debes asignar un árbitro', 400);
        }

        DB::transaction(function () use ($tournament, $resultMode, $arbitroId) {
            $tournament->update([
                'resultMode' => $resultMode,
                'arbitroId' => $resultMode === 'arbitro' ? $arbitroId : null,
            ]);

            // Player proposals only make sense in 'jugador' mode — drop
            // any still waiting so nothing auto-confirms under new rules.
            TournamentMatch::where('tournamentId', $tournament->id)
                ->where('status', '!=', 'completed')
                // Mass update bypasses the model cast, so text[] needs the
                // raw Postgres literal ('[]' is not a valid array literal).
                ->update(['proposedByParticipant' => null, 'confirmedByParticipants' => '{}', 'expiresAt' => null]);
        });

        $this->log($tournament, $actingUser, 'result_mode_changed', "Modo de resultados: {$resultMode}.");

        return $tournament->refresh();
    }

    /**
     * Express semantics: shrinking below the enrolled count requires the
     * caller to name who to drop, and any generated matches are wiped
     * (the bracket/rotation no longer matches the roster) sending the
     * tournament back to draft.
     *
     * @param array<int, string> $participantsToRemove participant ids
     */
    public function updateMaxParticipants(TournamentInstance $tournament, ?int $newMax, array $participantsToRemove = [], ?User $actingUser = null): TournamentInstance
    {
        if ($newMax !== null && $newMax < 2) {
            throw self::error('El cupo mínimo es 2 participantes', 400);
        }

        $currentCount = TournamentParticipant::where('tournamentId', $tournament->id)->count();
        $toRemove = TournamentParticipant::where('tournamentId', $tournament->id)->whereIn('id', $participantsToRemove)->pluck('id')->all();
        $remaining = $currentCount - count($toRemove);

        if ($newMax !== null && $remaining > $newMax) {
            $needed = $remaining - $newMax;

            throw self::error("Debes seleccionar al menos {$needed} jugador".($needed !== 1 ? 'es' : '').' más para eliminar', 400);
        }

        $hadMatches = TournamentMatch::where('tournamentId', $tournament->id)->exists();

        // Removing someone from a fixed-pairs tournament that already started
        // leaves their partner alone, and pairs are frozen once running — so
        // no round could ever be generated again. Reopen it as a draft (the
        // only state where pairs can be rebuilt), matches or not.
        $breaksPairs = $toRemove
            && $tournament->pairingSystem === 'fixed_pairs'
            && $tournament->status !== 'draft';
        $backToDraft = $hadMatches || $breaksPairs;

        DB::transaction(function () use ($tournament, $newMax, $toRemove, $hadMatches, $backToDraft) {
            if ($hadMatches) {
                TournamentMatch::where('tournamentId', $tournament->id)->delete();
                TournamentRoundRole::where('tournament_id', $tournament->id)->delete();
            }

            foreach ($toRemove as $participantId) {
                $this->removeParticipantRow($tournament, $participantId);
            }

            $tournament->maxParticipants = $newMax;

            if ($backToDraft) {
                $tournament->status = 'draft';
            }

            $tournament->save();
        });

        $this->log($tournament, $actingUser, 'max_participants_changed', 'Cupo máximo: '.($newMax ?? 'sin límite').'.'
            .($toRemove ? ' Se quitaron '.count($toRemove).' participante(s).' : '')
            .($hadMatches ? ' Se eliminaron los partidos y el torneo volvió a borrador.' : ($backToDraft ? ' El torneo volvió a borrador para rehacer las parejas.' : '')));

        return $tournament->refresh();
    }

    /** Wipes every match (and rotation history); optionally the roster too. Back to draft. */
    public function reset(TournamentInstance $tournament, bool $keepPlayers = true, ?User $actingUser = null): TournamentInstance
    {
        DB::transaction(function () use ($tournament, $keepPlayers) {
            TournamentMatch::where('tournamentId', $tournament->id)->delete();
            TournamentRoundRole::where('tournament_id', $tournament->id)->delete();

            if (! $keepPlayers) {
                TournamentParticipant::where('tournamentId', $tournament->id)->delete();
            }

            $tournament->update(['status' => 'draft']);
        });

        $this->log($tournament, $actingUser, 'tournament_reset', $keepPlayers ? 'Torneo reiniciado (se conservan los jugadores).' : 'Torneo reiniciado (jugadores eliminados).');

        return $tournament;
    }

    /** Toggles archived ⇄ completed; a draft has nothing to archive. */
    public function toggleArchive(TournamentInstance $tournament, ?User $actingUser = null): TournamentInstance
    {
        if ($tournament->status === 'draft') {
            throw self::error('Un borrador no se puede archivar', 400);
        }

        $archiving = $tournament->status !== 'archived';
        $tournament->update(['status' => $archiving ? 'archived' : 'completed']);

        $this->log($tournament, $actingUser, $archiving ? 'tournament_archived' : 'tournament_unarchived', $archiving ? 'Torneo archivado.' : 'Torneo restaurado del archivo.');

        return $tournament;
    }

    public function addParticipant(TournamentInstance $tournament, array $data, ?User $actingUser = null): TournamentParticipant
    {
        $playerId = $data['playerId'] ?? null;

        if (! $playerId) {
            throw self::error('playerId requerido', 400);
        }

        if ($tournament->maxParticipants && $tournament->participants()->count() >= $tournament->maxParticipants) {
            throw self::error('El torneo ha alcanzado el cupo máximo', 400, ['full' => true]);
        }

        if (TournamentParticipant::where('tournamentId', $tournament->id)->where('playerId', $playerId)->exists()) {
            throw self::error('Jugador ya inscrito', 400);
        }

        $participant = TournamentParticipant::create([
            'tournamentId' => $tournament->id,
            'playerId' => $playerId,
            'teamName' => $data['teamName'] ?? null,
            'seed' => $data['seed'] ?? null,
        ]);

        $player = Player::find($playerId);

        if ($player?->userId) {
            $this->notifications->create(
                $player->userId,
                'tournament_enrolled',
                'Te inscribieron en un torneo',
                "Te sumaron al torneo \"{$tournament->name}\".",
                "/tournaments/{$tournament->id}/view",
            );
        }

        $this->log($tournament, $actingUser, 'participant_added', 'Se agregó a '.($player?->name ?? $playerId).'.');

        return $participant;
    }

    public function removeParticipant(TournamentInstance $tournament, string $participantId, ?User $actingUser = null): void
    {
        $participant = TournamentParticipant::where('tournamentId', $tournament->id)->find($participantId);

        if (! $participant) {
            throw self::error('Participante no encontrado', 404);
        }

        $playerName = $participant->player?->name ?? $participant->playerId;

        $this->removeParticipantRow($tournament, $participant->id);

        $this->log($tournament, $actingUser, 'participant_removed', "Se quitó a {$playerName}.");
    }

    /**
     * Deletes a participant AND anyone pointing at them — their
     * confirmed partner, or a player whose pending pair request
     * targeted them — so no `partnerId` is left dangling on a removed
     * player. Requesters fall back to 'active'.
     */
    protected function removeParticipantRow(TournamentInstance $tournament, string $participantId): void
    {
        $participant = TournamentParticipant::where('tournamentId', $tournament->id)->find($participantId);

        if (! $participant) {
            return;
        }

        TournamentParticipant::where('tournamentId', $tournament->id)
            ->where('partnerId', $participant->playerId)
            ->where('status', 'pair_requested')
            ->update(['partnerId' => null, 'status' => 'active']);

        TournamentParticipant::where('tournamentId', $tournament->id)
            ->where('partnerId', $participant->playerId)
            ->update(['partnerId' => null]);

        $participant->delete();
    }

    /**
     * Drops every pending pair request in the tournament (requester back
     * to 'active', no partner). Admin pairing tools call this first: an
     * unanswered request must never leave a half-formed pair behind.
     */
    protected function clearPendingPairRequests(TournamentInstance $tournament, ?array $onlyPlayerIds = null): void
    {
        $query = TournamentParticipant::where('tournamentId', $tournament->id)->where('status', 'pair_requested');

        if ($onlyPlayerIds !== null) {
            $query->where(fn ($q) => $q->whereIn('playerId', $onlyPlayerIds)->orWhereIn('partnerId', $onlyPlayerIds));
        }

        $query->update(['partnerId' => null, 'status' => 'active']);
    }

    public function pairParticipants(TournamentInstance $tournament, string $participantId1, string $participantId2, ?User $actingUser = null): void
    {
        $p1 = TournamentParticipant::where('tournamentId', $tournament->id)->find($participantId1);
        $p2 = TournamentParticipant::where('tournamentId', $tournament->id)->find($participantId2);

        if (! $p1 || ! $p2) {
            throw self::error('Participante no encontrado', 404);
        }

        $hasConfirmedPartner = fn (TournamentParticipant $p) => $p->partnerId && $p->status !== 'pair_requested';

        if ($hasConfirmedPartner($p1) || $hasConfirmedPartner($p2)) {
            throw self::error('Uno de los participantes ya tiene pareja asignada', 400);
        }

        DB::transaction(function () use ($tournament, $p1, $p2) {
            // The admin's choice wins over any unanswered player request
            // involving either of them.
            $this->clearPendingPairRequests($tournament, [$p1->playerId, $p2->playerId]);

            $p1->update(['partnerId' => $p2->playerId]);
            $p2->update(['partnerId' => $p1->playerId]);
        });

        $this->log($tournament, $actingUser, 'paired', ($p1->player?->name ?? $p1->playerId).' y '.($p2->player?->name ?? $p2->playerId).' fueron emparejados.');
    }

    public function unpairParticipant(TournamentInstance $tournament, string $participantId, ?User $actingUser = null): void
    {
        $participant = TournamentParticipant::where('tournamentId', $tournament->id)->find($participantId);

        if (! $participant) {
            throw self::error('Participante no encontrado', 404);
        }

        $playerName = $participant->player?->name ?? $participant->playerId;

        DB::transaction(function () use ($tournament, $participant) {
            if ($participant->partnerId) {
                TournamentParticipant::where('tournamentId', $tournament->id)
                    ->where('playerId', $participant->partnerId)
                    ->update(['partnerId' => null]);
            }

            $participant->update(['partnerId' => null]);
        });

        $this->log($tournament, $actingUser, 'unpaired', "Se deshizo la pareja de {$playerName}.");
    }

    /**
     * Auto-pairs every currently-unpaired, non-absent participant.
     * "Aleatoria" in the sense that who ends up with whom among
     * same-level players isn't predictable — ties are shuffled before
     * sorting — but the actual goal is balance, not randomness for its
     * own sake: sorted by Player.level descending and paired
     * highest-with-lowest (1st with last, 2nd with 2nd-to-last, ...) so
     * each resulting PAIR ends up with a similar combined level to
     * every other pair, rather than stacking all the strong players
     * together. An odd one out sits unpaired — caller decides what to
     * do about it (manual pairing, invite one more, etc.).
     *
     * @return array{pairs: int, unpaired: ?string}
     */
    public function autoPairParticipants(TournamentInstance $tournament, ?User $actingUser = null): array
    {
        $this->clearPendingPairRequests($tournament);

        $unpaired = TournamentParticipant::where('tournamentId', $tournament->id)
            ->where('status', '!=', 'absent')
            ->whereNull('partnerId')
            ->with('player:id,name,level')
            ->get()
            ->shuffle()
            ->sortByDesc(fn ($p) => $p->player?->level ?? 0)
            ->values();

        $leftover = null;

        if ($unpaired->count() % 2 !== 0) {
            // The MEDIAN player sits out, not simply the lowest-level
            // one — dropping the lowest would skew every remaining
            // high/low pairing toward the strong side. Dropping the
            // middle keeps the rest exactly as balanced as the even
            // case.
            $medianIndex = intdiv($unpaired->count(), 2);
            $leftover = $unpaired->get($medianIndex);
            $unpaired = $unpaired->forget($medianIndex)->values();
        }

        $pairsFormed = 0;

        DB::transaction(function () use ($unpaired, &$pairsFormed) {
            $half = intdiv($unpaired->count(), 2);

            for ($i = 0; $i < $half; $i++) {
                $strong = $unpaired[$i];
                $weak = $unpaired[$unpaired->count() - 1 - $i];

                $strong->update(['partnerId' => $weak->playerId]);
                $weak->update(['partnerId' => $strong->playerId]);
                $pairsFormed++;
            }
        });

        $this->log($tournament, $actingUser, 'auto_paired', "Emparejamiento automático: {$pairsFormed} pareja(s) formada(s)."
            .($leftover ? " {$leftover->player?->name} quedó sin pareja (cantidad impar)." : ''));

        return ['pairs' => $pairsFormed, 'unpaired' => $leftover?->player?->name];
    }

    public function setSubstitute(TournamentInstance $tournament, string $participantId, ?string $substitutePlayerId, ?string $reason, ?string $note, ?User $actingUser = null): TournamentParticipant
    {
        $participant = TournamentParticipant::where('tournamentId', $tournament->id)->find($participantId);

        if (! $participant) {
            throw self::error('Participante no encontrado', 404);
        }

        if ($substitutePlayerId && ! Player::whereKey($substitutePlayerId)->exists()) {
            throw self::error('Jugador sustituto no encontrado', 404);
        }

        $isReverting = ! $substitutePlayerId && ! $reason;
        $playerName = $participant->player?->name ?? $participant->playerId;

        $participant->update([
            'status' => $substitutePlayerId || $reason ? 'absent' : 'active',
            'substituteId' => $substitutePlayerId,
            'absenceReason' => $reason,
            'absenceNote' => $note,
        ]);

        $this->log($tournament, $actingUser, $isReverting ? 'substitute_reverted' : 'substitute_set', $isReverting
            ? "Se revirtió la baja de {$playerName}."
            : "{$playerName} dado de baja".($reason ? " ({$reason})" : '').'.');

        return $participant->load('substitute:id,name,avatarUrl');
    }

    /** @return Collection<int, TournamentMatch> */
    public function generateRound(TournamentInstance $tournament, ?User $actingUser = null): Collection
    {
        // A draft tournament must go through startTournament() first —
        // that's what validates pairing/participant minimums and is
        // the deliberate "todo esto antes de iniciar" checkpoint (see
        // its own docblock). No more implicit draft→active flip on the
        // first generateRound() call.
        if ($tournament->status === 'draft') {
            throw self::error('Iniciá el torneo antes de generar partidos.', 400);
        }

        if ($tournament->status === 'suspended') {
            throw self::error('El torneo está suspendido — reanudalo antes de generar partidos.', 400);
        }

        if ($tournament->status === 'completed') {
            throw self::error('El torneo ya finalizó.', 400);
        }

        $enrolledIds = TournamentParticipant::where('tournamentId', $tournament->id)->pluck('id')->all();

        $this->assertFullyPaired($tournament);

        $engine = $this->engines->forTournament($tournament);
        $matches = $engine->generateRound($tournament, $enrolledIds);

        $this->assignCourts($tournament, $matches);

        $this->log($tournament, $actingUser, 'round_generated', "Fecha {$matches->first()?->round} generada — {$matches->count()} partido(s).");

        return $matches;
    }

    /**
     * Gives the round's matches the tournament's courts, in the order the
     * admin ranked them (TournamentCourt.displayOrder). A round's matches
     * are played simultaneously, so the courts are the cap: with fewer
     * courts than matches the extra matches are left WITHOUT a court
     * (shown as "sin pista") rather than reusing one and implying two
     * matches share it at the same time. Inactive courts and byes are
     * skipped. No courts configured → nothing is assigned (as before).
     *
     * @param Collection<int, TournamentMatch> $matches
     */
    protected function assignCourts(TournamentInstance $tournament, Collection $matches): void
    {
        $courtIds = $tournament->courts()
            ->with('court:id,isActive')
            ->orderBy('displayOrder')
            ->get()
            ->filter(fn ($entry) => $entry->court?->isActive)
            ->pluck('courtId')
            ->values();

        if ($courtIds->isEmpty()) {
            return;
        }

        $slot = 0;

        foreach ($matches as $match) {
            if (! empty($match->result['bye']) || $slot >= $courtIds->count()) {
                continue;
            }

            $match->update(['courtId' => $courtIds[$slot++]]);
        }
    }

    /**
     * PartnerGrouper silently falls back to a singleton "unit of one"
     * for anyone left unpaired in a fixed_pairs tournament — fine as an
     * internal fallback (e.g. one partner goes absent mid-tournament),
     * but starting/generating with pairing still incomplete would
     * field a lone player as if they were a full pair. Shared by
     * startTournament() and generateRound() — the latter keeps its own
     * copy of this check as defense in depth, in case pairing was
     * somehow disturbed after the tournament already started.
     */
    protected function assertFullyPaired(TournamentInstance $tournament): void
    {
        if (TournamentParticipant::where('tournamentId', $tournament->id)->count() < 2) {
            throw self::error('Mínimo 2 participantes', 400);
        }

        if ($tournament->pairingSystem !== 'fixed_pairs') {
            return;
        }

        // A `pair_requested` participant carries a partnerId (the
        // requested player) but the pair isn't confirmed — it counts as
        // unpaired, otherwise PartnerGrouper would fabricate a couple
        // out of an unanswered request.
        $unpaired = TournamentParticipant::where('tournamentId', $tournament->id)
            ->where('status', '!=', 'absent')
            ->where(fn ($q) => $q->whereNull('partnerId')->orWhere('status', 'pair_requested'))
            ->with('player:id,name')
            ->get();

        if ($unpaired->isNotEmpty()) {
            $names = $unpaired->pluck('player.name')->filter()->implode(', ');

            throw self::error(
                "Todos los participantes deben tener pareja antes de generar partidos. Sin pareja: {$names}",
                400,
                ['unpaired' => $unpaired->pluck('id')->all()],
            );
        }
    }

    /**
     * The explicit "Iniciar torneo" action — new, not an Express
     * carry-over. Before this existed, a tournament silently flipped
     * from draft to active the moment an admin generated the first
     * round, with no dedicated checkpoint for "is the setup (pairs,
     * roster) actually finished?". Pairing edits (manual/auto-pair) are
     * meant to happen only while a tournament is still draft — the
     * frontend's Parejas tab locks once this has run.
     */
    public function startTournament(TournamentInstance $tournament, ?User $actingUser = null): TournamentInstance
    {
        if ($tournament->status !== 'draft') {
            throw self::error('Solo se puede iniciar un torneo en borrador.', 400);
        }

        $this->assertFullyPaired($tournament);

        $tournament->update(['status' => 'active']);
        $this->log($tournament, $actingUser, 'tournament_started', 'Torneo iniciado.');

        return $tournament;
    }

    public function standings(TournamentInstance $tournament): array
    {
        // A proposal whose 24h lapsed must count before the table is drawn.
        $this->playerResults->autoConfirmExpired($tournament->id);
        $tournament->load('matches');

        return $this->engines->forTournament($tournament)->calculateStandings($tournament);
    }

    /**
     * Wired so TournamentView.jsx's "Actividad" tab has something to
     * call instead of 404ing — nothing writes to `TournamentLog` yet in
     * this new engine (unlike the old Express TournamentService, which
     * logged every participant/result/config action), so this reads as
     * empty for now. Revisit once there's an actual need for an audit
     * trail on the new system.
     */
    public function logs(TournamentInstance $tournament): array
    {
        return \App\Models\TournamentLog::where('tournamentId', $tournament->id)
            ->orderByDesc('createdAt')
            ->limit(200)
            ->get()
            ->all();
    }

    /**
     * `played` (default true) marks whether the match was actually
     * contested — false covers a walkover/no-show, an injury, or a
     * mid-match withdrawal ("abandono"). The outcome/winner is still
     * required either way (someone still advances/gets the points for
     * standings purposes), but `played=false` is what
     * ValorationService::pending() checks to withhold valorations for
     * a match that was never really played — a no-show shouldn't let
     * either side rate the other. `completedAt` (stamped here, at the
     * moment the result is registered — never derived from the match's
     * `createdAt`) is also what starts the valoration window.
     */
    /**
     * New build for the new engine — NOT a port of the old
     * TournamentMatchService.getMyMatches(). The old version also
     * handled self-service player result proposals (`result.status`
     * pending/confirmed, auto-confirm on expiry) and a referee flow via
     * `arbitroId`; neither exists in the new engine (only
     * admin/responsable can call setResult(), and nothing currently
     * sets `arbitroId` from TournamentEngineAdmin's create form), so
     * this only needs to resolve `group`-based matches (the new engine
     * never populates participant1Id/participant2Id — see
     * TournamentMatch::getGroupData()) and each match's valoration
     * state, matching what Matches.jsx renders.
     *
     * @return array<int, array>
     */
    public function myMatches(User $user): array
    {
        $this->playerResults->autoConfirmExpired();

        $player = Player::where('userId', $user->id)->first();

        return $player ? $this->matchesForPlayer($player) : [];
    }

    /**
     * Public-profile history: only finished matches, and none of the
     * private bookkeeping (who this player has rated, open proposals).
     *
     * @return array<int, array>
     */
    public function publicMatchHistory(Player $player): array
    {
        $rows = array_map(function (array $row) {
            unset($row['valoredPlayerIds'], $row['proposedByParticipant'], $row['confirmedByParticipants'], $row['expiresAt'], $row['resultMode']);

            return $row;
        }, $this->matchesForPlayer($player, completedOnly: true));

        usort($rows, fn ($a, $b) => strcmp($b['completedAt'] ?? '', $a['completedAt'] ?? ''));

        return array_values($rows);
    }

    /**
     * Every match $player takes part in, in the shape Matches.jsx /
     * Valorations.jsx / the public profile render (see myMatches()).
     *
     * @return array<int, array>
     */
    public function matchesForPlayer(Player $player, bool $completedOnly = false): array
    {
        $myParticipantIds = TournamentParticipant::where('playerId', $player->id)->pluck('id');

        if ($myParticipantIds->isEmpty()) {
            return [];
        }

        $myParticipantIdSet = $myParticipantIds->all();
        $tournamentIds = TournamentParticipant::where('playerId', $player->id)->pluck('tournamentId')->unique();

        $matches = TournamentMatch::whereIn('tournamentId', $tournamentIds)
            ->when($completedOnly, fn ($q) => $q->where('status', 'completed'))
            ->with(['tournament.club:id,name', 'court:id,name,alias'])
            ->orderBy('round')
            ->orderBy('createdAt')
            ->get();

        $allParticipantIds = [];
        foreach ($matches as $m) {
            $group = $m->getGroupData();
            if ($group) {
                $allParticipantIds = array_merge($allParticipantIds, $group['team1'] ?? [], $group['team2'] ?? []);
            }
        }

        $pMap = TournamentParticipant::whereIn('id', array_unique($allParticipantIds))
            ->with('player:id,name')
            ->get()
            ->keyBy('id');

        $result = [];

        foreach ($matches as $m) {
            $group = $m->getGroupData();

            if (! $group) {
                continue;
            }

            $team1Ids = $group['team1'] ?? [];
            $team2Ids = $group['team2'] ?? [];
            $inTeam1 = count(array_intersect($team1Ids, $myParticipantIdSet)) > 0;
            $inTeam2 = count(array_intersect($team2Ids, $myParticipantIdSet)) > 0;

            if (! $inTeam1 && ! $inTeam2) {
                continue;
            }

            $myIds = $inTeam1 ? $team1Ids : $team2Ids;
            $opIds = $inTeam1 ? $team2Ids : $team1Ids;

            $nameOf = fn ($id) => $pMap->get($id)?->player?->name;
            $playerIdOf = fn ($id) => $pMap->get($id)?->playerId;

            $completed = $m->status === 'completed';
            $valoredPlayerIds = $completed
                ? Valoration::where('tournamentMatchId', $m->id)->where('fromPlayerId', $player->id)->pluck('toPlayerId')->all()
                : [];

            $result[] = [
                'id' => $m->id,
                'tournamentId' => $m->tournamentId,
                'tournamentName' => $m->tournament?->name ?? '—',
                'tournamentStatus' => $m->tournament?->status,
                'resultMode' => $m->tournament?->resultMode ?? 'creador',
                'clubName' => $m->tournament?->club?->name,
                'round' => $m->round,
                'status' => $m->status,
                'result' => $m->result,
                'played' => $m->wasPlayed(),
                'scheduledAt' => $m->scheduledAt,
                'completedAt' => $m->completedAt()?->toIso8601String(),
                'court' => $m->court ? ['name' => $m->court->name, 'alias' => $m->court->alias] : null,
                'proposedByParticipant' => $m->proposedByParticipant,
                'confirmedByParticipants' => $m->confirmedByParticipants ?? [],
                'expiresAt' => $m->expiresAt,
                'isTeam1' => $inTeam1,
                'myTeam' => array_values(array_filter(array_map($nameOf, $myIds))),
                'opponentTeam' => array_values(array_filter(array_map($nameOf, $opIds))),
                'myParticipantIds' => array_values(array_intersect($myIds, $myParticipantIdSet)),
                'opponentParticipantIds' => $opIds,
                'myPlayerIds' => array_values(array_filter(array_map($playerIdOf, $myIds))),
                'opponentPlayerIds' => array_values(array_filter(array_map($playerIdOf, $opIds))),
                'valoredPlayerIds' => $valoredPlayerIds,
            ];
        }

        return $result;
    }

    /**
     * "Gana/empata/pierde" alone isn't enough — a real result is either
     * games per set (validated against the tournament's best-of, default
     * 3) or a retirement (walkover/injury/no-show/whatever, always with
     * a reason) that hands the match to the opponent. `outcome` is no
     * longer trusted from the client — it's derived here from whichever
     * of the two the caller actually sent.
     */
    public function setResult(TournamentMatch $match, array $result, ?User $actingUser = null): TournamentMatch
    {
        if ($match->status === 'suspended') {
            throw self::error('El partido está suspendido — reanúdalo antes de registrar el resultado', 400);
        }

        $evaluated = $this->results->evaluate($result, (int) ($match->tournament?->config['bestOf'] ?? 3));
        $outcome = $evaluated['outcome'];
        $played = $evaluated['played'];
        $sets = $evaluated['sets'];
        $retired = $evaluated['retired'];

        $match->update([
            'status' => 'completed',
            'result' => [
                'outcome' => $outcome,
                'sets' => $sets,
                'retired' => $retired,
                'played' => $played,
                'completedAt' => now()->toIso8601String(),
            ],
            // An admin/referee result overrides any player proposal still
            // waiting for confirmation.
            'proposedByParticipant' => null,
            'confirmedByParticipants' => [],
            'expiresAt' => null,
        ]);

        foreach ($this->userIdsForMatch($match) as $userId) {
            $this->notifications->create(
                $userId,
                'match_result_set',
                'Resultado registrado',
                "Se registró el resultado de tu partido en \"{$match->tournament?->name}\".",
                "/tournaments/{$match->tournamentId}/view",
            );
        }

        if ($match->tournament) {
            $this->log($match->tournament, $actingUser, 'result_set', "Resultado registrado — fecha {$match->round}: {$outcome}".($played ? '' : ' (no jugado)').'.');
        }

        return $match;
    }

    /**
     * A tournament can only be suspended while active, and resumed
     * only while suspended — no suspending a draft (nothing's running
     * yet to pause) and no double-suspending. Resuming always lands
     * back on 'active', never 'draft' — a suspended tournament had
     * already started.
     */
    public function suspendTournament(TournamentInstance $tournament, ?User $actingUser = null): TournamentInstance
    {
        if ($tournament->status !== 'active') {
            throw self::error('Solo se puede suspender un torneo activo', 400);
        }

        $tournament->update(['status' => 'suspended']);

        foreach ($this->userIdsForTournament($tournament) as $userId) {
            $this->notifications->create(
                $userId,
                'tournament_suspended',
                'Torneo suspendido',
                "El torneo \"{$tournament->name}\" fue suspendido.",
                "/tournaments/{$tournament->id}/view",
            );
        }

        $this->log($tournament, $actingUser, 'tournament_suspended', 'Torneo suspendido.');

        return $tournament;
    }

    public function resumeTournament(TournamentInstance $tournament, ?User $actingUser = null): TournamentInstance
    {
        if ($tournament->status !== 'suspended') {
            throw self::error('El torneo no está suspendido', 400);
        }

        $tournament->update(['status' => 'active']);

        foreach ($this->userIdsForTournament($tournament) as $userId) {
            $this->notifications->create(
                $userId,
                'tournament_resumed',
                'Torneo reanudado',
                "El torneo \"{$tournament->name}\" fue reanudado.",
                "/tournaments/{$tournament->id}/view",
            );
        }

        $this->log($tournament, $actingUser, 'tournament_resumed', 'Torneo reanudado.');

        return $tournament;
    }

    /**
     * A completed match can't be suspended (there's nothing left to
     * pause — it already has a result); resuming always lands back on
     * 'pending' (GenericEngine's status for a not-yet-completed match,
     * see its generateRound()), not whatever status it happened to
     * have before — 'suspended' is the only other status a
     * not-completed match can be in.
     */
    public function suspendMatch(TournamentMatch $match, ?User $actingUser = null): TournamentMatch
    {
        if ($match->status === 'completed') {
            throw self::error('No se puede suspender un partido ya completado', 400);
        }

        if ($match->status === 'suspended') {
            throw self::error('El partido ya está suspendido', 400);
        }

        $match->update(['status' => 'suspended']);

        foreach ($this->userIdsForMatch($match) as $userId) {
            $this->notifications->create(
                $userId,
                'match_suspended',
                'Partido suspendido',
                "Tu partido en \"{$match->tournament?->name}\" fue suspendido.",
                "/tournaments/{$match->tournamentId}/view",
            );
        }

        if ($match->tournament) {
            $this->log($match->tournament, $actingUser, 'match_suspended', "Partido de la fecha {$match->round} suspendido.");
        }

        return $match;
    }

    public function resumeMatch(TournamentMatch $match, ?User $actingUser = null): TournamentMatch
    {
        if ($match->status !== 'suspended') {
            throw self::error('El partido no está suspendido', 400);
        }

        $match->update(['status' => 'pending']);

        foreach ($this->userIdsForMatch($match) as $userId) {
            $this->notifications->create(
                $userId,
                'match_resumed',
                'Partido reanudado',
                "Tu partido en \"{$match->tournament?->name}\" fue reanudado.",
                "/tournaments/{$match->tournamentId}/view",
            );
        }

        if ($match->tournament) {
            $this->log($match->tournament, $actingUser, 'match_resumed', "Partido de la fecha {$match->round} reanudado.");
        }

        return $match;
    }

    /**
     * Resolves every participant's User.id from a match's `group` JSON
     * (team1+team2 combined) — same lookup pattern already used by
     * ValorationService/TournamentService::myMatches(), duplicated
     * rather than shared since those live in separate services with no
     * natural common home yet.
     *
     * @return array<int, string>
     */
    protected function userIdsForMatch(TournamentMatch $match): array
    {
        $group = $match->getGroupData();

        if (! $group) {
            return [];
        }

        $participantIds = array_merge($group['team1'] ?? [], $group['team2'] ?? []);

        return TournamentParticipant::whereIn('id', $participantIds)
            ->with('player:id,userId')
            ->get()
            ->pluck('player.userId')
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    /** @return array<int, string> */
    protected function userIdsForTournament(TournamentInstance $tournament): array
    {
        return TournamentParticipant::where('tournamentId', $tournament->id)
            ->with('player:id,userId')
            ->get()
            ->pluck('player.userId')
            ->filter()
            ->unique()
            ->values()
            ->all();
    }
}
