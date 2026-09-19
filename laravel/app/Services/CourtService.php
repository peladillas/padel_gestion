<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Court;
use App\Models\TournamentCourt;
use App\Support\CourtRules;
use Illuminate\Support\Facades\DB;

/**
 * A club's courts (with their physical description and operational status) and
 * the courts a tournament plays on. The court CRUD started as a port of
 * backend/src/services/CourtService.js.
 */
class CourtService
{
    public const BULK_MAX = 30;

    protected static function error(string $message, int $status): ApiException
    {
        return new ApiException($message, $status);
    }

    /** @return array<int, Court> operational first, then by name in natural order ("Pista 2" before "Pista 10") */
    public function list(string $clubId): array
    {
        return Court::where('clubId', $clubId)
            ->get()
            ->sortBy([
                fn ($a, $b) => (int) $b->isActive <=> (int) $a->isActive,
                fn ($a, $b) => strnatcasecmp($a->name, $b->name),
            ])
            ->values()
            ->all();
    }

    protected function assertNameFree(string $clubId, string $name, ?string $exceptCourtId = null): void
    {
        $taken = Court::where('clubId', $clubId)->where('name', $name)
            ->when($exceptCourtId, fn ($q) => $q->where('id', '!=', $exceptCourtId))
            ->exists();

        if ($taken) {
            throw self::error('Ya existe una pista con ese nombre en este club', 409);
        }
    }

    public function create(string $clubId, array $data): Court
    {
        $clean = CourtRules::clean($data);

        if (empty($clean['name'])) {
            throw self::error('El nombre es requerido', 400);
        }

        $this->assertNameFree($clubId, $clean['name']);

        return Court::create(array_merge(
            ['clubId' => $clubId, 'status' => 'operational', 'isActive' => true, 'hasLighting' => false],
            $clean,
        ));
    }

    /**
     * "Define how many courts": creates `count` courts named "<prefix> <n>"
     * that share the same characteristics (floor, walls, orientation…).
     * Names already taken are skipped, never duplicated or overwritten.
     *
     * @return array<int, Court>
     */
    public function createMany(string $clubId, array $data): array
    {
        $count = $data['count'] ?? null;

        if (! is_numeric($count) || (int) $count != $count || $count < 1 || $count > self::BULK_MAX) {
            throw self::error('count debe ser un número entero de 1 a '.self::BULK_MAX, 400);
        }

        $prefix = trim((string) ($data['namePrefix'] ?? 'Pista'));

        if ($prefix === '' || mb_strlen($prefix) > 50) {
            throw self::error('El prefijo del nombre es obligatorio (máx. 50 caracteres)', 400);
        }

        $number = max((int) ($data['startNumber'] ?? 1), 1);
        $template = CourtRules::clean(array_intersect_key($data, array_flip(CourtRules::TEMPLATE_FIELDS)));

        return DB::transaction(function () use ($clubId, $count, $prefix, $number, $template) {
            $existing = Court::where('clubId', $clubId)->pluck('name')->flip();
            $created = [];

            while (count($created) < (int) $count) {
                $name = "{$prefix} {$number}";
                $number++;

                if ($existing->has($name)) {
                    continue;
                }

                $created[] = Court::create(array_merge(
                    ['clubId' => $clubId, 'status' => 'operational', 'isActive' => true, 'hasLighting' => false],
                    $template,
                    ['name' => $name],
                ));
            }

            return $created;
        });
    }

    public function update(string $courtId, string $clubId, array $data): Court
    {
        $court = Court::where('id', $courtId)->where('clubId', $clubId)->first();

        if (! $court) {
            throw self::error('Pista no encontrada', 404);
        }

        $clean = CourtRules::clean($data);

        if (isset($clean['name']) && $clean['name'] !== $court->name) {
            $this->assertNameFree($clubId, $clean['name'], $court->id);
        }

        $court->fill($clean)->save();

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
