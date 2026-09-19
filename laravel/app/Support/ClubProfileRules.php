<?php

namespace App\Support;

use App\Exceptions\ApiException;
use App\Models\Club;

/**
 * Validation + normalisation of everything a club admin can fill in on the
 * club's profile. One place, used by ClubService for every write path, so the
 * rules can't drift between "create", "edit" and "edit my own club".
 *
 * clean() only returns the keys that were sent (a partial update never wipes
 * what it doesn't mention) and throws a 400 ApiException naming the field.
 */
class ClubProfileRules
{
    public const DESCRIPTION_MAX = 300;

    public const MAX_PHONES = 4;

    /** ISO weekday order: index 0 = Monday. */
    public const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    public const DAY_LABELS = ['mon' => 'Lunes', 'tue' => 'Martes', 'wed' => 'Miércoles', 'thu' => 'Jueves', 'fri' => 'Viernes', 'sat' => 'Sábado', 'sun' => 'Domingo'];

    private const TEXT_LIMITS = ['address' => 160, 'city' => 80, 'region' => 80, 'postalCode' => 12];

    /** Keys this class knows about — anything else in $data is ignored. */
    public const FIELDS = [
        'description', 'services', 'address', 'city', 'region', 'postalCode', 'country',
        'latitude', 'longitude', 'phones', 'email', 'website', 'bookingUrl', 'instagram', 'facebook',
        'openingHours', 'timezone', 'priceFrom', 'priceTo', 'currency',
    ];

    protected static function fail(string $message): ApiException
    {
        return new ApiException($message, 400);
    }

    protected static function blank(mixed $v): bool
    {
        return $v === null || (is_string($v) && trim($v) === '');
    }

    /**
     * @param array<string, mixed> $data raw request data
     * @return array<string, mixed> cleaned values for the keys present in $data
     */
    public static function clean(array $data, ?Club $existing = null): array
    {
        $data = array_intersect_key($data, array_flip(self::FIELDS));
        $out = [];

        foreach ($data as $key => $value) {
            $out[$key] = match (true) {
                $key === 'description' => self::description($value),
                $key === 'services' => self::services($value),
                isset(self::TEXT_LIMITS[$key]) => self::text($key, $value, self::TEXT_LIMITS[$key]),
                $key === 'country' => self::country($value),
                $key === 'latitude', $key === 'longitude' => self::coordinate($key, $value),
                $key === 'phones' => self::phones($value),
                $key === 'email' => self::email($value),
                $key === 'website', $key === 'bookingUrl' => self::url($key, $value),
                $key === 'instagram' => self::handle('instagram', $value, ['instagram.com'], '/^[A-Za-z0-9._]{1,30}$/'),
                $key === 'facebook' => self::handle('facebook', $value, ['facebook.com', 'fb.com', 'm.facebook.com'], '/^[A-Za-z0-9.\-]{5,50}$/'),
                $key === 'openingHours' => self::openingHours($value),
                $key === 'timezone' => self::timezone($value),
                $key === 'priceFrom', $key === 'priceTo' => self::price($key, $value),
                $key === 'currency' => self::currency($value),
            };
        }

        self::crossChecks($out, $existing);

        return $out;
    }

    // ── single fields ───────────────────────────────────────────────

    protected static function description(mixed $v): ?string
    {
        $text = trim((string) $v);

        if (mb_strlen($text) > self::DESCRIPTION_MAX) {
            throw self::fail('La descripción admite hasta '.self::DESCRIPTION_MAX.' caracteres');
        }

        return $text ?: null;
    }

    protected static function services(mixed $v): ?array
    {
        if ($v !== null && ! is_array($v)) {
            throw self::fail('services debe ser una lista');
        }

        $unknown = array_diff($v ?? [], ClubServiceCatalog::keys());

        if ($unknown) {
            throw self::fail('Servicio desconocido: '.implode(', ', array_map('strval', $unknown)));
        }

        // Catalogue order, no duplicates: two clubs with the same services store them identically.
        return $v === null ? null : array_values(array_intersect(ClubServiceCatalog::keys(), $v));
    }

    protected static function text(string $key, mixed $v, int $max): ?string
    {
        if (is_array($v)) {
            throw self::fail("{$key} debe ser texto");
        }

        $text = trim((string) $v);

        if (mb_strlen($text) > $max) {
            throw self::fail("{$key} admite hasta {$max} caracteres");
        }

        return $text === '' ? null : $text;
    }

    protected static function country(mixed $v): ?string
    {
        if (self::blank($v)) {
            return null;
        }

        if (! is_string($v) || ! preg_match('/^[A-Za-z]{2}$/', trim($v))) {
            throw self::fail('country debe ser un código de país de 2 letras (p. ej. ES, AR)');
        }

        return strtoupper(trim($v));
    }

    protected static function coordinate(string $key, mixed $v): ?float
    {
        if (self::blank($v)) {
            return null;
        }

        if (! is_numeric($v)) {
            throw self::fail("{$key} debe ser un número");
        }

        $n = (float) $v;
        $limit = $key === 'latitude' ? 90 : 180;

        if ($n < -$limit || $n > $limit) {
            throw self::fail("{$key} debe estar entre -{$limit} y {$limit}");
        }

        return round($n, 6);
    }

    /** @return array<int, array{label: ?string, number: string}>|null */
    protected static function phones(mixed $v): ?array
    {
        if ($v === null || $v === []) {
            return null;
        }

        if (! is_array($v) || ! array_is_list($v)) {
            throw self::fail('phones debe ser una lista de teléfonos');
        }

        if (count($v) > self::MAX_PHONES) {
            throw self::fail('Puedes indicar hasta '.self::MAX_PHONES.' teléfonos');
        }

        $clean = [];

        foreach ($v as $item) {
            $number = is_array($item) ? ($item['number'] ?? '') : $item;
            $label = is_array($item) ? trim((string) ($item['label'] ?? '')) : '';

            if (! is_string($number) && ! is_numeric($number)) {
                throw self::fail('Cada teléfono debe tener un número');
            }

            $number = trim((string) $number);
            $digits = preg_replace('/\D/', '', $number);

            // Digits, spaces and + ( ) - . only; 6–15 digits (E.164 maximum).
            if (! preg_match('/^\+?[0-9 ().\-]+$/', $number) || strlen($digits) < 6 || strlen($digits) > 15) {
                throw self::fail("Teléfono no válido: \"{$number}\"");
            }

            if (mb_strlen($label) > 30) {
                throw self::fail('La etiqueta de un teléfono admite hasta 30 caracteres');
            }

            $clean[] = ['label' => $label ?: null, 'number' => $number];
        }

        return $clean;
    }

    protected static function email(mixed $v): ?string
    {
        if (self::blank($v)) {
            return null;
        }

        $email = strtolower(trim((string) $v));

        if (! filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 120) {
            throw self::fail('El email de contacto no es válido');
        }

        return $email;
    }

    /** http(s) only ("javascript:" and friends are refused); a bare "club.com" becomes https://club.com. */
    protected static function url(string $key, mixed $v): ?string
    {
        if (self::blank($v)) {
            return null;
        }

        $url = trim((string) $v);

        if (! preg_match('#^[a-z][a-z0-9+.\-]*:#i', $url)) {
            $url = 'https://'.$url;
        }

        $parts = parse_url($url);

        if (! $parts || ! in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)
            || empty($parts['host']) || ! str_contains($parts['host'], '.') || strlen($url) > 200
            || preg_match('/\s/', $url)) {
            throw self::fail("{$key} debe ser una dirección web válida (http o https)");
        }

        return $url;
    }

    /** Accepts "@club", "club" or a profile URL and stores just the handle. */
    protected static function handle(string $key, mixed $v, array $hosts, string $pattern): ?string
    {
        if (self::blank($v)) {
            return null;
        }

        $handle = trim((string) $v);

        if (preg_match('#^(https?://)?(www\.)?([^/]+)/([^/?\#]+)#i', $handle, $m) && in_array(strtolower($m[3]), $hosts, true)) {
            $handle = $m[4];
        }

        $handle = ltrim($handle, '@');

        if (! preg_match($pattern, $handle)) {
            throw self::fail("{$key} no es un usuario o enlace válido");
        }

        return $handle;
    }

    /** @return array<string, array{open: string, close: string}|null>|null */
    protected static function openingHours(mixed $v): ?array
    {
        if ($v === null || $v === []) {
            return null;
        }

        if (! is_array($v) || array_is_list($v)) {
            throw self::fail('openingHours debe indicar los días de la semana (mon…sun)');
        }

        $unknown = array_diff(array_keys($v), self::DAYS);

        if ($unknown) {
            throw self::fail('Día desconocido en el horario: '.implode(', ', $unknown));
        }

        $clean = [];

        foreach (self::DAYS as $day) {
            $interval = $v[$day] ?? null;

            if ($interval === null || $interval === false) {
                $clean[$day] = null;   // closed (or not mentioned)

                continue;
            }

            $open = is_array($interval) ? ($interval['open'] ?? null) : null;
            $close = is_array($interval) ? ($interval['close'] ?? null) : null;

            if (! is_string($open) || ! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $open)
                || ! is_string($close) || ! preg_match('/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/', $close)) {
                throw self::fail("Horario de {$day} no válido: usa HH:MM en formato 24 horas");
            }

            // "00:00" as a closing time means midnight, i.e. the end of the day.
            if ($close === '00:00') {
                $close = '24:00';
            }

            if ($open === $close) {
                throw self::fail("Horario de {$day}: la apertura y el cierre no pueden coincidir");
            }

            // close < open is allowed: the club stays open past midnight.
            $clean[$day] = ['open' => $open, 'close' => $close];
        }

        return $clean;
    }

    protected static function timezone(mixed $v): ?string
    {
        if (self::blank($v)) {
            return null;
        }

        if (! is_string($v) || ! in_array(trim($v), \DateTimeZone::listIdentifiers(), true)) {
            throw self::fail('Zona horaria no válida (p. ej. Europe/Madrid)');
        }

        return trim($v);
    }

    protected static function price(string $key, mixed $v): ?float
    {
        if (self::blank($v)) {
            return null;
        }

        if (! is_numeric($v) || (float) $v < 0 || (float) $v > 99999.99) {
            throw self::fail("{$key} debe ser un importe entre 0 y 99999,99");
        }

        return round((float) $v, 2);
    }

    protected static function currency(mixed $v): ?string
    {
        if (self::blank($v)) {
            return null;
        }

        if (! is_string($v) || ! preg_match('/^[A-Za-z]{3}$/', trim($v))) {
            throw self::fail('currency debe ser un código de 3 letras (EUR, ARS, USD…)');
        }

        return strtoupper(trim($v));
    }

    /** Rules that involve more than one field, checked on the club's resulting state. */
    protected static function crossChecks(array $clean, ?Club $existing): void
    {
        $get = fn (string $k) => array_key_exists($k, $clean) ? $clean[$k] : $existing?->{$k};

        if (array_key_exists('latitude', $clean) || array_key_exists('longitude', $clean)) {
            if (($get('latitude') === null) !== ($get('longitude') === null)) {
                throw self::fail('Indica latitud y longitud juntas (o ninguna)');
            }
        }

        $from = $get('priceFrom');
        $to = $get('priceTo');

        if ($from !== null && $to !== null && $to < $from) {
            throw self::fail('El precio máximo no puede ser menor que el mínimo');
        }

        if (($from !== null || $to !== null) && $get('currency') === null) {
            throw self::fail('Indica la moneda de los precios (currency)');
        }
    }

    // ── profile completeness ────────────────────────────────────────

    /**
     * How filled-in a club's public profile is, so the admin sees what is
     * still missing. @return array{percent: int, missing: array<int, string>}
     */
    public static function completeness(Club $club): array
    {
        $checks = [
            'Foto' => (bool) $club->logoUrl,
            'Descripción' => (bool) $club->description,
            'Dirección' => (bool) ($club->address && $club->city),
            'Ubicación en el mapa' => $club->latitude !== null && $club->longitude !== null,
            'Teléfono' => ! empty($club->phones),
            'Email o web' => (bool) ($club->email || $club->website),
            'Horario' => ! empty($club->openingHours) && (bool) array_filter($club->openingHours),
            'Servicios' => ! empty($club->services),
        ];

        $missing = array_keys(array_filter($checks, fn ($ok) => ! $ok));

        return ['percent' => (int) round((count($checks) - count($missing)) / count($checks) * 100), 'missing' => $missing];
    }
}
