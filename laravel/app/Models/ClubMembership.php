<?php

namespace App\Models;

use App\Enums\ClubRole;
use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClubMembership extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'ClubMembership';

    const CREATED_AT = 'joinedAt';

    const UPDATED_AT = null;

    protected $fillable = ['clubId', 'playerId', 'role', 'status'];

    protected function casts(): array
    {
        return ['role' => ClubRole::class];
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(Club::class, 'clubId');
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'playerId');
    }
}
