<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TournamentRoundRole extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'tournament_round_roles';

    const UPDATED_AT = null;

    protected $fillable = ['tournament_id', 'round', 'participant_id', 'role'];

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(TournamentInstance::class, 'tournament_id');
    }

    public function participant(): BelongsTo
    {
        return $this->belongsTo(TournamentParticipant::class, 'participant_id');
    }
}
