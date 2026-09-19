<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Not exposed via any API route — see App\Models\Season docblock. */
class League extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'League';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = ['name', 'seasonId', 'level', 'type'];

    public function season(): BelongsTo
    {
        return $this->belongsTo(Season::class, 'seasonId');
    }

    public function teams(): HasMany
    {
        return $this->hasMany(Team::class, 'leagueId');
    }

    public function matches(): HasMany
    {
        return $this->hasMany(ClassicMatch::class, 'leagueId');
    }
}
