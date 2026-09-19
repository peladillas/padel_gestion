<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InviteCode extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'InviteCode';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = [
        'token', 'expiresAt', 'uses', 'maxUses', 'createdBy', 'label', 'clubId',
    ];

    protected function casts(): array
    {
        return ['expiresAt' => 'datetime'];
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(Club::class, 'clubId');
    }
}
