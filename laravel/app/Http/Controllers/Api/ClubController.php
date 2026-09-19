<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Club;
use App\Services\ClubService;
use App\Services\CourtService;
use Illuminate\Http\Request;

/**
 * Thin controller mirroring backend/src/api/routes/clubs.routes.js.
 */
class ClubController extends Controller
{
    public function __construct(
        protected ClubService $clubs,
        protected CourtService $courts,
    ) {}

    public function publicList()
    {
        return response()->json(
            Club::orderBy('name')->get(['id', 'name', 'slug'])
        );
    }

    public function index(Request $request)
    {
        return response()->json($this->clubs->getAll($request->user()->id, $request->user()->role));
    }

    public function store(Request $request)
    {
        return response()->json($this->clubs->create($request->only(['name', 'slug', 'description'])), 201);
    }

    public function show(string $id)
    {
        $club = $this->clubs->getById($id);

        if (! $club) {
            throw new ApiException('Club no encontrado', 404);
        }

        return response()->json($club);
    }

    public function update(Request $request, string $id)
    {
        return response()->json($this->clubs->update($id, $request->only(['name', 'slug', 'description', 'logoUrl'])));
    }

    public function destroy(string $id)
    {
        $this->clubs->deleteClub($id);

        return response()->json(['message' => 'Club eliminado']);
    }

    public function storeAdmin(Request $request, string $id)
    {
        $data = $request->only(['name', 'email', 'password', 'username']);

        if (! $data['name'] || ! $data['email'] || ! $data['password']) {
            throw new ApiException('Nombre, email y contraseña son requeridos', 400);
        }

        return response()->json($this->clubs->createClubAdmin($id, $data), 201);
    }

    public function updateAdmin(Request $request, string $id, string $playerId)
    {
        return response()->json($this->clubs->updateClubAdmin(
            $id, $playerId, $request->only(['name', 'email', 'username', 'password'])
        ));
    }

    public function destroyAdmin(string $id, string $playerId)
    {
        $this->clubs->removeClubAdmin($id, $playerId);

        return response()->json(['message' => 'Admin eliminado']);
    }

    public function updateTournamentTypes(Request $request, string $id)
    {
        $club = Club::findOrFail($id);
        $club->allowedStructures = $request->input('allowedStructures');
        $club->allowedPairingSystems = $request->input('allowedPairingSystems');
        $club->save();

        return response()->json(\Illuminate\Support\Arr::only(
            $club->toArray(), ['id', 'allowedStructures', 'allowedPairingSystems']
        ));
    }

    public function courtsIndex(string $id)
    {
        return response()->json($this->courts->list($id));
    }

    public function courtsStore(Request $request, string $id)
    {
        return response()->json($this->courts->create($id, $request->only(['name', 'alias'])), 201);
    }

    public function courtsUpdate(Request $request, string $id, string $courtId)
    {
        return response()->json($this->courts->update($courtId, $id, $request->only(['name', 'alias', 'isActive'])));
    }

    public function courtsDestroy(string $id, string $courtId)
    {
        $this->courts->remove($courtId, $id);

        return response()->json(['message' => 'Pista eliminada']);
    }
}
