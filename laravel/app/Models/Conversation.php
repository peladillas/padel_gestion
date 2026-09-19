<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Conversation extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'Conversation';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = ['type', 'userAId', 'userBId', 'clubId', 'lastMessageAt'];

    protected function casts(): array
    {
        return ['lastMessageAt' => 'datetime'];
    }

    public function userA(): BelongsTo
    {
        return $this->belongsTo(User::class, 'userAId');
    }

    public function userB(): BelongsTo
    {
        return $this->belongsTo(User::class, 'userBId');
    }

    public function club(): BelongsTo
    {
        return $this->belongsTo(Club::class, 'clubId');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class, 'conversationId');
    }
}
