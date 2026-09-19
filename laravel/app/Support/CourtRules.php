<?php

namespace App\Support;

use App\Exceptions\ApiException;

/**
 * Validation + normalisation of a court's editable data (used for create,
 * edit and bulk creation). Returns only the keys that were sent, so a partial
 * update never wipes what it doesn't mention. `status` and `isActive` are kept
 * consistent: isActive is exactly (status === 'operational').
 */
class CourtRules
{
    public const NAME_MAX = 60;

    public const NOTES_MAX = 200;

    /** Descriptive attributes that are catalogue values (blank clears them). */
    private const ENUM_FIELDS = ['material', 'floor', 'walls', 'orientation', 'setting'];

    /** Fields a bulk-creation template may carry (never name/alias). */
    public const TEMPLATE_FIELDS = ['material', 'floor', 'walls', 'orientation', 'setting', 'status', 'hasLighting', 'notes'];

    protected static function fail(string $message): ApiException
    {
        return new ApiException($message, 400);
    }

    protected static function blank(mixed $v): bool
    {
        return $v === null || (is_string($v) && trim($v) === '');
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function clean(array $data): array
    {
        $out = [];

        foreach (['name', 'alias'] as $key) {
            if (array_key_exists($key, $data)) {
                $text = is_array($data[$key]) ? '' : trim((string) $data[$key]);

                if (mb_strlen($text) > self::NAME_MAX) {
                    throw self::fail("{$key} admite hasta ".self::NAME_MAX.' caracteres');
                }

                if ($key === 'name' && $text === '') {
                    throw self::fail('El nombre es requerido');
                }

                $out[$key] = $text === '' ? null : $text;
            }
        }

        foreach (self::ENUM_FIELDS as $field) {
            if (array_key_exists($field, $data)) {
                $out[$field] = self::blank($data[$field]) ? null : self::catalogValue($field, $data[$field]);
            }
        }

        if (array_key_exists('status', $data)) {
            if (self::blank($data['status'])) {
                throw self::fail('El estado de la pista es obligatorio');
            }

            $out['status'] = self::catalogValue('status', $data['status']);
        }

        if (array_key_exists('hasLighting', $data)) {
            $out['hasLighting'] = filter_var($data['hasLighting'], FILTER_VALIDATE_BOOLEAN);
        }

        if (array_key_exists('notes', $data)) {
            $notes = is_array($data['notes']) ? '' : trim((string) $data['notes']);

            if (mb_strlen($notes) > self::NOTES_MAX) {
                throw self::fail('Las notas admiten hasta '.self::NOTES_MAX.' caracteres');
            }

            $out['notes'] = $notes === '' ? null : $notes;
        }

        // Legacy on/off switch: still accepted, mapped onto the status.
        if (array_key_exists('isActive', $data) && ! array_key_exists('status', $out)) {
            $on = filter_var($data['isActive'], FILTER_VALIDATE_BOOLEAN);
            $out['status'] = $on ? 'operational' : 'closed';
        }

        if (array_key_exists('status', $out)) {
            $out['isActive'] = $out['status'] === 'operational';
        }

        return $out;
    }

    protected static function catalogValue(string $field, mixed $value): string
    {
        if (! is_string($value) || ! array_key_exists($value, CourtCatalog::GROUPS[$field])) {
            throw self::fail("Valor no válido para {$field}: ".(is_scalar($value) ? $value : 'no es texto').' (usa uno del catálogo)');
        }

        return $value;
    }
}
