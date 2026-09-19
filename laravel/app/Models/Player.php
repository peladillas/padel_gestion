<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Player extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'Player';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = [
        'userId', 'name', 'firstName', 'lastName', 'phone', 'level', 'active', 'avatarUrl',
        'birthDate', 'gender', 'dominantHand', 'position',
        'isPublic', 'showStats', 'showMatches', 'showContact', 'clubId',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'isPublic' => 'boolean',
            'showStats' => 'boolean',
            'showMatches' => 'boolean',
            'showContact' => 'boolean',
            'birthDate' => 'date',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'userId');
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(Club::class, 'clubId');
    }

    public function availability(): HasMany
    {
        return $this->hasMany(Availability::class, 'playerId');
    }

    /** Mirrors Prisma's `Player.teams TeamPlayer[]` — see App\Models\Team docblock. */
    public function teams(): HasMany
    {
        return $this->hasMany(TeamPlayer::class, 'playerId');
    }

    public function valorationsGiven(): HasMany
    {
        return $this->hasMany(Valoration::class, 'fromPlayerId');
    }

    public function valorationsReceived(): HasMany
    {
        return $this->hasMany(Valoration::class, 'toPlayerId');
    }

    public function tournamentParticipations(): HasMany
    {
        return $this->hasMany(TournamentParticipant::class, 'playerId');
    }

    /**
     * Tournaments where this player has been designated as a substitute
     * for an absent participant (TournamentParticipant.substituteId).
     */
    public function substitutingIn(): HasMany
    {
        return $this->hasMany(TournamentParticipant::class, 'substituteId');
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(ClubMembership::class, 'playerId');
    }
}
