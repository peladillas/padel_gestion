<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;

/**
 * Casts a Postgres `text[]` column (e.g. Match.confirmedBy,
 * TournamentMatch.confirmedByParticipants) to/from a plain PHP array of
 * strings. Prisma stored these as native TEXT[], never JSONB — keep it
 * that way (converting to JSONB would be a live-data schema change with
 * no functional need behind it).
 *
 * @implements CastsAttributes<array<int, string>, iterable<string>>
 */
class PostgresTextArrayCast implements CastsAttributes
{
    public function get($model, string $key, $value, array $attributes): array
    {
        if ($value === null || $value === '') {
            return [];
        }

        // PDO pgsql hands back the literal wire format: {a,b,c}, {} for
        // empty, elements individually double-quoted when they contain a
        // comma/backslash/quote/space, NULL for a sql null element.
        $inner = trim($value);
        $inner = substr($inner, 1, -1); // strip outer { }

        if ($inner === '') {
            return [];
        }

        $result = [];
        $current = '';
        $inQuotes = false;
        $escaped = false;

        for ($i = 0; $i < strlen($inner); $i++) {
            $char = $inner[$i];

            if ($escaped) {
                $current .= $char;
                $escaped = false;

                continue;
            }

            if ($char === '\\') {
                $escaped = true;

                continue;
            }

            if ($char === '"') {
                $inQuotes = ! $inQuotes;

                continue;
            }

            if ($char === ',' && ! $inQuotes) {
                $result[] = $current === 'NULL' ? null : $current;
                $current = '';

                continue;
            }

            $current .= $char;
        }

        $result[] = $current === 'NULL' ? null : $current;

        return array_values(array_filter($result, fn ($v) => $v !== null));
    }

    public function set($model, string $key, $value, array $attributes): string
    {
        $items = $value ?? [];

        $escaped = array_map(function ($item) {
            $item = (string) $item;
            $item = str_replace('\\', '\\\\', $item);
            $item = str_replace('"', '\\"', $item);

            return '"'.$item.'"';
        }, $items);

        return '{'.implode(',', $escaped).'}';
    }
}
