<?php

namespace App\Enums;

/**
 * Mirrors the native Postgres enum "ClubRole" (prisma/schema.prisma).
 */
enum ClubRole: string
{
    case ADMIN = 'ADMIN';
    case MEMBER = 'MEMBER';
}
