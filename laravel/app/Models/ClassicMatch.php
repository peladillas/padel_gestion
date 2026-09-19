<?php

namespace App\Models;

use App\Casts\PostgresTextArrayCast;
use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Corresponds to Prisma model "Match" (classic league match, /api/matches).
 * Named ClassicMatch, not Match, to avoid any ambiguity with PHP 8's
 * `match` expression keyword — the table itself is still literally "Match".
 */
class ClassicMatch extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'Match';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = [
        'leagueId', 'team1Id', 'team2Id', 'date', 'time', 'format',
        'completed', 'result', 'confirmedBy', 'status',
        'resultRequestedAt', 'resultRequestedBy',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'datetime',
            'completed' => 'boolean',
            'result' => 'array',
            'confirmedBy' => PostgresTextArrayCast::class,
            'resultRequestedAt' => 'datetime',
        ];
    }

    public function league(): BelongsTo
    {
        return $this->belongsTo(League::class, 'leagueId');
    }

    public function team1(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'team1Id');
    }

    public function team2(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'team2Id');
    }

    public function valorations(): HasMany
    {
        return $this->hasMany(Valoration::class, 'matchId');
    }
}
