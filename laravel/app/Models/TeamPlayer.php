<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Composite-PK pivot (teamId, playerId), no surrogate id, no timestamps.
 * Not exposed via any API route today — see App\Models\Season docblock.
 * Deliberately NOT using HasUuidPrimaryKey (there is no `id` column at
 * all) and no composite-PK package, since there's currently zero query
 * surface that needs find()-by-composite-key; use where() instead.
 */
class TeamPlayer extends Model
{
    protected $table = 'TeamPlayer';

    protected $primaryKey = null;

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = ['teamId', 'playerId'];

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'teamId');
    }

    public function player(): BelongsTo
    {
        return $this->belongsTo(Player::class, 'playerId');
    }

    public static function forTeamAndPlayer(string $teamId, string $playerId): ?self
    {
        return static::where('teamId', $teamId)->where('playerId', $playerId)->first();
    }
}
