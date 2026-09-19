<?php

namespace App\Models\Concerns;

use Illuminate\Support\Str;

/**
 * Every Prisma-era table uses a UUID string primary key generated app-side
 * (uuidv4() in Node), never a Postgres serial/identity column. This trait
 * replicates that: non-incrementing string key, UUID assigned on creation
 * if not already set (lets tests/seeders pass an explicit id when needed).
 */
trait HasUuidPrimaryKey
{
    public function initializeHasUuidPrimaryKey(): void
    {
        $this->keyType = 'string';
        $this->incrementing = false;
    }

    protected static function bootHasUuidPrimaryKey(): void
    {
        static::creating(function ($model) {
            $key = $model->getKeyName();

            if (empty($model->{$key})) {
                $model->{$key} = (string) Str::uuid();
            }
        });
    }
}
