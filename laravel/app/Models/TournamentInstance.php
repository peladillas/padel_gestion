<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TournamentInstance extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'TournamentInstance';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = [
        'presetId', 'name', 'description', 'structure', 'pairingSystem', 'matchFormat',
        'byeRule', 'status', 'startDate', 'endDate', 'seasonId', 'createdBy', 'config',
        'resultMode', 'arbitroId', 'allowInvitations', 'maxParticipants', 'inviteToken',
        'visibility', 'clubId', 'responsableId',
    ];

    protected function casts(): array
    {
        return [
            'startDate' => 'datetime',
            'endDate' => 'datetime',
            'config' => 'array',
            'allowInvitations' => 'boolean',
        ];
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(Club::class, 'clubId');
    }

    public function participants(): HasMany
    {
        return $this->hasMany(TournamentParticipant::class, 'tournamentId');
    }

    public function matches(): HasMany
    {
        return $this->hasMany(TournamentMatch::class, 'tournamentId');
    }

    public function logs(): HasMany
    {
        return $this->hasMany(TournamentLog::class, 'tournamentId');
    }

    public function courts(): HasMany
    {
        return $this->hasMany(TournamentCourt::class, 'tournamentId');
    }

    /** Soft reference (TournamentInstance.createdBy), no FK in prod. */
    public function creator(): ?User
    {
        return $this->createdBy ? User::find($this->createdBy) : null;
    }

    /**
     * Soft reference (TournamentInstance.arbitroId), no FK in prod.
     * Stores a User.id, NOT a Player.id — confirmed against
     * backend/src/api/routes/dashboard.routes.js:114
     * (`arbitroId: req.user.userId`). Fixed here: an earlier version of
     * this port incorrectly looked it up as a Player.
     */
    public function arbitro(): ?User
    {
        return $this->arbitroId ? User::find($this->arbitroId) : null;
    }

    /**
     * Soft reference (TournamentInstance.responsableId), no FK. New
     * concept (not in the original Express app): tournament-level
     * MANAGEMENT permission (generate rounds, approve absences, edit
     * config) — distinct from `arbitro` (who registers match results).
     * Defaults to the creator at creation time but is reassignable to
     * any User, including a non-admin player.
     */
    public function responsable(): ?User
    {
        return $this->responsableId ? User::find($this->responsableId) : null;
    }

    /**
     * Whether $user may manage this tournament: club admins/super admins
     * (existing scoping), OR the designated responsable, regardless of
     * their system role.
     */
    public function canManage(User $user): bool
    {
        if ($user->role?->isSuperAdmin()) {
            return true;
        }

        if ($user->id === $this->responsableId) {
            return true;
        }

        if ($user->role?->isAdmin() && $this->clubId) {
            return ClubMembership::where('clubId', $this->clubId)
                ->where('role', \App\Enums\ClubRole::ADMIN)
                ->whereHas('player', fn ($q) => $q->where('userId', $user->id))
                ->exists();
        }

        return false;
    }
}
