<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Club;
use App\Support\ClubProfileRules;
use App\Support\ClubServiceCatalog;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * The club directory every logged-in role can browse: free-text search,
 * filters (services, city, open days, open now, distance, courts, price) and
 * sorting, returning "card-ready" clubs (only public data — never the
 * internal allow-lists).
 *
 * Filtering and sorting run in PHP over the loaded clubs on purpose: search
 * must ignore accents ("padel" finds "Pádel"), "open now" depends on each
 * club's own timezone and distance is computed per user, none of which map
 * cleanly to a portable SQL query. A directory of clubs is small (hundreds);
 * if it ever reaches many thousands, distance/services/city would move to SQL.
 */
class ClubDirectoryService
{
    public const SORTS = ['name', 'distance', 'courts', 'price', 'services'];

    public const DEFAULT_PER_PAGE = 12;

    public const MAX_PER_PAGE = 50;

    protected static function fail(string $message): ApiException
    {
        return new ApiException($message, 400);
    }

    /** "Pádel Ñoño" → "padel nono" for accent- and case-insensitive matching. */
    protected static function fold(?string $text): string
    {
        return Str::lower(Str::ascii((string) $text));
    }

    /** @return array<int, string> */
    protected static function list(mixed $value): array
    {
        $items = is_array($value) ? $value : explode(',', (string) $value);

        return array_values(array_unique(array_filter(array_map(fn ($v) => trim((string) $v), $items), fn ($v) => $v !== '')));
    }

    protected static function number(array $q, string $key, ?float $min = null, ?float $max = null): ?float
    {
        if (! isset($q[$key]) || $q[$key] === '') {
            return null;
        }

        if (! is_numeric($q[$key])) {
            throw self::fail("{$key} debe ser un número");
        }

        $n = (float) $q[$key];

        if (($min !== null && $n < $min) || ($max !== null && $n > $max)) {
            throw self::fail("{$key} fuera de rango");
        }

        return $n;
    }

    /** Great-circle distance in km (haversine). */
    public static function distanceKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $rad = M_PI / 180;
        $dLat = ($lat2 - $lat1) * $rad;
        $dLng = ($lng2 - $lng1) * $rad;
        $a = sin($dLat / 2) ** 2 + cos($lat1 * $rad) * cos($lat2 * $rad) * sin($dLng / 2) ** 2;

        return 6371.0088 * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    /**
     * Is the club open at $now, in the club's own timezone?
     * null = it has not published opening hours (unknown, not "closed").
     *
     * @return array{isOpen: bool, closesAt: ?string, today: ?array}|null
     */
    public static function openStatus(Club $club, CarbonInterface $now): ?array
    {
        $hours = $club->openingHours;

        if (empty($hours)) {
            return null;
        }

        $local = $now->copy()->setTimezone($club->timezone ?: config('bonapinta.default_timezone'));
        $todayKey = ClubProfileRules::DAYS[$local->dayOfWeekIso - 1];
        $yesterdayKey = ClubProfileRules::DAYS[($local->dayOfWeekIso + 5) % 7];
        $minutes = $local->hour * 60 + $local->minute;
        $toMinutes = fn (string $hhmm) => ((int) substr($hhmm, 0, 2)) * 60 + (int) substr($hhmm, 3, 2);
        $today = $hours[$todayKey] ?? null;

        if ($today) {
            $open = $toMinutes($today['open']);
            $close = $toMinutes($today['close']);

            // Same-day interval, or (close < open) one that runs past midnight.
            if ($close > $open ? ($minutes >= $open && $minutes < $close) : $minutes >= $open) {
                return ['isOpen' => true, 'closesAt' => $today['close'] === '24:00' ? '00:00' : $today['close'], 'today' => $today];
            }
        }

        // Yesterday's overnight interval still running this morning.
        $yesterday = $hours[$yesterdayKey] ?? null;

        if ($yesterday && $toMinutes($yesterday['close']) < $toMinutes($yesterday['open']) && $minutes < $toMinutes($yesterday['close'])) {
            return ['isOpen' => true, 'closesAt' => $yesterday['close'], 'today' => $today];
        }

        return ['isOpen' => false, 'closesAt' => null, 'today' => $today];
    }

    /** The public "card" of a club. @return array<string, mixed> */
    public function toCard(Club $club, ?array $origin = null, ?CarbonInterface $now = null): array
    {
        $status = self::openStatus($club, $now ?? now());
        $distance = ($origin && $club->latitude !== null && $club->longitude !== null)
            ? round(self::distanceKm($origin['lat'], $origin['lng'], $club->latitude, $club->longitude), 1)
            : null;

        return [
            'id' => $club->id,
            'name' => $club->name,
            'slug' => $club->slug,
            'description' => $club->description,
            'logoUrl' => $club->logoUrl,
            'services' => $club->services ?? [],
            'address' => $club->address,
            'city' => $club->city,
            'region' => $club->region,
            'postalCode' => $club->postalCode,
            'country' => $club->country,
            'latitude' => $club->latitude,
            'longitude' => $club->longitude,
            'distanceKm' => $distance,
            'phones' => $club->phones ?? [],
            'email' => $club->email,
            'website' => $club->website,
            'bookingUrl' => $club->bookingUrl,
            'instagram' => $club->instagram,
            'facebook' => $club->facebook,
            'openingHours' => $club->openingHours,
            'timezone' => $club->timezone ?: config('bonapinta.default_timezone'),
            'openNow' => $status['isOpen'] ?? null,
            'closesAt' => $status['closesAt'] ?? null,
            'courtsCount' => (int) ($club->courts_count ?? $club->courts()->where('isActive', true)->count()),
            'courts' => $this->publicCourts($club),
            'priceFrom' => $club->priceFrom,
            'priceTo' => $club->priceTo,
            'currency' => $club->currency,
        ];
    }

    /**
     * What a club publishes about its courts: physical description and whether
     * each is in use. Out-of-service courts are hidden; internal notes never leave.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function publicCourts(Club $club): array
    {
        if (! $club->relationLoaded('courts')) {
            return [];
        }

        return $club->courts
            ->filter(fn ($c) => $c->status !== 'closed')
            ->sortBy(fn ($c) => $c->name, SORT_NATURAL | SORT_FLAG_CASE)
            ->map(fn ($c) => [
                'name' => $c->name, 'alias' => $c->alias, 'floor' => $c->floor, 'walls' => $c->walls, 'material' => $c->material,
                'orientation' => $c->orientation, 'setting' => $c->setting, 'hasLighting' => (bool) $c->hasLighting, 'status' => $c->status,
            ])
            ->values()
            ->all();
    }

    protected function loadClubs(): Collection
    {
        return Club::query()
            ->with('courts')
            ->withCount(['courts' => fn ($q) => $q->where('isActive', true)])
            ->get();
    }

    public function find(string $id, ?array $origin = null): array
    {
        $club = $this->loadClubs()->firstWhere('id', $id);

        if (! $club) {
            throw new ApiException('Club no encontrado', 404);
        }

        return $this->toCard($club, $origin);
    }

    /**
     * @param array<string, mixed> $q query parameters
     * @return array{data: array<int, array>, meta: array<string, mixed>}
     */
    public function search(array $q, ?CarbonInterface $now = null): array
    {
        $now ??= now();

        // ── parse & validate the query ─────────────────────────────
        // Every word must appear (in any order, in name/city/address/description): "padel madrid" finds "Pádel Norte" in Madrid.
        $tokens = array_values(array_filter(preg_split('/\s+/', self::fold($q['q'] ?? '')) ?: []));

        $services = self::list($q['services'] ?? []);
        $unknown = array_diff($services, ClubServiceCatalog::keys());
        if ($unknown) {
            throw self::fail('Servicio desconocido: '.implode(', ', $unknown));
        }
        $anyService = ($q['servicesMode'] ?? 'all') === 'any';

        $openDays = self::list($q['openDays'] ?? []);
        if ($bad = array_diff($openDays, ClubProfileRules::DAYS)) {
            throw self::fail('Día desconocido: '.implode(', ', $bad).' (usa mon,tue,wed,thu,fri,sat,sun)');
        }

        $city = self::fold($q['city'] ?? '');
        $country = strtoupper(trim((string) ($q['country'] ?? '')));
        $openNow = filter_var($q['openNow'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $minCourts = self::number($q, 'minCourts', 0, 200);
        $maxPrice = self::number($q, 'maxPrice', 0);

        $lat = self::number($q, 'lat', -90, 90);
        $lng = self::number($q, 'lng', -180, 180);
        $radius = self::number($q, 'radiusKm', 0.1, 20000);

        if (($lat === null) !== ($lng === null)) {
            throw self::fail('Indica lat y lng juntas');
        }

        $origin = $lat !== null ? ['lat' => $lat, 'lng' => $lng] : null;

        if ($radius !== null && ! $origin) {
            throw self::fail('radiusKm necesita lat y lng');
        }

        $sort = $q['sort'] ?? 'name';
        if (! in_array($sort, self::SORTS, true)) {
            throw self::fail('sort debe ser uno de: '.implode(', ', self::SORTS));
        }
        if ($sort === 'distance' && ! $origin) {
            throw self::fail('Ordenar por cercanía necesita lat y lng');
        }
        $desc = ($q['dir'] ?? '') === 'desc';

        $perPage = (int) min(max((int) ($q['perPage'] ?? self::DEFAULT_PER_PAGE), 1), self::MAX_PER_PAGE);
        $page = max((int) ($q['page'] ?? 1), 1);

        // ── card + filter ──────────────────────────────────────────
        $all = $this->loadClubs();
        $availableCities = $all->pluck('city')->filter()->unique()->sort(SORT_NATURAL | SORT_FLAG_CASE)->values()->all();

        $cards = $all->map(fn (Club $c) => $this->toCard($c, $origin, $now));

        $filtered = $cards->filter(function (array $c) use ($tokens, $services, $anyService, $openDays, $city, $country, $openNow, $minCourts, $maxPrice, $radius) {
            if ($tokens) {
                $haystack = self::fold(implode(' ', array_filter([$c['name'], $c['slug'], $c['city'], $c['region'], $c['address'], $c['description']])));

                foreach ($tokens as $token) {
                    if (! str_contains($haystack, $token)) {
                        return false;
                    }
                }
            }

            if ($services) {
                $have = array_intersect($services, $c['services']);

                if ($anyService ? ! $have : count($have) !== count($services)) {
                    return false;
                }
            }

            if ($city !== '' && self::fold($c['city']) !== $city) {
                return false;
            }

            if ($country !== '' && $c['country'] !== $country) {
                return false;
            }

            // A club with no published hours can't be said to be open on those days.
            foreach ($openDays as $day) {
                if (empty($c['openingHours'][$day])) {
                    return false;
                }
            }

            if ($openNow && $c['openNow'] !== true) {
                return false;
            }

            if ($minCourts !== null && $c['courtsCount'] < $minCourts) {
                return false;
            }

            if ($maxPrice !== null && ($c['priceFrom'] === null || $c['priceFrom'] > $maxPrice)) {
                return false;
            }

            if ($radius !== null && ($c['distanceKm'] === null || $c['distanceKm'] > $radius)) {
                return false;
            }

            return true;
        })->values();

        // ── sort (clubs missing the sort value always go last) ─────
        $key = fn (array $c) => match ($sort) {
            'distance' => $c['distanceKm'],
            'courts' => $c['courtsCount'],
            'price' => $c['priceFrom'],
            'services' => count($c['services']),
            default => self::fold($c['name']),
        };
        $defaultDesc = in_array($sort, ['courts', 'services'], true);   // "most first" by default
        $descending = $defaultDesc ? ! $desc : $desc;

        $withValue = $filtered->filter(fn ($c) => $key($c) !== null);
        $without = $filtered->filter(fn ($c) => $key($c) === null);

        $sorted = $withValue
            ->sort(function ($a, $b) use ($key, $descending) {
                $cmp = $key($a) <=> $key($b);

                return ($descending ? -$cmp : $cmp) ?: strcmp(self::fold($a['name']), self::fold($b['name']));
            })
            ->concat($without->sortBy(fn ($c) => self::fold($c['name'])))
            ->values();

        $total = $sorted->count();

        return [
            'data' => $sorted->forPage($page, $perPage)->values()->all(),
            'meta' => [
                'total' => $total,
                'page' => $page,
                'perPage' => $perPage,
                'lastPage' => max((int) ceil($total / $perPage), 1),
                'sort' => $sort,
                'availableCities' => $availableCities,
            ],
        ];
    }
}
