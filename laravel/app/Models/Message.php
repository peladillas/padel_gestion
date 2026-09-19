<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Message extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'Message';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = ['conversationId', 'senderUserId', 'body', 'readAt'];

    protected function casts(): array
    {
        return ['readAt' => 'datetime'];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class, 'conversationId');
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'senderUserId');
    }
}
