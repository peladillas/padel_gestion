<?php

namespace App\Support;

use App\Models\User;

/**
 * Direct port of backend/src/services/usernameHelper.js — keep both in
 * sync if the rules ever change during the dual-stack migration window.
 */
class UsernameHelper
{
    protected const USERNAME_REGEX = '/^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$|^[a-z0-9]{2,20}$/';

    public static function normalizeToUsername(string $name): string
    {
        $s = mb_strtolower($name, 'UTF-8');

        $s = preg_replace('/[áàäâã]/u', 'a', $s);
        $s = preg_replace('/[éèëê]/u', 'e', $s);
        $s = preg_replace('/[íìïî]/u', 'i', $s);
        $s = preg_replace('/[óòöôõ]/u', 'o', $s);
        $s = preg_replace('/[úùüû]/u', 'u', $s);
        $s = preg_replace('/[ñ]/u', 'n', $s);
        $s = preg_replace('/[ç]/u', 'c', $s);
        $s = preg_replace('/\s+/u', '.', $s);
        $s = preg_replace('/[^a-z0-9._]/u', '', $s);
        $s = preg_replace('/^[._]+|[._]+$/u', '', $s);
        $s = mb_substr($s, 0, 20);

        return $s !== '' ? $s : 'user';
    }

    /** Returns an error message string, or null if valid. */
    public static function validateUsername(?string $username): ?string
    {
        if (! $username) {
            return 'El nombre de usuario es requerido';
        }

        if (mb_strlen($username) < 3) {
            return 'Mínimo 3 caracteres';
        }

        if (mb_strlen($username) > 20) {
            return 'Máximo 20 caracteres';
        }

        if (! preg_match('/^[a-z0-9._]+$/', $username)) {
            return 'Solo letras minúsculas, números, puntos y guiones bajos';
        }

        if (preg_match('/^[._]|[._]$/', $username)) {
            return 'No puede empezar ni terminar con punto o guión bajo';
        }

        if (preg_match('/[._]{2}/', $username)) {
            return 'No puede tener dos puntos o guiones bajos seguidos';
        }

        return null;
    }

    public static function generateAvailableUsername(string $baseName, ?string $excludeUserId = null): string
    {
        $base = self::normalizeToUsername($baseName);
        $candidate = $base;
        $counter = 2;

        while (true) {
            $existing = User::where('username', $candidate)->first();

            if (! $existing || $existing->id === $excludeUserId) {
                return $candidate;
            }

            $candidate = $base.$counter;
            $counter++;
        }
    }

    /** @return array<int, string> */
    public static function suggestUsernames(string $baseName, string $taken, ?string $excludeUserId = null): array
    {
        $base = self::normalizeToUsername($baseName);
        $parts = explode('.', $base);

        $candidates = [
            $base,
            count($parts) > 1 ? $parts[0].'.'.mb_substr($parts[1], 0, 1) : $base.'1',
            count($parts) > 1 ? mb_substr($parts[0], 0, 1).'.'.$parts[1] : $base.'2',
            $base.random_int(10, 99),
            count($parts) > 1 ? implode('', $parts) : $base.'3',
        ];

        $suggestions = [];

        foreach ($candidates as $c) {
            if ($c === $taken) {
                continue;
            }

            $exists = User::where('username', $c)->first();

            if (! $exists || $exists->id === $excludeUserId) {
                $suggestions[] = $c;
            }

            if (count($suggestions) >= 3) {
                break;
            }
        }

        $n = 2;

        while (count($suggestions) < 3) {
            $c = $base.$n;

            if ($c !== $taken) {
                $exists = User::where('username', $c)->first();

                if (! $exists || $exists->id === $excludeUserId) {
                    $suggestions[] = $c;
                }
            }

            $n++;

            if ($n > 999) {
                break;
            }
        }

        return $suggestions;
    }
}
