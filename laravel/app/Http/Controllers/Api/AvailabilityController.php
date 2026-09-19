<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Player;
use App\Services\AvailabilityService;
use Illuminate\Http\Request;

/**
 * Direct port of backend/src/api/routes/availability.routes.js.
 */
class AvailabilityController extends Controller
{
    public function __construct(protected AvailabilityService $availability) {}

    public function show(Request $request)
    {
        $player = Player::where('userId', $request->user()->id)->first();

        if (! $player) {
            throw new ApiException('Jugador no encontrado', 404);
        }

        $avail = $this->availability->getByPlayer($player->id);

        return response()->json($avail ?? ['slots' => (object) []]);
    }

    public function update(Request $request)
    {
        $player = Player::where('userId', $request->user()->id)->first();

        if (! $player) {
            throw new ApiException('Jugador no encontrado', 404);
        }

        return response()->json(
            $this->availability->updateSlots($player->id, $request->input('slots', []))
        );
    }

    public function showForPlayer(string $playerId)
    {
        $avail = $this->availability->getByPlayer($playerId);

        return response()->json($avail ?? ['slots' => (object) []]);
    }
}
