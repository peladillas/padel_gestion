<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;

/** Tournament presets/templates (/api/tournaments) — no relations. */
class Tournament extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'Tournament';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = [
        'name', 'description', 'structure', 'pairingSystem', 'matchFormat',
        'byeRule', 'isPreset', 'createdBy',
    ];

    protected function casts(): array
    {
        return ['isPreset' => 'boolean'];
    }
}
