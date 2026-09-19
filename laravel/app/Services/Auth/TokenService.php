<?php

namespace App\Services\Auth;

use App\Models\User;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

/**
 * JWT compatibility layer with the Express backend (jsonwebtoken ^9).
 *
 * The payload MUST stay exactly {userId, role} (+iat/exp) — not the
 * JWT-standard "sub" — because the frontend and, during the dual-stack
 * migration window, the Express backend itself must accept tokens issued
 * by whichever service handled a given login. See
 * backend/src/adapters/auth/EmailAuthProvider.js:15-21 and
 * backend/src/services/AuthService.js:27,64 for the source of truth.
 */
class TokenService
{
    public function issue(User $user): string
    {
        $now = time();

        $payload = [
            'userId' => $user->id,
            'role' => $user->role instanceof \App\Enums\Role ? $user->role->value : $user->role,
            'iat' => $now,
            'exp' => $now + $this->expirySeconds(),
        ];

        return JWT::encode($payload, $this->secret(), 'HS256');
    }

    /**
     * @return object{userId: string, role: string, iat: int, exp: int}
     *
     * @throws \Firebase\JWT\ExpiredException|\UnexpectedValueException
     */
    public function verify(string $token): object
    {
        return JWT::decode($token, new Key($this->secret(), 'HS256'));
    }

    protected function secret(): string
    {
        $secret = config('bonapinta.jwt_secret');

        if (! $secret) {
            throw new \RuntimeException('JWT_SECRET is not configured.');
        }

        return $secret;
    }

    /**
     * Parses the small subset of "ms"-style durations this app actually
     * configures (JWT_EXPIRY, default '7d'): \d+[dhms] or a bare integer
     * number of seconds. Doesn't need full parity with the npm `ms`
     * package — each service independently computes its own `exp`
     * timestamp at issuance time, so only correctness (not bit-identical
     * parsing) matters here.
     */
    public function expirySeconds(): int
    {
        $raw = trim((string) config('bonapinta.jwt_expiry', '7d'));

        if ($raw === '' || ctype_digit($raw)) {
            return (int) ($raw === '' ? 604800 : $raw);
        }

        if (preg_match('/^(\d+)\s*([dhms])$/i', $raw, $m)) {
            $n = (int) $m[1];

            return match (strtolower($m[2])) {
                'd' => $n * 86400,
                'h' => $n * 3600,
                'm' => $n * 60,
                's' => $n,
            };
        }

        // Unrecognized format — fall back to the documented default (7d)
        // rather than guessing.
        return 7 * 86400;
    }
}
