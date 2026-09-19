<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Court;
use App\Models\TournamentCourt;
use Illuminate\Support\Facades\DB;

/**
 * Direct port of backend/src/services/CourtService.js.
 */
class CourtService
{
    protected static function error(string $message, int $status): ApiException
    {
        return new ApiException($message, $status);
    }

    /** @return array<int, Court> */
    public function list(string $clubId): array
    {
        return Court::where('clubId', $clubId)
            ->orderByDesc('isActive')
            ->orderBy('name')
            ->get()
            ->all();
    }

    public function create(string $clubId, array $data): Court
    {
        $name = trim($data['name'] ?? '');

        if (! $name) {
            throw self::error('El nombre es requerido', 400);
        }

        $existing = Court::where('clubId', $clubId)->where('name', $name)->first();

        if ($existing) {
            throw self::error('Ya existe una pista con ese nombre en este club', 409);
        }

        return Court::create([
            'clubId' => $clubId,
            'name' => $name,
            'alias' => trim($data['alias'] ?? '') ?: null,
        ]);
    }

    public function update(string $courtId, string $clubId, array $data): Court
    {
        $court = Court::where('id', $courtId)->where('clubId', $clubId)->first();

        if (! $court) {
            throw self::error('Pista no encontrada', 404);
        }

        $name = isset($data['name']) ? trim($data['name']) : null;

        if ($name && $name !== $court->name) {
            $dup = Court::where('clubId', $clubId)->where('name', $name)->first();

            if ($dup) {
                throw self::error('Ya existe una pista con ese nombre en este club', 409);
            }
        }

        if (array_key_exists('name', $data)) {
            $court->name = $name;
        }

        if (array_key_exists('alias', $data)) {
            $court->alias = trim($data['alias'] ?? '') ?: null;
        }

        if (array_key_exists('isActive', $data)) {
            $court->isActive = (bool) $data['isActive'];
        }

        $court->save();

        return $court;
    }

    public function remove(string $courtId, string $clubId): void
    {
        $court = Court::where('id', $courtId)->where('clubId', $clubId)->first();

        if (! $court) {
            throw self::error('Pista no encontrada', 404);
        }

        $court->delete();
    }

    /** @return array<int, Court> */
    public function getTournamentCourts(string $tournamentId): array
    {
        return TournamentCourt::where('tournamentId', $tournamentId)
            ->orderBy('displayOrder')
            ->with('court')
            ->get()
            ->map(fn ($entry) => $entry->court)
            ->all();
    }

    /** @param array<int, string> $courtIds */
    public function setTournamentCourts(string $tournamentId, array $courtIds = [], ?string $clubId = null): array
    {
        $courtIds = array_values(array_unique(array_filter($courtIds)));

        if ($courtIds) {
            $valid = Court::whereIn('id', $courtIds)
                ->when($clubId, fn ($q) => $q->where('clubId', $clubId))
                ->count();

            if ($valid !== count($courtIds)) {
                throw self::error('Alguna pista no existe o no pertenece al club del torneo', 400);
            }
        }

        DB::transaction(function () use ($tournamentId, $courtIds) {
            TournamentCourt::where('tournamentId', $tournamentId)->delete();

            foreach (array_values($courtIds) as $i => $courtId) {
                TournamentCourt::create([
                    'tournamentId' => $tournamentId,
                    'courtId' => $courtId,
                    'displayOrder' => $i,
                ]);
            }
        });

        return $this->getTournamentCourts($tournamentId);
    }
}
