<?php

namespace App\Support;

/**
 * The closed vocabularies used to describe a padel court and to explain why it
 * is blocked. Keys are stored in the database; labels are shown to people.
 * One place, so backend validation, the admin forms and the public card can't
 * disagree.
 */
class CourtCatalog
{
    /** Piso / superficie de juego. */
    public const FLOORS = [
        'artificial_grass' => 'Césped artificial',
        'concrete' => 'Cemento',
        'synthetic_carpet' => 'Moqueta sintética',
        'clay' => 'Arcilla',
        'other' => 'Otro',
    ];

    /** Paredes / cerramientos. */
    public const WALLS = [
        'tempered_glass' => 'Cristal templado',
        'concrete' => 'Muro de hormigón',
        'mixed' => 'Mixtas (cristal y muro)',
        'mesh' => 'Malla metálica',
        'other' => 'Otro',
    ];

    /** Material de la estructura. */
    public const MATERIALS = [
        'galvanized_steel' => 'Acero galvanizado',
        'aluminum' => 'Aluminio',
        'concrete' => 'Hormigón',
        'wood' => 'Madera',
        'other' => 'Otro',
    ];

    /** Eje largo de la pista respecto a los puntos cardinales (Norte–Sur evita el sol de frente). */
    public const ORIENTATIONS = [
        'north_south' => 'Norte–Sur',
        'east_west' => 'Este–Oeste',
        'northeast_southwest' => 'Noreste–Suroeste',
        'northwest_southeast' => 'Noroeste–Sureste',
    ];

    public const SETTINGS = [
        'outdoor' => 'Exterior',
        'covered' => 'Cubierta',
        'indoor' => 'Interior',
    ];

    public const STATUSES = [
        'operational' => 'Operativa',
        'maintenance' => 'En mantenimiento',
        'closed' => 'Fuera de servicio',
    ];

    public const BLOCK_REASONS = [
        'maintenance' => 'Mantenimiento',
        'cleaning' => 'Limpieza',
        'repair' => 'Reparación',
        'works' => 'Obras',
        'event' => 'Evento privado',
        'tournament' => 'Torneo',
        'classes' => 'Clases / escuela',
        'weather' => 'Meteorología',
        'other' => 'Otro',
    ];

    /** The catalogues by name, for validation. */
    public const GROUPS = [
        'material' => self::MATERIALS,
        'floor' => self::FLOORS,
        'walls' => self::WALLS,
        'orientation' => self::ORIENTATIONS,
        'setting' => self::SETTINGS,
        'status' => self::STATUSES,
        'reason' => self::BLOCK_REASONS,
    ];

    public static function label(string $group, ?string $key): ?string
    {
        return $key === null ? null : (self::GROUPS[$group][$key] ?? $key);
    }

    /** Shape sent to the frontend: every catalogue as [{key, label}]. */
    public static function toArray(): array
    {
        return collect(self::GROUPS)->map(
            fn (array $items) => collect($items)->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values()->all()
        )->all();
    }
}
