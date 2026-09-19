<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A period during which a court can't be used (maintenance, works, private event…). */
class CourtBlock extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'CourtBlock';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = ['clubId', 'courtId', 'startsAt', 'endsAt', 'reason', 'note', 'groupId', 'createdBy'];

    protected function casts(): array
    {
        return ['startsAt' => 'datetime', 'endsAt' => 'datetime'];
    }

    public function court(): BelongsTo
    {
        return $this->belongsTo(Court::class, 'courtId');
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(Club::class, 'clubId');
    }
}
