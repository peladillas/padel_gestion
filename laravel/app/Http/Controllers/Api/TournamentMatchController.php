<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\TournamentMatch;
use App\Services\Tournament\PlayerResultService;
use App\Services\Tournament\TournamentService;
use Illuminate\Http\Request;

class TournamentMatchController extends Controller
{
    public function __construct(
        protected TournamentService $tournaments,
        protected PlayerResultService $playerResults,
    ) {}

    /** Direct result: management, or the assigned referee in 'arbitro' mode. */
    public function setResult(Request $request, string $tournamentId, string $matchId)
    {
        $tournament = $this->tournaments->getById($tournamentId);

        if (! $this->tournaments->canRegisterResult($tournament, $request->user())) {
            throw new ApiException('No autorizado para registrar resultados en este torneo', 403);
        }

        $match = TournamentMatch::where('tournamentId', $tournamentId)->find($matchId);

        if (! $match) {
            throw new ApiException('Partido no encontrado', 404);
        }

        return response()->json(
            $this->tournaments->setResult($match, $request->only(['sets', 'retired']), $request->user())
        );
    }

    protected function findManagedMatch(Request $request, string $tournamentId, string $matchId): TournamentMatch
    {
        $tournament = $this->tournaments->getById($tournamentId);
        $this->tournaments->ensureCanManage($tournament, $request->user());

        $match = TournamentMatch::where('tournamentId', $tournamentId)->find($matchId);

        if (! $match) {
            throw new ApiException('Partido no encontrado', 404);
        }

        return $match;
    }

    public function suspend(Request $request, string $tournamentId, string $matchId)
    {
        return response()->json(
            $this->tournaments->suspendMatch($this->findManagedMatch($request, $tournamentId, $matchId), $request->user())
        );
    }

    public function resume(Request $request, string $tournamentId, string $matchId)
    {
        return response()->json(
            $this->tournaments->resumeMatch($this->findManagedMatch($request, $tournamentId, $matchId), $request->user())
        );
    }

    // ── Player-proposed results (resultMode = 'jugador') ────────────────

    public function propose(Request $request, string $tournamentId, string $matchId)
    {
        if (! $request->input('sets')) {
            throw new ApiException('Faltan datos', 400);
        }

        return response()->json($this->playerResults->propose(
            $this->tournaments->getById($tournamentId), $matchId, $request->user(),
            $request->only(['sets', 'date', 'time', 'participantId']),
        ));
    }

    public function accept(Request $request, string $tournamentId, string $matchId)
    {
        return response()->json($this->playerResults->accept(
            $this->tournaments->getById($tournamentId), $matchId, $request->user(), $request->input('participantId'),
        ));
    }

    public function reject(Request $request, string $tournamentId, string $matchId)
    {
        return response()->json($this->playerResults->reject(
            $this->tournaments->getById($tournamentId), $matchId, $request->user(),
            $request->input('participantId'), $request->input('reason'),
        ));
    }
}
