<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Club;
use App\Services\ClubService;
use App\Services\CourtAvailabilityService;
use App\Services\CourtBlockService;
use App\Services\CourtService;
use App\Support\CourtCatalog;
use Illuminate\Http\Request;

/**
 * Court management inside a club: bulk creation, the block calendar and the
 * availability check. (Single-court CRUD lives in ClubController.) Every write
 * needs to be an admin of THAT club (or a super admin); the catalogue and the
 * availability answer are open to any logged-in user.
 */
class CourtController extends Controller
{
    public function __construct(
        protected ClubService $clubs,
        protected CourtService $courts,
        protected CourtBlockService $blocks,
        protected CourtAvailabilityService $availability,
    ) {}

    protected function club(string $id): Club
    {
        return Club::find($id) ?? throw new ApiException('Club no encontrado', 404);
    }

    protected function managedClub(Request $request, string $id): Club
    {
        $club = $this->club($id);
        $this->clubs->assertCanManage($request->user(), $id);

        return $club;
    }

    /** Vocabularies for court forms and labels: floor, walls, material, orientation, setting, status, block reasons. */
    public function catalog()
    {
        return response()->json(CourtCatalog::toArray());
    }

    public function bulkStore(Request $request, string $id)
    {
        $this->managedClub($request, $id);

        return response()->json($this->courts->createMany($id, $request->all()), 201);
    }

    // ── block calendar ──────────────────────────────────────────────

    public function blocksIndex(Request $request, string $id)
    {
        return response()->json($this->blocks->list(
            $this->managedClub($request, $id), $request->query('from'), $request->query('to'), $request->query('courtId'),
        ));
    }

    public function blocksStore(Request $request, string $id)
    {
        return response()->json(
            $this->blocks->create($this->managedClub($request, $id), $request->user(), $request->only(['courtIds', 'allCourts', 'startsAt', 'endsAt', 'reason', 'note', 'repeat'])),
            201,
        );
    }

    public function blocksUpdate(Request $request, string $id, string $blockId)
    {
        return response()->json($this->blocks->update(
            $this->managedClub($request, $id), $blockId, $request->only(['startsAt', 'endsAt', 'reason', 'note']),
        ));
    }

    public function blocksDestroy(Request $request, string $id, string $blockId)
    {
        $deleted = $this->blocks->delete($this->managedClub($request, $id), $blockId, (string) $request->query('scope', 'one'));

        return response()->json(['message' => 'Bloqueo eliminado', 'deleted' => $deleted]);
    }

    // ── availability (any logged-in user: this is what a booking screen asks) ──

    /**
     * Which of the club's courts can be used between `start` and `end`
     * (club-local "YYYY-MM-DDTHH:MM", or with an offset). Only WHETHER and a
     * generic reason code are returned — never the admin's notes.
     */
    public function availability(Request $request, string $id)
    {
        $club = $this->club($id);
        $tz = CourtBlockService::zone($club);
        $start = CourtBlockService::parseInstant($request->query('start'), $tz, 'start');
        $end = CourtBlockService::parseInstant($request->query('end'), $tz, 'end');

        if ($end <= $start) {
            throw new ApiException('end debe ser posterior a start', 400);
        }

        if ($start->diffInHours($end) > CourtAvailabilityService::MAX_SLOT_HOURS) {
            throw new ApiException('El tramo máximo es de '.CourtAvailabilityService::MAX_SLOT_HOURS.' horas', 400);
        }

        $courts = array_map(
            fn (array $c) => ['courtId' => $c['courtId'], 'name' => $c['name'], 'alias' => $c['alias'], 'available' => $c['available'], 'reasons' => $c['reasons']],
            $this->availability->forClub($club, $start, $end),
        );

        return response()->json([
            'clubId' => $club->id,
            'timezone' => $tz,
            'start' => $start->copy()->setTimezone($tz)->format('Y-m-d\TH:i'),
            'end' => $end->copy()->setTimezone($tz)->format('Y-m-d\TH:i'),
            'availableCount' => count(array_filter($courts, fn ($c) => $c['available'])),
            'courts' => $courts,
        ]);
    }
}
