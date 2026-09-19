<?php

namespace App\Models;

use App\Casts\PostgresTextArrayCast;
use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TournamentMatch extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'TournamentMatch';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = [
        'tournamentId', 'round', 'group', 'participant1Id', 'participant2Id',
        'winnerId', 'result', 'status', 'scheduledAt', 'courtNumber', 'courtId',
        'proposedByParticipant', 'confirmedByParticipants', 'expiresAt',
    ];

    protected function casts(): array
    {
        return [
            'result' => 'array',
            'confirmedByParticipants' => PostgresTextArrayCast::class,
            'scheduledAt' => 'datetime',
            'expiresAt' => 'datetime',
        ];
    }

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(TournamentInstance::class, 'tournamentId');
    }

    /** Real FK exists in prod (SetNull), added in migration 20260602000001. */
    public function court(): BelongsTo
    {
        return $this->belongsTo(Court::class, 'courtId');
    }

    /**
     * `group` is stored as a JSON *string* column (not JSONB) — Prisma
     * declared it `String?`. We deliberately do NOT use Eloquent's
     * built-in 'array' cast here: that cast turns a stored `null` into a
     * PHP `null` fine on read, but on WRITE an empty array would become
     * the string "[]" instead of staying NULL, and importantly the raw
     * column must round-trip through the exact same
     * `{team1:[...],team2:[...]}` / `{_bbq:{...}}` shapes the Express app
     * wrote — decoding/encoding explicitly here keeps that under our
     * control instead of relying on cast quirks. Holds nullable.
     */
    public function getGroupData(): ?array
    {
        if ($this->group === null || $this->group === '') {
            return null;
        }

        return json_decode($this->group, true);
    }

    public function setGroupData(?array $data): void
    {
        $this->group = $data === null ? null : json_encode($data);
    }

    /** Soft reference, no FK in prod. */
    public function participant1(): ?TournamentParticipant
    {
        return $this->participant1Id ? TournamentParticipant::find($this->participant1Id) : null;
    }

    /** Soft reference, no FK in prod. */
    public function participant2(): ?TournamentParticipant
    {
        return $this->participant2Id ? TournamentParticipant::find($this->participant2Id) : null;
    }

    /** Soft reference, no FK in prod. */
    public function winner(): ?TournamentParticipant
    {
        return $this->winnerId ? TournamentParticipant::find($this->winnerId) : null;
    }

    /**
     * False for a walkover/no-show, injury, or mid-match withdrawal —
     * see TournamentService::setResult(). Someone still "wins" for
     * standings purposes either way; this only gates whether the match
     * can be valorated (see ValorationService::pending()). Defaults
     * true for any match completed before this flag existed.
     */
    public function wasPlayed(): bool
    {
        return ($this->result['played'] ?? true) !== false;
    }

    public function completedAt(): ?\Illuminate\Support\Carbon
    {
        $raw = $this->result['completedAt'] ?? null;

        return $raw ? \Illuminate\Support\Carbon::parse($raw) : null;
    }
}
