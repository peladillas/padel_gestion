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

    protected $fillable = ['clubId', 'name', 'alias', 'isActive'];

    protected function casts(): array
    {
        return ['isActive' => 'boolean'];
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
