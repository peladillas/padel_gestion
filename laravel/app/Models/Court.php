<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Court extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'Court';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'clubId', 'name', 'alias', 'isActive',
        'material', 'floor', 'walls', 'orientation', 'setting', 'status', 'hasLighting', 'notes',
    ];

    // Same defaults as the database columns, so a court built in memory (Court::create()
    // doesn't re-read the row) already reads as operational instead of status = null.
    protected $attributes = ['status' => 'operational', 'isActive' => true, 'hasLighting' => false];

    protected function casts(): array
    {
        return ['isActive' => 'boolean', 'hasLighting' => 'boolean'];
    }

    public function blocks(): HasMany
    {
        return $this->hasMany(CourtBlock::class, 'courtId');
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(Club::class, 'clubId');
    }

    public function tournamentCourts(): HasMany
    {
        return $this->hasMany(TournamentCourt::class, 'courtId');
    }

    public function matches(): HasMany
    {
        return $this->hasMany(TournamentMatch::class, 'courtId');
    }
}
