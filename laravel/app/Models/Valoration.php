<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Only ever references TournamentMatch — the classic Match/Team/League
 * system was never ported and the user explicitly decided not to (see
 * conversation), so `matchId` was dropped from this table entirely (see
 * the 2026_09_18_000001 migration). `tournamentMatchId` is now NOT NULL
 * with a real UNIQUE constraint on (tournamentMatchId, fromPlayerId,
 * toPlayerId) — no more partial-index juggling for an "exactly one of
 * two FKs" case that no longer exists.
 *
 * tournamentMatchId still has no FK relation declared (TournamentMatch
 * predates this pattern and nothing enforces it at the DB level in the
 * original schema) — kept as a plain attribute + helper accessor rather
 * than a belongsTo, consistent with the rest of this table's soft
 * references.
 */
class Valoration extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'Valoration';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = [
        'tournamentMatchId', 'fromPlayerId', 'toPlayerId',
        'smash', 'volea', 'globo', 'bandeja', 'bajadaPared', 'resto', 'saque', 'ambiente',
    ];

    public function fromPlayer(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'fromPlayerId');
    }

    public function toPlayer(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'toPlayerId');
    }

    public function tournamentMatch(): ?TournamentMatch
    {
        return TournamentMatch::find($this->tournamentMatchId);
    }
}
