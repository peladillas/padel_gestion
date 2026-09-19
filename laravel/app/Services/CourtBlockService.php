<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Club;
use App\Models\Court;
use App\Models\CourtBlock;
use App\Models\User;
use App\Support\CourtCatalog;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The calendar of court blocks: periods when a court can't be used —
 * maintenance, cleaning, works, a private event… They are the restrictions
 * that reservations must respect (see CourtAvailabilityService).
 *
 * Times: the admin works in the club's own timezone. Input strings without an
 * offset ("2026-10-01T09:00") are read in that timezone; strings with an offset
 * or "Z" are taken as given. Everything is stored as UTC instants, and every
 * response also carries the club-local wall-clock strings so the UI never has
 * to do timezone maths.
 */
class CourtBlockService
{
    public const MAX_BLOCK_DAYS = 366;

    public const MAX_OCCURRENCES = 104;   // two years of weekly repetition

    public const MAX_RANGE_DAYS = 366;    // widest window one listing may ask for

    public const NOTE_MAX = 200;

    public const SCOPES = ['one', 'occurrence', 'following', 'all'];

    protected static function fail(string $message, int $status = 400): ApiException
    {
        return new ApiException($message, $status);
    }

    public static function zone(Club $club): string
    {
        return $club->timezone ?: config('bonapinta.default_timezone');
    }

    /** Reads "YYYY-MM-DD[T ]HH:MM[:SS][offset]" — in the club's timezone unless it carries an offset. */
    public static function parseInstant(mixed $value, string $tz, string $field): Carbon
    {
        if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/', trim($value))) {
            throw self::fail("{$field} debe ser una fecha y hora (AAAA-MM-DDTHH:MM)");
        }

        try {
            return Carbon::parse(trim($value), $tz);
        } catch (\Throwable) {
            throw self::fail("{$field} no es una fecha válida");
        }
    }

    protected static function parseDate(mixed $value, string $tz, string $field): Carbon
    {
        if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', trim($value))) {
            throw self::fail("{$field} debe ser una fecha (AAAA-MM-DD)");
        }

        try {
            return Carbon::createFromFormat('!Y-m-d', trim($value), $tz);
        } catch (\Throwable) {
            throw self::fail("{$field} no es una fecha válida");
        }
    }

    /** @return array<string, mixed> */
    public function serialize(CourtBlock $b, string $tz, ?string $courtName = null, ?int $groupCount = null): array
    {
        $local = fn (CarbonInterface $t) => $t->copy()->setTimezone($tz)->format('Y-m-d\TH:i');

        return [
            'id' => $b->id,
            'clubId' => $b->clubId,
            'courtId' => $b->courtId,
            'courtName' => $courtName ?? $b->court?->name,
            'startsAt' => $b->startsAt->copy()->utc()->toIso8601String(),
            'endsAt' => $b->endsAt->copy()->utc()->toIso8601String(),
            'startLocal' => $local($b->startsAt),
            'endLocal' => $local($b->endsAt),
            'timezone' => $tz,
            'reason' => $b->reason,
            'reasonLabel' => CourtCatalog::label('reason', $b->reason),
            'note' => $b->note,
            'groupId' => $b->groupId,
            'groupCount' => $groupCount,
        ];
    }

    /**
     * Blocks overlapping [from, to] (club-local dates, inclusive). Defaults to
     * today + 60 days.
     *
     * @return array{timezone: string, from: string, to: string, blocks: array<int, array>}
     */
    public function list(Club $club, ?string $from = null, ?string $to = null, ?string $courtId = null): array
    {
        $tz = self::zone($club);
        $start = $from ? self::parseDate($from, $tz, 'from') : Carbon::now($tz)->startOfDay();
        $end = $to ? self::parseDate($to, $tz, 'to') : $start->copy()->addDays(59);

        if ($end < $start) {
            throw self::fail('to no puede ser anterior a from');
        }

        if ($start->diffInDays($end) > self::MAX_RANGE_DAYS) {
            throw self::fail('El rango máximo es de '.self::MAX_RANGE_DAYS.' días');
        }

        $rangeEnd = $end->copy()->addDay()->startOfDay();

        $blocks = CourtBlock::with('court:id,name')
            ->where('clubId', $club->id)
            ->where('startsAt', '<', $rangeEnd->copy()->utc())
            ->where('endsAt', '>', $start->copy()->utc())
            ->when($courtId, fn ($q) => $q->where('courtId', $courtId))
            ->orderBy('startsAt')
            ->get();

        $groupIds = $blocks->pluck('groupId')->filter()->unique();
        $counts = $groupIds->isEmpty() ? collect() : CourtBlock::whereIn('groupId', $groupIds)->selectRaw('"groupId", count(*) as n')->groupBy('groupId')->pluck('n', 'groupId');

        return [
            'timezone' => $tz,
            'from' => $start->format('Y-m-d'),
            'to' => $end->format('Y-m-d'),
            'blocks' => $blocks->map(fn (CourtBlock $b) => $this->serialize($b, $tz, null, $b->groupId ? (int) ($counts[$b->groupId] ?? 1) : null))->all(),
        ];
    }

    protected function assertReason(mixed $reason): string
    {
        if (! is_string($reason) || ! array_key_exists($reason, CourtCatalog::BLOCK_REASONS)) {
            throw self::fail('Motivo no válido (usa uno del catálogo)');
        }

        return $reason;
    }

    protected function cleanNote(mixed $note): ?string
    {
        $text = is_array($note) ? '' : trim((string) $note);

        if (mb_strlen($text) > self::NOTE_MAX) {
            throw self::fail('La nota admite hasta '.self::NOTE_MAX.' caracteres');
        }

        return $text === '' ? null : $text;
    }

    /** @return array{0: Carbon, 1: Carbon} */
    protected function period(mixed $startsAt, mixed $endsAt, string $tz): array
    {
        $start = self::parseInstant($startsAt, $tz, 'startsAt');
        $end = self::parseInstant($endsAt, $tz, 'endsAt');

        if ($end <= $start) {
            throw self::fail('El fin del bloqueo debe ser posterior al inicio');
        }

        if ($start->diffInDays($end) > self::MAX_BLOCK_DAYS) {
            throw self::fail('Un bloqueo no puede durar más de '.self::MAX_BLOCK_DAYS.' días');
        }

        return [$start, $end];
    }

    /**
     * Creates blocks for one or several courts ("courtIds" or "allCourts") and,
     * optionally, repeats them weekly until a date (`repeat: {type: weekly,
     * until: YYYY-MM-DD}`) — keeping the same local wall-clock time across
     * daylight-saving changes. Everything from one request shares a `groupId`,
     * so a whole series can be removed later.
     *
     * @return array<int, array>
     */
    public function create(Club $club, ?User $by, array $data): array
    {
        $tz = self::zone($club);
        $reason = $this->assertReason($data['reason'] ?? null);
        $note = $this->cleanNote($data['note'] ?? null);
        [$start, $end] = $this->period($data['startsAt'] ?? null, $data['endsAt'] ?? null, $tz);

        $clubCourts = Court::where('clubId', $club->id)->get()->keyBy('id');

        if (filter_var($data['allCourts'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            $courts = $clubCourts->values();
        } else {
            $ids = array_values(array_unique((array) ($data['courtIds'] ?? [])));
            $courts = collect($ids)->map(fn ($id) => $clubCourts->get($id));

            if (! $ids || $courts->contains(null)) {
                throw self::fail($ids ? 'Alguna pista no existe o no pertenece a este club' : 'Elige al menos una pista (courtIds) o allCourts');
            }
        }

        if ($courts->isEmpty()) {
            throw self::fail('El club no tiene pistas que bloquear');
        }

        // Weekly repetition → the list of [start, end] occurrences.
        $occurrences = [[$start, $end]];
        $repeat = $data['repeat'] ?? null;

        if ($repeat !== null && $repeat !== []) {
            if (! is_array($repeat) || ($repeat['type'] ?? null) !== 'weekly') {
                throw self::fail("repeat.type debe ser 'weekly'");
            }

            $until = self::parseDate($repeat['until'] ?? null, $tz, 'repeat.until')->endOfDay();

            if ($until < $start->copy()->startOfDay()) {
                throw self::fail('repeat.until no puede ser anterior al primer bloqueo');
            }

            $occurrences = [];
            for ($n = 0; ; $n++) {
                $s = $start->copy()->addWeeks($n);

                if ($s->copy()->startOfDay() > $until) {
                    break;
                }

                if ($n >= self::MAX_OCCURRENCES) {
                    throw self::fail('La repetición supera el máximo de '.self::MAX_OCCURRENCES.' semanas: acorta la fecha final');
                }

                $occurrences[] = [$s, $end->copy()->addWeeks($n)];
            }
        }

        $groupId = ($courts->count() > 1 || count($occurrences) > 1) ? (string) Str::uuid() : null;

        return DB::transaction(function () use ($club, $by, $courts, $occurrences, $reason, $note, $groupId, $tz) {
            $created = [];

            foreach ($occurrences as [$s, $e]) {
                foreach ($courts as $court) {
                    $created[] = CourtBlock::create([
                        'clubId' => $club->id, 'courtId' => $court->id,
                        'startsAt' => $s->copy()->utc(), 'endsAt' => $e->copy()->utc(),
                        'reason' => $reason, 'note' => $note, 'groupId' => $groupId, 'createdBy' => $by?->id,
                    ])->setRelation('court', $court);
                }
            }

            $count = count($created);

            return array_map(fn (CourtBlock $b) => $this->serialize($b, $tz, $b->court->name, $groupId ? $count : null), $created);
        });
    }

    protected function findBlock(Club $club, string $blockId): CourtBlock
    {
        $block = CourtBlock::where('clubId', $club->id)->find($blockId);

        if (! $block) {
            throw self::fail('Bloqueo no encontrado', 404);
        }

        return $block;
    }

    /** Edits ONE block (its own time, reason and note). */
    public function update(Club $club, string $blockId, array $data): array
    {
        $block = $this->findBlock($club, $blockId);
        $tz = self::zone($club);

        if (array_key_exists('reason', $data)) {
            $block->reason = $this->assertReason($data['reason']);
        }

        if (array_key_exists('note', $data)) {
            $block->note = $this->cleanNote($data['note']);
        }

        if (array_key_exists('startsAt', $data) || array_key_exists('endsAt', $data)) {
            $local = fn (CarbonInterface $t) => $t->copy()->setTimezone($tz)->format('Y-m-d\TH:i');
            [$start, $end] = $this->period($data['startsAt'] ?? $local($block->startsAt), $data['endsAt'] ?? $local($block->endsAt), $tz);
            $block->startsAt = $start->copy()->utc();
            $block->endsAt = $end->copy()->utc();
        }

        $block->save();

        return $this->serialize($block->load('court:id,name'), $tz);
    }

    /**
     * Removes a block. `scope`: one (just this court, this time), occurrence
     * (every court in the group, this time), following (this time and later, all
     * courts of the group) or all (the whole group). A block created alone has
     * no group, so every scope means "just this one".
     *
     * @return int how many blocks were deleted
     */
    public function delete(Club $club, string $blockId, string $scope = 'one'): int
    {
        if (! in_array($scope, self::SCOPES, true)) {
            throw self::fail('scope debe ser uno de: '.implode(', ', self::SCOPES));
        }

        $block = $this->findBlock($club, $blockId);

        if (! $block->groupId || $scope === 'one') {
            $block->delete();

            return 1;
        }

        $query = CourtBlock::where('clubId', $club->id)->where('groupId', $block->groupId);

        if ($scope === 'occurrence') {
            $query->where('startsAt', $block->startsAt);
        } elseif ($scope === 'following') {
            $query->where('startsAt', '>=', $block->startsAt);
        }

        return $query->delete();
    }
}
