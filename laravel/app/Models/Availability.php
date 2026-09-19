<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Availability extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'Availability';

    const CREATED_AT = null;

    const UPDATED_AT = 'updatedAt';

    protected $fillable = ['playerId', 'seasonId', 'slots'];

    protected function casts(): array
    {
        return ['slots' => 'array'];
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'playerId');
    }

    public function season(): BelongsTo
    {
        return $this->belongsTo(Season::class, 'seasonId');
    }
}
