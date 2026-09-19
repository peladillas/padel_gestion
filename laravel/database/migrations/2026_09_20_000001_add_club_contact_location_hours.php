<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Everything a club's public card needs beyond name/description/photo/services:
 * where it is (address + coordinates, so players can sort by distance), how to
 * reach it (phones, email, web, booking link, socials), when it is open
 * (per-weekday hours + timezone, so "open now" is computable) and what it
 * costs. All optional and filled in by the club's own admin.
 */
return new class extends Migration
{
    private const COLUMNS = [
        'address' => 'varchar(160)',
        'city' => 'varchar(80)',
        'region' => 'varchar(80)',
        'postalCode' => 'varchar(12)',
        'country' => 'char(2)',
        'latitude' => 'double precision',
        'longitude' => 'double precision',
        'phones' => 'jsonb',          // [{label?, number}]
        'email' => 'varchar(120)',
        'website' => 'varchar(200)',
        'bookingUrl' => 'varchar(200)',
        'instagram' => 'varchar(30)',
        'facebook' => 'varchar(50)',
        'openingHours' => 'jsonb',    // {mon: {open, close}|null, ... sun}
        'timezone' => 'varchar(64)',
        'priceFrom' => 'numeric(8,2)',
        'priceTo' => 'numeric(8,2)',
        'currency' => 'char(3)',
    ];

    public function up(): void
    {
        foreach (self::COLUMNS as $column => $type) {
            DB::statement("ALTER TABLE \"Club\" ADD COLUMN IF NOT EXISTS \"{$column}\" {$type} NULL");
        }

        DB::statement('ALTER TABLE "Club" DROP CONSTRAINT IF EXISTS "Club_coordinates_range"');
        DB::statement('ALTER TABLE "Club" ADD CONSTRAINT "Club_coordinates_range" CHECK ('
            .'("latitude" IS NULL AND "longitude" IS NULL) OR ('
            .'"latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180))');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE "Club" DROP CONSTRAINT IF EXISTS "Club_coordinates_range"');

        foreach (array_keys(self::COLUMNS) as $column) {
            DB::statement("ALTER TABLE \"Club\" DROP COLUMN IF EXISTS \"{$column}\"");
        }
    }
};
