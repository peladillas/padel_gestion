<?php

namespace App\Models;

use App\Enums\Role;
use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasOne;

class User extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'User';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'email', 'username', 'password', 'role', 'phone',
        'twoFactorEnabled', 'twoFactorCode', 'twoFactorExpiry',
        'resetToken', 'resetTokenExpiry',
        'isActivated', 'activationToken', 'activationTokenExpiry',
        'pendingEmail', 'pendingEmailToken', 'pendingEmailTokenExpiry',
    ];

    /**
     * Blanket leak-fix (silent bug fix, approved): the Express dashboard
     * endpoint (GET /api/dashboard/player) used to embed the FULL User row
     * — including password hash, reset/2FA/activation tokens — inside
     * player.user. $hidden applies to every serialization of this model
     * everywhere (toArray/toJson, nested relations included), so this
     * class of leak can't reappear the way it can with a resource that's
     * simply forgotten in one controller. Mirrors sanitizeUser() in
     * backend/src/api/routes/auth.routes.js:7-11.
     */
    protected $hidden = [
        'password',
        'resetToken', 'resetTokenExpiry',
        'twoFactorCode', 'twoFactorExpiry',
        'activationToken', 'activationTokenExpiry',
        'pendingEmailToken', 'pendingEmailTokenExpiry',
    ];

    protected function casts(): array
    {
        return [
            'role' => Role::class,
            'twoFactorEnabled' => 'boolean',
            'isActivated' => 'boolean',
            'twoFactorExpiry' => 'datetime',
            'resetTokenExpiry' => 'datetime',
            'activationTokenExpiry' => 'datetime',
            'pendingEmailTokenExpiry' => 'datetime',
        ];
    }

    public function player(): HasOne
    {
        return $this->hasOne(Player::class, 'userId');
    }
}
