<?php

namespace App\Enums;

/**
 * Mirrors the native Postgres enum "Role" (prisma/schema.prisma).
 * IMPORTANT: when embedding a user's role in a JWT payload, always use
 * ->value (a plain string) — never serialize the enum object itself, to
 * stay byte-for-byte compatible with the Express-issued tokens.
 */
enum Role: string
{
    case SUPER_ADMIN = 'SUPER_ADMIN';
    case ADMIN = 'ADMIN';
    case PLAYER = 'PLAYER';

    public function isAdmin(): bool
    {
        return $this === self::ADMIN || $this === self::SUPER_ADMIN;
    }

    public function isSuperAdmin(): bool
    {
        return $this === self::SUPER_ADMIN;
    }
}
