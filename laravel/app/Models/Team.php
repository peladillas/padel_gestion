<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * No direct CRUD route exists for Team (see App\Models\Season docblock),
 * but Team rows ARE serialized nested inside classic Match responses
 * (/api/matches, public player profile) — so its relation shapes still
 * need to match Prisma exactly.
 *
 * `players` mirrors Prisma's `Team.players TeamPlayer[]` relation field
 * name and shape EXACTLY: it returns the TeamPlayer junction rows
 * themselves (each with its own nested `player`), not a flattened
 * Player[] — Express's `include: { players: { include: { player: true } } }`
 * produces `team.players[].player`, and the frontend expects that same
 * two-level shape.
 */
class Team extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'Team';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = ['name', 'leagueId'];

    public function league(): BelongsTo
    {
        return $this->belongsTo(League::class, 'leagueId');
    }

    public function players(): HasMany
    {
        return $this->hasMany(TeamPlayer::class, 'teamId');
    }

    public function matchesAsTeam1(): HasMany
    {
        return $this->hasMany(ClassicMatch::class, 'team1Id');
    }

    public function matchesAsTeam2(): HasMany
    {
        return $this->hasMany(ClassicMatch::class, 'team2Id');
    }
}
