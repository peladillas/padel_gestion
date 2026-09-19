<?php

namespace App\Exceptions;

/**
 * Mirrors the Express pattern of `Object.assign(new Error(msg), { status:
 * 4xx, ...extra })` — services throw this, controllers catch it and turn
 * it into the exact same JSON error shape the original route returned
 * (e.g. {error, expired: true} or {error, suggestions: [...]}).
 */
class ApiException extends \RuntimeException
{
    public function __construct(
        string $message,
        protected int $status,
        protected array $extra = [],
    ) {
        parent::__construct($message);
    }

    public function status(): int
    {
        return $this->status;
    }

    public function extra(): array
    {
        return $this->extra;
    }

    public function toResponseArray(): array
    {
        return array_merge(['error' => $this->getMessage()], $this->extra);
    }
}
