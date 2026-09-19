<?php

namespace App\Services\Tournament;

use App\Exceptions\ApiException;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\TournamentLog;
use App\Models\TournamentParticipant;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Support\Facades\DB;

/**
 * Player-driven pairing for `fixed_pairs` tournaments (send / accept /
 * reject / cancel). Port of the Express flow, same data model:
 *
 *   requester: status='pair_requested', partnerId = target's Player.id
 *   accepted:  both rows status='active', partnerId = each other's Player.id
 *
 * `partnerId` holds a **Player.id**, never a participant id (see
 * TournamentParticipant's docblock). Only allowed while the tournament is
 * a draft — pairs freeze when it starts. Unanswered requests do NOT count
 * as pairs anywhere else (TournamentService::assertFullyPaired()).
 */
class PairRequestService
{
    public function __construct(protected NotificationService $notifications) {}

    protected static function error(string $message, int $status): ApiException
    {
        return new ApiException($message, $status);
    }

    protected function playerFor(User $user): Player
    {
        $player = Player::where('userId', $user->id)->first();

        if (! $player) {
            throw self::error('Jugador no encontrado', 404);
        }

        return $player;
    }

    protected function log(TournamentInstance $tournament, User $user, ?string $playerName, string $action, string $detail): void
    {
        TournamentLog::create([
            'tournamentId' => $tournament->id,
            'userId' => $user->id,
            'playerName' => $playerName,
            'action' => $action,
            'detail' => $detail,
        ]);
    }

    public function send(TournamentInstance $tournament, string $toPlayerId, User $user): void
    {
        if ($tournament->pairingSystem !== 'fixed_pairs') {
            throw self::error('Solo para torneos de parejas fijas', 400);
        }

        if ($tournament->status !== 'draft') {
            throw self::error('Solo se pueden solicitar parejas antes de iniciar el torneo', 400);
        }

        $player = $this->playerFor($user);

        if ($player->id === $toPlayerId) {
            throw self::error('No puedes solicitarte a ti mismo', 400);
        }

        DB::transaction(function () use ($tournament, $toPlayerId, $player, $user) {
            $mine = TournamentParticipant::where('tournamentId', $tournament->id)
                ->where('playerId', $player->id)->lockForUpdate()->first();

            if (! $mine) {
                throw self::error('No estás inscrito en este torneo', 403);
            }

            if ($mine->status === 'pair_requested') {
                throw self::error('Ya tienes una solicitud pendiente. Cancélala primero.', 400);
            }

            if ($mine->partnerId) {
                throw self::error('Ya tienes pareja asignada', 400);
            }

            $target = TournamentParticipant::where('tournamentId', $tournament->id)
                ->where('playerId', $toPlayerId)->with('player:id,name,userId')->lockForUpdate()->first();

            if (! $target) {
                throw self::error('El jugador no está inscrito en este torneo', 404);
            }

            if ($target->partnerId && $target->status !== 'pair_requested') {
                throw self::error('Ese jugador ya tiene pareja confirmada', 400);
            }

            if ($target->status === 'pair_requested' && $target->partnerId === $player->id) {
                throw self::error('Ese jugador ya te envió una solicitud — acéptala en tu perfil del torneo.', 400);
            }

            $mine->update(['partnerId' => $toPlayerId, 'status' => 'pair_requested']);

            $this->log($tournament, $user, $player->name, 'pair_requested', "{$player->name} → {$target->player->name}");

            if ($target->player->userId) {
                $this->notifications->create(
                    $target->player->userId,
                    'pair_requested',
                    'Solicitud de pareja',
                    "{$player->name} quiere ser tu pareja en \"{$tournament->name}\".",
                    "/tournaments/{$tournament->id}/view",
                );
            }
        });
    }

    public function accept(TournamentInstance $tournament, string $fromPlayerId, User $user): void
    {
        if ($tournament->status !== 'draft') {
            throw self::error('Las parejas quedaron fijas al iniciar el torneo', 400);
        }

        $player = $this->playerFor($user);

        DB::transaction(function () use ($tournament, $fromPlayerId, $player, $user) {
            $mine = TournamentParticipant::where('tournamentId', $tournament->id)
                ->where('playerId', $player->id)->lockForUpdate()->first();

            if (! $mine) {
                throw self::error('No estás inscrito', 403);
            }

            if ($mine->partnerId && $mine->status !== 'pair_requested') {
                throw self::error('Ya tienes pareja asignada', 400);
            }

            $requester = TournamentParticipant::where('tournamentId', $tournament->id)
                ->where('playerId', $fromPlayerId)
                ->where('status', 'pair_requested')
                ->where('partnerId', $player->id)
                ->with('player:id,name,userId')
                ->lockForUpdate()
                ->first();

            if (! $requester) {
                throw self::error('Solicitud no encontrada o ya expirada', 404);
            }

            // If I had an outgoing request of my own, accepting supersedes it.
            $requester->update(['partnerId' => $player->id, 'status' => 'active']);
            $mine->update(['partnerId' => $fromPlayerId, 'status' => 'active']);

            // Anyone else who had asked either of us is back to unpaired.
            TournamentParticipant::where('tournamentId', $tournament->id)
                ->where('status', 'pair_requested')
                ->whereIn('partnerId', [$player->id, $fromPlayerId])
                ->update(['partnerId' => null, 'status' => 'active']);

            $this->log($tournament, $user, $player->name, 'pair_confirmed', "{$requester->player->name} & {$player->name}");

            if ($requester->player->userId) {
                $this->notifications->create(
                    $requester->player->userId,
                    'pair_accepted',
                    'Pareja confirmada',
                    "{$player->name} aceptó ser tu pareja en \"{$tournament->name}\".",
                    "/tournaments/{$tournament->id}/view",
                );
            }
        });
    }

    public function reject(TournamentInstance $tournament, string $fromPlayerId, User $user): void
    {
        $player = $this->playerFor($user);

        $requester = TournamentParticipant::where('tournamentId', $tournament->id)
            ->where('playerId', $fromPlayerId)
            ->where('status', 'pair_requested')
            ->where('partnerId', $player->id)
            ->with('player:id,name,userId')
            ->first();

        if (! $requester) {
            throw self::error('Solicitud no encontrada', 404);
        }

        $requester->update(['partnerId' => null, 'status' => 'active']);

        $this->log($tournament, $user, $player->name, 'pair_rejected', "{$player->name} rechazó la solicitud de {$requester->player->name}");

        if ($requester->player->userId) {
            $this->notifications->create(
                $requester->player->userId,
                'pair_rejected',
                'Solicitud de pareja rechazada',
                "{$player->name} rechazó tu solicitud de pareja en \"{$tournament->name}\".",
                "/tournaments/{$tournament->id}/view",
            );
        }
    }

    public function cancel(TournamentInstance $tournament, User $user): void
    {
        $player = $this->playerFor($user);

        $mine = TournamentParticipant::where('tournamentId', $tournament->id)
            ->where('playerId', $player->id)
            ->where('status', 'pair_requested')
            ->first();

        if (! $mine) {
            throw self::error('Sin solicitud pendiente', 404);
        }

        $mine->update(['partnerId' => null, 'status' => 'active']);

        $this->log($tournament, $user, $player->name, 'pair_request_cancelled', "{$player->name} canceló su solicitud de pareja.");
    }
}
