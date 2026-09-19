<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TournamentParticipant extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'TournamentParticipant';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = [
        'tournamentId', 'playerId', 'partnerId', 'teamName', 'seed', 'status',
        'substituteId', 'absenceReason', 'absenceNote',
    ];

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(TournamentInstance::class, 'tournamentId');
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'playerId');
    }

    /** Real FK exists in prod (SetNull), added in migration 20260429000001. */
    public function substitute(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'substituteId');
    }

    /**
     * KNOWN FOOTGUN (documented in CLAUDE.md, do not "fix" the semantics):
     * partnerId stores the partner's Player.id, NOT another
     * TournamentParticipant.id. No FK exists in prod. Comparisons must be
     * `player.id === myParticipant.partnerId` or
     * `player.partnerId === myPlayerId`, never
     * `participant.id === myParticipant.partnerId`.
     */
    public function partner(): ?Player
    {
        return $this->partnerId ? Player::find($this->partnerId) : null;
    }
}
