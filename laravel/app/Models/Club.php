<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Club extends Model
{
    use HasUuidPrimaryKey;

    protected $table = 'Club';

    const CREATED_AT = 'createdAt';

    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'name', 'slug', 'description', 'logoUrl', 'services',
        'address', 'city', 'region', 'postalCode', 'country', 'latitude', 'longitude',
        'phones', 'email', 'website', 'bookingUrl', 'instagram', 'facebook',
        'openingHours', 'timezone', 'priceFrom', 'priceTo', 'currency',
        'allowedStructures', 'allowedPairingSystems',
    ];

    protected function casts(): array
    {
        return [
            // null = all allowed; JSON array of strings when restricted.
            'allowedStructures' => 'array',
            'allowedPairingSystems' => 'array',
            // Keys of App\Support\ClubServiceCatalog; null = none declared.
            'services' => 'array',
            'phones' => 'array',
            'openingHours' => 'array',
            'latitude' => 'float',
            'longitude' => 'float',
            'priceFrom' => 'float',
            'priceTo' => 'float',
        ];
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(ClubMembership::class, 'clubId');
    }

    public function tournamentInstances(): HasMany
    {
        return $this->hasMany(TournamentInstance::class, 'clubId');
    }

    public function inviteCodes(): HasMany
    {
        return $this->hasMany(InviteCode::class, 'clubId');
    }

    public function players(): HasMany
    {
        return $this->hasMany(Player::class, 'clubId');
    }

    public function courts(): HasMany
    {
        return $this->hasMany(Court::class, 'clubId');
    }
}
