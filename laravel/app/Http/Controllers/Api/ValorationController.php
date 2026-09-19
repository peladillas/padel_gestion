<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Player;
use App\Services\ValorationService;
use Illuminate\Http\Request;

/**
 * New build (see App\Services\ValorationService docblock for the rules)
 * — not a port of the old valorations.routes.js, which also handled the
 * classic Match table and a 24h window.
 */
class ValorationController extends Controller
{
    public function __construct(protected ValorationService $valorations) {}

    protected function myPlayer(Request $request): Player
    {
        $player = Player::where('userId', $request->user()->id)->first();

        if (! $player) {
            throw new ApiException('Jugador no encontrado', 404);
        }

        return $player;
    }

    public function pending(Request $request)
    {
        return response()->json($this->valorations->pending($this->myPlayer($request)));
    }

    public function store(Request $request)
    {
        return response()->json($this->valorations->create($this->myPlayer($request), $request->all()));
    }

    public function received(Request $request)
    {
        return response()->json($this->valorations->received($this->myPlayer($request)->id));
    }

    public function stats(Request $request, string $playerId)
    {
        return response()->json($this->valorations->statsForPlayer($playerId));
    }

    public function evolution(Request $request, string $playerId)
    {
        return response()->json($this->valorations->evolution($playerId));
    }
}
