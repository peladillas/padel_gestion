<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Club;
use App\Services\ClubDirectoryService;
use App\Services\ClubService;
use App\Services\CourtService;
use App\Support\ClubProfileRules;
use Illuminate\Http\Request;

/**
 * Thin controller mirroring backend/src/api/routes/clubs.routes.js.
 */
class ClubController extends Controller
{
    /** Everything a court's create/edit form may send. */
    protected const COURT_FIELDS = ['name', 'alias', 'isActive', 'material', 'floor', 'walls', 'orientation', 'setting', 'status', 'hasLighting', 'notes'];

    public function __construct(
        protected ClubService $clubs,
        protected CourtService $courts,
        protected ClubDirectoryService $directory,
    ) {}

    public function publicList()
    {
        return response()->json(
            Club::orderBy('name')->get(['id', 'name', 'slug', 'description', 'logoUrl', 'services'])
        );
    }

    /**
     * The club directory, open to every logged-in role: search, filter by
     * services / city / open days / open now / distance / courts / price, sort
     * and paginate. See ClubDirectoryService for the query parameters.
     */
    public function directory(Request $request)
    {
        return response()->json($this->directory->search($request->query()));
    }

    /** One club's card (same shape as a directory entry); pass lat/lng to get its distance. */
    public function card(Request $request, string $id)
    {
        $origin = is_numeric($request->query('lat')) && is_numeric($request->query('lng'))
            ? ['lat' => (float) $request->query('lat'), 'lng' => (float) $request->query('lng')]
            : null;

        return response()->json($this->directory->find($id, $origin));
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
        return response()->json($this->clubs->update($id, $request->only(array_merge(['name', 'slug'], ClubProfileRules::FIELDS))));
    }

    /** Catalogue of services a club can declare (public data, same for everyone). */
    public function serviceCatalog()
    {
        return response()->json(\App\Support\ClubServiceCatalog::toArray());
    }

    /** Description + services: editable by the club's own admin (or a super admin). */
    public function updateProfile(Request $request, string $id)
    {
        $this->clubs->assertCanManage($request->user(), $id);

        return response()->json($this->clubs->updateProfile($id, $request->only(ClubProfileRules::FIELDS)));
    }

    public function uploadLogo(Request $request, string $id)
    {
        $this->clubs->assertCanManage($request->user(), $id);

        return response()->json($this->clubs->setLogo($id, $request->file('logo')));
    }

    public function deleteLogo(Request $request, string $id)
    {
        $this->clubs->assertCanManage($request->user(), $id);

        return response()->json($this->clubs->removeLogo($id));
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

    public function courtsIndex(Request $request, string $id)
    {
        $this->clubs->assertCanManage($request->user(), $id);

        return response()->json($this->courts->list($id));
    }

    public function courtsStore(Request $request, string $id)
    {
        $this->clubs->assertCanManage($request->user(), $id);

        return response()->json($this->courts->create($id, $request->only(self::COURT_FIELDS)), 201);
    }

    public function courtsUpdate(Request $request, string $id, string $courtId)
    {
        $this->clubs->assertCanManage($request->user(), $id);

        return response()->json($this->courts->update($courtId, $id, $request->only(self::COURT_FIELDS)));
    }

    public function courtsDestroy(Request $request, string $id, string $courtId)
    {
        $this->clubs->assertCanManage($request->user(), $id);
        $this->courts->remove($courtId, $id);

        return response()->json(['message' => 'Pista eliminada']);
    }
}
