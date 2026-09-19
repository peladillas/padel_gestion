<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;

class Block extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'Block';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = null;

    protected $fillable = ['blockerUserId', 'blockerClubId', 'targetType', 'targetUserId', 'targetClubId'];
}
