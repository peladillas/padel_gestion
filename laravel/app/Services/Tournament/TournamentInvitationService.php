<?php

namespace App\Services\Tournament;

use App\Exceptions\ApiException;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\TournamentParticipant;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Self-enrolment by invite link (`/tournaments/join/:token`). Port of
 * getJoinInfo / joinViaToken / generateInviteToken / updateInviteSettings
 * from the Express TournamentService, with two deliberate differences:
 *
 *  - Joining is only open while the tournament is a **draft**. Express also
 *    allowed 'active', but here pairs are frozen at start (a late joiner in
 *    a fixed_pairs tournament would be unpaired and block every future
 *    round), so the roster closes when the tournament starts.
 *  - The capacity check + insert run under a row lock, so two people taking
 *    the last spot at the same moment can't both get in.
 */
class TournamentInvitationService
{
    public function __construct(protected NotificationService $notifications) {}

    protected static function error(string $message, int $status, array $extra = []): ApiException
    {
        return new ApiException($message, $status, $extra);
    }

    public function inviteUrl(?string $token): ?string
    {
        if (! $token) {
            return null;
        }

        return rtrim((string) config('bonapinta.frontend_url'), '/').'/tournaments/join/'.$token;
    }

    /** @return array{inviteToken: string, allowInvitations: bool, maxParticipants: ?int, inviteUrl: string} */
    public function generate(TournamentInstance $tournament, array $data): array
    {
        $updates = [
            'inviteToken' => bin2hex(random_bytes(20)),
            'allowInvitations' => array_key_exists('allowInvitations', $data) ? (bool) $data['allowInvitations'] : true,
        ];

        if (array_key_exists('maxParticipants', $data)) {
            $updates['maxParticipants'] = $data['maxParticipants'] ? (int) $data['maxParticipants'] : null;
        }

        $tournament->update($updates);

        return [
            'inviteToken' => $tournament->inviteToken,
            'allowInvitations' => (bool) $tournament->allowInvitations,
            'maxParticipants' => $tournament->maxParticipants,
            'inviteUrl' => $this->inviteUrl($tournament->inviteToken),
        ];
    }

    /** @return array{allowInvitations: bool, maxParticipants: ?int, inviteToken: ?string, inviteUrl: ?string} */
    public function updateSettings(TournamentInstance $tournament, array $data): array
    {
        $updates = [];

        if (array_key_exists('allowInvitations', $data)) {
            $updates['allowInvitations'] = (bool) $data['allowInvitations'];
        }

        if (array_key_exists('maxParticipants', $data)) {
            $updates['maxParticipants'] = $data['maxParticipants'] ? (int) $data['maxParticipants'] : null;
        }

        if ($updates) {
            $tournament->update($updates);
        }

        return [
            'allowInvitations' => (bool) $tournament->allowInvitations,
            'maxParticipants' => $tournament->maxParticipants,
            'inviteToken' => $tournament->inviteToken,
            'inviteUrl' => $this->inviteUrl($tournament->inviteToken),
        ];
    }

    /** Public (no auth): what TournamentJoin.jsx shows before the visitor logs in. */
    public function joinInfo(string $token): array
    {
        $tournament = $this->findByToken($token);

        if (! $tournament) {
            throw self::error('Enlace de invitación inválido o expirado', 404);
        }

        return [
            'id' => $tournament->id,
            'name' => $tournament->name,
            'description' => $tournament->description,
            'structure' => $tournament->structure,
            'pairingSystem' => $tournament->pairingSystem,
            'matchFormat' => $tournament->matchFormat,
            'startDate' => $tournament->startDate,
            'endDate' => $tournament->endDate,
            'status' => $tournament->status,
            'maxParticipants' => $tournament->maxParticipants,
            'allowInvitations' => (bool) $tournament->allowInvitations,
            '_count' => ['participants' => TournamentParticipant::where('tournamentId', $tournament->id)->count()],
        ];
    }

    public function join(string $token, User $user): array
    {
        $player = Player::where('userId', $user->id)->first();

        if (! $player) {
            throw self::error('Jugador no encontrado', 404);
        }

        $participant = DB::transaction(function () use ($token, $player) {
            $tournament = TournamentInstance::where('inviteToken', $token)
                ->where('allowInvitations', true)
                ->lockForUpdate()
                ->first();

            if (! $tournament) {
                throw self::error('Enlace de invitación inválido', 404);
            }

            if ($tournament->status !== 'draft') {
                throw self::error('Este torneo ya no acepta nuevas inscripciones', 400);
            }

            if (TournamentParticipant::where('tournamentId', $tournament->id)->where('playerId', $player->id)->exists()) {
                throw self::error('Ya estás inscrito en este torneo', 400, ['alreadyJoined' => true]);
            }

            if ($tournament->maxParticipants
                && TournamentParticipant::where('tournamentId', $tournament->id)->count() >= $tournament->maxParticipants) {
                throw self::error('El torneo ha alcanzado el cupo máximo', 400, ['full' => true]);
            }

            $participant = TournamentParticipant::create([
                'tournamentId' => $tournament->id,
                'playerId' => $player->id,
            ]);

            \App\Models\TournamentLog::create([
                'tournamentId' => $tournament->id,
                'userId' => $player->userId,
                'playerName' => $player->name,
                'action' => 'participant_joined',
                'detail' => "{$player->name} se inscribió por invitación.",
            ]);

            return $participant->setRelation('tournament', $tournament);
        });

        $tournament = $participant->tournament;

        // Let whoever runs the tournament know someone signed up.
        if ($tournament->responsableId && $tournament->responsableId !== $user->id) {
            $this->notifications->create(
                $tournament->responsableId,
                'tournament_joined',
                'Nueva inscripción',
                "{$player->name} se inscribió en \"{$tournament->name}\".",
                "/tournaments/{$tournament->id}",
            );
        }

        return ['message' => '¡Inscripción completada!', 'participant' => $participant->load('player')];
    }

    protected function findByToken(string $token): ?TournamentInstance
    {
        if ($token === '' || Str::length($token) < 16) {
            return null;
        }

        return TournamentInstance::where('inviteToken', $token)->where('allowInvitations', true)->first();
    }
}
