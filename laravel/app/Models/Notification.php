<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'Notification';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = [
        'userId', 'type', 'title', 'body', 'actionUrl',
        'isRead', 'readAt', 'isArchived', 'archivedAt',
    ];

    protected function casts(): array
    {
        return [
            'isRead' => 'boolean',
            'isArchived' => 'boolean',
            'readAt' => 'datetime',
            'archivedAt' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'userId');
    }
}
