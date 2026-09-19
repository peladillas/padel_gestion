<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * NOT exposed via any API route — Season/League management was
 * intentionally removed from the frontend (see CLAUDE.md). Kept only
 * because AvailabilityService relies on one hardcoded Season row
 * (config('bonapinta.default_season_id')). Do not add controllers/routes
 * for this model without an explicit product decision to bring it back.
 */
class Season extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'Season';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = ['name', 'startDate', 'endDate', 'active', 'config'];

    protected function casts(): array
    {
        return [
            'startDate' => 'datetime',
            'endDate' => 'datetime',
            'active' => 'boolean',
            'config' => 'array',
        ];
    }

    public function leagues(): HasMany
    {
        return $this->hasMany(League::class, 'seasonId');
    }

    public function availability(): HasMany
    {
        return $this->hasMany(Availability::class, 'seasonId');
    }
}
