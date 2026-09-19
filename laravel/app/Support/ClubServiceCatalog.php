<?php

namespace App\Support;

/**
 * The services a padel club can say it offers. A fixed catalogue (rather than
 * free text) so clubs can be listed and filtered consistently, labels are
 * translated in one place, and a typo can't create a new "service".
 *
 * Chosen from what padel clubs most commonly advertise worldwide: the
 * basics players expect (changing rooms and showers, parking, lighting, a
 * bar/café, a pro shop, racket rental, coaching, tournaments) plus the extras
 * that larger or premium venues add (panoramic/covered courts, restaurant,
 * gym, pool, spa, physio, other sports). Stored on Club.services as a list of
 * the keys below.
 */
class ClubServiceCatalog
{
    public const GROUPS = [
        'instalaciones' => 'Instalaciones',
        'padel' => 'Pádel',
        'comida' => 'Comida y ocio',
        'bienestar' => 'Bienestar y extras',
    ];

    /** @return array<string, array{label: string, group: string}> key => data */
    public static function all(): array
    {
        return [
            // Instalaciones
            'pistas_cubiertas' => ['label' => 'Pistas cubiertas', 'group' => 'instalaciones'],
            'pistas_panoramicas' => ['label' => 'Pistas panorámicas', 'group' => 'instalaciones'],
            'iluminacion' => ['label' => 'Iluminación nocturna', 'group' => 'instalaciones'],
            'climatizacion' => ['label' => 'Climatización', 'group' => 'instalaciones'],
            'vestuarios' => ['label' => 'Vestuarios y duchas', 'group' => 'instalaciones'],
            'taquillas' => ['label' => 'Taquillas', 'group' => 'instalaciones'],
            'parking' => ['label' => 'Parking', 'group' => 'instalaciones'],
            'accesibilidad' => ['label' => 'Acceso para movilidad reducida', 'group' => 'instalaciones'],
            'wifi' => ['label' => 'Wi-Fi', 'group' => 'instalaciones'],
            // Pádel
            'reserva_online' => ['label' => 'Reserva online', 'group' => 'padel'],
            'alquiler_palas' => ['label' => 'Alquiler de palas y pelotas', 'group' => 'padel'],
            'tienda' => ['label' => 'Tienda de pádel', 'group' => 'padel'],
            'clases' => ['label' => 'Clases y entrenadores', 'group' => 'padel'],
            'escuela_ninos' => ['label' => 'Escuela infantil', 'group' => 'padel'],
            'torneos' => ['label' => 'Torneos y ligas', 'group' => 'padel'],
            'partidos_abiertos' => ['label' => 'Partidos abiertos', 'group' => 'padel'],
            // Comida y ocio
            'bar_cafeteria' => ['label' => 'Bar / cafetería', 'group' => 'comida'],
            'restaurante' => ['label' => 'Restaurante', 'group' => 'comida'],
            'terraza' => ['label' => 'Terraza / zona social', 'group' => 'comida'],
            'eventos' => ['label' => 'Eventos y celebraciones', 'group' => 'comida'],
            // Bienestar y extras
            'gimnasio' => ['label' => 'Gimnasio', 'group' => 'bienestar'],
            'piscina' => ['label' => 'Piscina', 'group' => 'bienestar'],
            'spa' => ['label' => 'Spa / sauna', 'group' => 'bienestar'],
            'fisioterapia' => ['label' => 'Fisioterapia y masajes', 'group' => 'bienestar'],
            'otros_deportes' => ['label' => 'Otros deportes', 'group' => 'bienestar'],
        ];
    }

    /** @return array<int, string> */
    public static function keys(): array
    {
        return array_keys(self::all());
    }

    /** Shape sent to the frontend: a flat list plus the group labels. */
    public static function toArray(): array
    {
        return [
            'groups' => collect(self::GROUPS)->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values()->all(),
            'services' => collect(self::all())->map(fn ($s, $key) => ['key' => $key, 'label' => $s['label'], 'group' => $s['group']])->values()->all(),
        ];
    }
}
