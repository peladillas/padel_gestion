<?php

namespace App\Support;

/**
 * New (not an Express port) — `Player.name` was a single free-text
 * field; splitting it into `firstName`/`lastName` for Profile.jsx and
 * the admin ABM (Players.jsx) needs somewhere to convert between the
 * two shapes: split() for the handful of creation paths that still
 * only collect one combined name field (self-registration, CSV
 * import — intentionally left as single-field forms, out of scope for
 * this change), and join() for every path that now collects both
 * parts and must keep the legacy `name` column in sync (still read
 * everywhere else in the app: cromos, match cards, standings...).
 */
class NameHelper
{
    /** @return array{firstName: string, lastName: string} */
    public static function split(?string $fullName): array
    {
        $fullName = trim((string) $fullName);

        if ($fullName === '') {
            return ['firstName' => '', 'lastName' => ''];
        }

        $pos = strpos($fullName, ' ');

        if ($pos === false) {
            return ['firstName' => $fullName, 'lastName' => ''];
        }

        return [
            'firstName' => substr($fullName, 0, $pos),
            'lastName' => trim(substr($fullName, $pos + 1)),
        ];
    }

    public static function join(?string $firstName, ?string $lastName): string
    {
        return trim(trim((string) $firstName).' '.trim((string) $lastName));
    }
}
