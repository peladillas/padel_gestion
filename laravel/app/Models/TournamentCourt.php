<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TournamentCourt extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'TournamentCourt';

    public $timestamps = false;

    protected $fillable = ['tournamentId', 'courtId', 'displayOrder'];

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(TournamentInstance::class, 'tournamentId');
    }

    public function court(): BelongsTo
    {
        return $this->belongsTo(Court::class, 'courtId');
    }
}
