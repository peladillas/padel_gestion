<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TournamentLog extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'TournamentLog';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = ['tournamentId', 'userId', 'playerName', 'action', 'detail'];

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(TournamentInstance::class, 'tournamentId');
    }
}
