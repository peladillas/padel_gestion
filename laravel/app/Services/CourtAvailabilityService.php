<?php

namespace App\Services;

use App\Models\Club;
use App\Models\Court;
use App\Models\CourtBlock;
use App\Support\ClubProfileRules;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Can this court be used between two instants? THE place where a club's
 * restrictions are combined, so reservations (when they exist) ask one
 * question instead of re-implementing the rules:
 *
 *   court_not_operational — the court is in maintenance or out of service;
 *   blocked               — a block on the court's calendar overlaps the slot;
 *   outside_opening_hours — the club publishes opening hours and the slot does
 *                           not fit inside one (a club with no published hours
 *                           is not restricted: unknown ≠ closed).
 *
 * Periods are half-open [start, end): a slot that ends exactly when a block
 * starts, or starts exactly when one ends, does not overlap it.
 */
class CourtAvailabilityService
{
    public const MAX_SLOT_HOURS = 168;   // one week

    /**
     * @return array{courtId: string, available: bool, reasons: array<int, string>, blockIds: array<int, string>}
     */
    public function check(Court $court, Club $club, CarbonInterface $start, CarbonInterface $end, ?Collection $courtBlocks = null): array
    {
        $blocks = $courtBlocks ?? CourtBlock::where('courtId', $court->id)
            ->where('startsAt', '<', $end->copy()->utc())->where('endsAt', '>', $start->copy()->utc())->get();

        $reasons = [];

        if ($court->status !== 'operational') {
            $reasons[] = 'court_not_operational';
        }

        if ($blocks->isNotEmpty()) {
            $reasons[] = 'blocked';
        }

        if (! $this->insideOpeningHours($club, $start, $end)) {
            $reasons[] = 'outside_opening_hours';
        }

        return [
            'courtId' => $court->id,
            'available' => $reasons === [],
            'reasons' => $reasons,
            'blockIds' => $blocks->pluck('id')->all(),
        ];
    }

    /**
     * Every court of the club, with its answer for the slot (natural name order).
     *
     * @return array<int, array{courtId: string, name: string, alias: ?string, available: bool, reasons: array<int, string>, blockIds: array<int, string>}>
     */
    public function forClub(Club $club, CarbonInterface $start, CarbonInterface $end): array
    {
        $blocks = CourtBlock::where('clubId', $club->id)
            ->where('startsAt', '<', $end->copy()->utc())->where('endsAt', '>', $start->copy()->utc())
            ->get()->groupBy('courtId');

        return Court::where('clubId', $club->id)->get()
            ->sortBy(fn (Court $c) => $c->name, SORT_NATURAL | SORT_FLAG_CASE)
            ->map(fn (Court $c) => ['name' => $c->name, 'alias' => $c->alias] + $this->check($c, $club, $start, $end, $blocks->get($c->id, collect())))
            ->values()
            ->all();
    }

    /** True when the slot fits inside the club's published opening hours (or none are published). */
    public function insideOpeningHours(Club $club, CarbonInterface $start, CarbonInterface $end): bool
    {
        $hours = $club->openingHours;

        if (empty($hours) || ! array_filter($hours)) {
            return true;
        }

        $tz = CourtBlockService::zone($club);
        $day = $start->copy()->setTimezone($tz)->startOfDay()->subDay();   // yesterday: its late opening may still be running
        $lastDay = $end->copy()->setTimezone($tz)->startOfDay();
        $windows = [];

        for (; $day <= $lastDay; $day = $day->copy()->addDay()) {
            $interval = $hours[ClubProfileRules::DAYS[$day->dayOfWeekIso - 1]] ?? null;

            if (! $interval) {
                continue;
            }

            $open = $day->copy()->setTimeFromTimeString($interval['open']);
            $close = $interval['close'] === '24:00'
                ? $day->copy()->addDay()->startOfDay()
                : $day->copy()->setTimeFromTimeString($interval['close']);

            if ($close <= $open) {
                $close = $close->addDay();   // closes after midnight
            }

            $windows[] = [$open, $close];
        }

        usort($windows, fn ($a, $b) => $a[0] <=> $b[0]);

        // Back-to-back openings (…–24:00 then 00:00–…) form one continuous window.
        $merged = [];
        foreach ($windows as [$o, $c]) {
            if ($merged && $o <= end($merged)[1]) {
                $merged[count($merged) - 1][1] = max(end($merged)[1], $c);
            } else {
                $merged[] = [$o, $c];
            }
        }

        foreach ($merged as [$o, $c]) {
            if ($o <= $start && $end <= $c) {
                return true;
            }
        }

        return false;
    }
}
