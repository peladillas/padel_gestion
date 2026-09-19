<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;

/**
 * DB-backed registry of tournament types — replaces the hardcoded
 * structure/pairingSystem string enums from the old Express Strategy
 * Registry. New table, no legacy counterpart, so it follows normal
 * Laravel snake_case conventions (see the migration's docblock).
 *
 * `engine = 'configurable'`: interpreted generically by
 * App\Services\Tournament\GenericEngine from the TournamentInstance's
 * `config` JSON (roles, rotationConstraints, matchGenerator, scoring,
 * absence).
 *
 * `engine = 'custom'`: `custom_class` names a class implementing
 * App\Services\Tournament\Contracts\TournamentEngineContract directly
 * (e.g. CimaPadel) — the generic config interpretation is bypassed
 * entirely for these.
 */
class TournamentType extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'tournament_types';

    protected $fillable = [
        'key', 'label', 'description', 'engine', 'custom_class',
        'default_config_schema', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'default_config_schema' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function isCustom(): bool
    {
        return $this->engine === 'custom';
    }
}
