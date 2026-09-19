<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TournamentInstance;
use App\Exceptions\ApiException;
use App\Services\CourtService;
use App\Services\Tournament\PairRequestService;
use App\Services\Tournament\TournamentInvitationService;
use App\Services\Tournament\TournamentService;
use Illuminate\Http\Request;

/**
 * New tournament-instance controller built on the configurable engine —
 * not a port of the old tournament-instances.routes.js (38 endpoints
 * tied to the retired Strategy Registry). Scope here is the MVP
 * lifecycle: create, enroll, pair, generate rounds, register results,
 * view standings.
 */
class TournamentInstanceController extends Controller
{
    public function __construct(
        protected TournamentService $tournaments,
        protected TournamentInvitationService $invitations,
        protected PairRequestService $pairRequests,
        protected CourtService $courts,
    ) {}

    /** Loads the tournament and requires the caller to be allowed to manage it. */
    protected function managed(Request $request, string $id): TournamentInstance
    {
        $tournament = $this->tournaments->getById($id);
        $this->tournaments->ensureCanManage($tournament, $request->user());

        return $tournament;
    }

    public function index(Request $request)
    {
        return response()->json($this->tournaments->getAllForUser($request->user()));
    }

    public function store(Request $request)
    {
        $tournament = $this->tournaments->create($request->user(), $request->only([
            'name', 'description', 'typeKey', 'config', 'pairingMode', 'matchFormat', 'startDate', 'endDate',
            'responsableId', 'resultMode', 'arbitroId', 'allowInvitations', 'maxParticipants', 'visibility', 'clubId', 'bestOf',
        ]));

        return response()->json($tournament, 201);
    }

    public function show(string $id)
    {
        $tournament = $this->tournaments->getById($id);

        return response()->json(array_merge($tournament->toArray(), [
            'arbitro' => $this->tournaments->arbitroSummary($tournament),
        ]));
    }

    /**
     * Registered ahead of GET /{id} in routes/api/tournaments.php — a
     * literal-segment route registered after a same-method `{id}`
     * route never gets a chance to match (Laravel/Postgres would try
     * to cast "my-matches" to a uuid and 500 instead of 404ing), so the
     * ordering there matters as much as this method existing at all.
     */
    public function myMatches(Request $request)
    {
        return response()->json($this->tournaments->myMatches($request->user()));
    }

    public function update(Request $request, string $id)
    {
        $tournament = $this->tournaments->getById($id);
        $this->tournaments->ensureCanManage($tournament, $request->user());

        return response()->json($this->tournaments->update($tournament, $request->only([
            'name', 'description', 'startDate', 'endDate', 'maxParticipants',
            'visibility', 'responsableId', 'config', 'bestOf',
        ]), $request->user()));
    }

    public function destroy(Request $request, string $id)
    {
        $tournament = $this->tournaments->getById($id);
        $this->tournaments->ensureCanManage($tournament, $request->user());
        $this->tournaments->delete($tournament, $request->boolean('confirmed'));

        return response()->json(['message' => 'Torneo eliminado']);
    }

    public function addParticipant(Request $request, string $id)
    {
        $tournament = $this->tournaments->getById($id);
        $this->tournaments->ensureCanManage($tournament, $request->user());

        return response()->json(
            $this->tournaments->addParticipant($tournament, $request->only(['playerId', 'teamName', 'seed']), $request->user()),
            201
        );
    }

    public function removeParticipant(Request $request, string $id, string $participantId)
    {
        $tournament = $this->tournaments->getById($id);
        $this->tournaments->ensureCanManage($tournament, $request->user());
        $this->tournaments->removeParticipant($tournament, $participantId, $request->user());

        return response()->json(['message' => 'Participante eliminado']);
    }

    public function pair(Request $request, string $id)
    {
        $tournament = $this->tournaments->getById($id);
        $this->tournaments->ensureCanManage($tournament, $request->user());
        $this->tournaments->pairParticipants($tournament, $request->input('participantId1'), $request->input('participantId2'), $request->user());

        return response()->json(['message' => 'Pareja formada']);
    }

    public function unpair(Request $request, string $id)
    {
        $tournament = $this->tournaments->getById($id);
        $this->tournaments->ensureCanManage($tournament, $request->user());
        $this->tournaments->unpairParticipant($tournament, $request->input('participantId'), $request->user());

        return response()->json(['message' => 'Pareja deshecha']);
    }

    public function autoPair(Request $request, string $id)
    {
        $tournament = $this->tournaments->getById($id);
        $this->tournaments->ensureCanManage($tournament, $request->user());

        return response()->json($this->tournaments->autoPairParticipants($tournament, $request->user()));
    }

    public function setSubstitute(Request $request, string $id, string $participantId)
    {
        $tournament = $this->tournaments->getById($id);
        $this->tournaments->ensureCanManage($tournament, $request->user());

        $updated = $this->tournaments->setSubstitute(
            $tournament,
            $participantId,
            $request->input('substitutePlayerId'),
            $request->input('absenceReason'),
            $request->input('absenceNote'),
            $request->user(),
        );

        return response()->json($updated);
    }

    public function start(Request $request, string $id)
    {
        $tournament = $this->tournaments->getById($id);
        $this->tournaments->ensureCanManage($tournament, $request->user());

        return response()->json($this->tournaments->startTournament($tournament, $request->user()));
    }

    public function generateRound(Request $request, string $id)
    {
        $tournament = $this->tournaments->getById($id);
        $this->tournaments->ensureCanManage($tournament, $request->user());

        $matches = $this->tournaments->generateRound($tournament, $request->user());

        return response()->json(['message' => "{$matches->count()} partidos generados", 'count' => $matches->count(), 'matches' => $matches]);
    }

    public function standings(string $id)
    {
        $tournament = $this->tournaments->getById($id);

        return response()->json(array_merge(['tournament' => $tournament], $this->tournaments->standings($tournament)));
    }

    public function logs(string $id)
    {
        $tournament = $this->tournaments->getById($id);

        return response()->json($this->tournaments->logs($tournament));
    }

    public function suspend(Request $request, string $id)
    {
        $tournament = $this->tournaments->getById($id);
        $this->tournaments->ensureCanManage($tournament, $request->user());

        return response()->json($this->tournaments->suspendTournament($tournament, $request->user()));
    }

    public function resume(Request $request, string $id)
    {
        $tournament = $this->tournaments->getById($id);
        $this->tournaments->ensureCanManage($tournament, $request->user());

        return response()->json($this->tournaments->resumeTournament($tournament, $request->user()));
    }

    // ── Invitations (self-enrolment by link) ────────────────────────────

    /** Public — TournamentJoin.jsx shows this before the visitor logs in. */
    public function joinInfo(string $token)
    {
        return response()->json($this->invitations->joinInfo($token));
    }

    public function join(Request $request, string $token)
    {
        return response()->json($this->invitations->join($token, $request->user()), 201);
    }

    public function generateInvite(Request $request, string $id)
    {
        return response()->json($this->invitations->generate(
            $this->managed($request, $id),
            $request->only(['allowInvitations', 'maxParticipants']),
        ));
    }

    public function updateInvite(Request $request, string $id)
    {
        return response()->json($this->invitations->updateSettings(
            $this->managed($request, $id),
            $request->only(['allowInvitations', 'maxParticipants']),
        ));
    }

    // ── Player-driven pairing ───────────────────────────────────────────

    public function sendPairRequest(Request $request, string $id)
    {
        $toPlayerId = $request->input('toPlayerId');

        if (! $toPlayerId) {
            throw new ApiException('toPlayerId requerido', 400);
        }

        $this->pairRequests->send($this->tournaments->getById($id), $toPlayerId, $request->user());

        return response()->json(['message' => 'Solicitud enviada']);
    }

    public function acceptPairRequest(Request $request, string $id)
    {
        $fromPlayerId = $request->input('fromPlayerId');

        if (! $fromPlayerId) {
            throw new ApiException('fromPlayerId requerido', 400);
        }

        $this->pairRequests->accept($this->tournaments->getById($id), $fromPlayerId, $request->user());

        return response()->json(['message' => 'Pareja confirmada']);
    }

    public function rejectPairRequest(Request $request, string $id)
    {
        $fromPlayerId = $request->input('fromPlayerId');

        if (! $fromPlayerId) {
            throw new ApiException('fromPlayerId requerido', 400);
        }

        $this->pairRequests->reject($this->tournaments->getById($id), $fromPlayerId, $request->user());

        return response()->json(['message' => 'Solicitud rechazada']);
    }

    public function cancelPairRequest(Request $request, string $id)
    {
        $this->pairRequests->cancel($this->tournaments->getById($id), $request->user());

        return response()->json(['message' => 'Solicitud cancelada']);
    }

    // ── Lifecycle / settings ────────────────────────────────────────────

    public function reset(Request $request, string $id)
    {
        $tournament = $this->tournaments->reset($this->managed($request, $id), $request->boolean('keepPlayers', true), $request->user());

        return response()->json(['message' => 'Torneo reiniciado', 'tournament' => $tournament]);
    }

    public function archive(Request $request, string $id)
    {
        return response()->json($this->tournaments->toggleArchive($this->managed($request, $id), $request->user()));
    }

    public function updateResultMode(Request $request, string $id)
    {
        $resultMode = $request->input('resultMode');

        if (! $resultMode) {
            throw new ApiException('resultMode requerido', 400);
        }

        return response()->json($this->tournaments->updateResultMode(
            $this->managed($request, $id), $resultMode, $request->input('arbitroId'), $request->user(),
        ));
    }

    public function updateMaxParticipants(Request $request, string $id)
    {
        $max = $request->input('maxParticipants');

        $updated = $this->tournaments->updateMaxParticipants(
            $this->managed($request, $id),
            $max === null || $max === '' ? null : (int) $max,
            (array) $request->input('participantsToRemove', []),
            $request->user(),
        );

        return response()->json(['maxParticipants' => $updated->maxParticipants, 'status' => $updated->status]);
    }

    public function getCourts(Request $request, string $id)
    {
        $this->managed($request, $id);

        return response()->json($this->courts->getTournamentCourts($id));
    }

    public function setCourts(Request $request, string $id)
    {
        $tournament = $this->managed($request, $id);

        return response()->json($this->courts->setTournamentCourts($id, (array) $request->input('courtIds', []), $tournament->clubId));
    }
}
