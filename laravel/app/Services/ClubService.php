<?php

namespace App\Services;

use App\Enums\ClubRole;
use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\Club;
use App\Models\ClubMembership;
use App\Models\InviteCode;
use App\Models\Player;
use App\Models\TournamentInstance;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Direct port of backend/src/services/ClubService.js.
 */
class ClubService
{
    protected static function error(string $message, int $status): ApiException
    {
        return new ApiException($message, $status);
    }

    /**
     * Reshapes Laravel's flat `memberships_count`/`tournament_instances_count`
     * (from withCount()) into Prisma's nested `_count: {memberships,
     * tournamentInstances}` shape the frontend expects
     * (`club._count?.memberships ?? 0` per CLAUDE.md's known gotchas).
     */
    protected function withNestedCount(Club $club): array
    {
        $data = $club->toArray();
        $data['_count'] = [
            'memberships' => $club->memberships_count ?? 0,
            'tournamentInstances' => $club->tournament_instances_count ?? 0,
        ];
        unset($data['memberships_count'], $data['tournament_instances_count']);

        return $data;
    }

    /** @return array<int, array> */
    public function getAll(string $userId, Role $role): array
    {
        $query = Club::query();

        if ($role !== Role::SUPER_ADMIN) {
            $query->whereHas('memberships', fn ($q) => $q
                ->where('role', ClubRole::ADMIN)
                ->whereHas('player', fn ($q2) => $q2->where('userId', $userId))
            );
        }

        return $query
            ->withCount(['memberships', 'tournamentInstances'])
            ->orderBy('name')
            ->get()
            ->map(fn ($club) => $this->withNestedCount($club))
            ->all();
    }

    public function getById(string $id): ?array
    {
        $club = Club::find($id);

        if (! $club) {
            return null;
        }

        $memberships = ClubMembership::where('clubId', $id)
            ->where('role', ClubRole::ADMIN)
            ->orderBy('joinedAt')
            ->with(['player:id,name,avatarUrl,userId', 'player.user:id,email,username,role'])
            ->get();

        $tournamentInstances = TournamentInstance::where('clubId', $id)
            ->orderByDesc('createdAt')
            ->get(['id', 'name', 'status', 'pairingSystem', 'createdAt']);

        $data = $club->toArray();
        $data['memberships'] = $memberships->toArray();
        $data['tournamentInstances'] = $tournamentInstances->toArray();

        return $data;
    }

    public function create(array $data): Club
    {
        $slugSource = $data['slug'] ?? $data['name'] ?? '';
        $cleanSlug = mb_strtolower($slugSource);
        $cleanSlug = preg_replace('/\s+/', '-', $cleanSlug);
        $cleanSlug = preg_replace('/[^a-z0-9-]/', '', $cleanSlug);

        if (Club::where('slug', $cleanSlug)->exists()) {
            throw self::error("El slug \"{$cleanSlug}\" ya está en uso", 409);
        }

        return Club::create([
            'name' => $data['name'],
            'slug' => $cleanSlug,
            'description' => $data['description'] ?? null,
        ]);
    }

    public function update(string $id, array $data): Club
    {
        $club = Club::findOrFail($id);

        if (array_key_exists('name', $data)) {
            $club->name = $data['name'];
        }

        if (array_key_exists('slug', $data)) {
            $club->slug = mb_strtolower($data['slug']);
        }

        if (array_key_exists('description', $data)) {
            $club->description = $data['description'];
        }

        if (array_key_exists('logoUrl', $data)) {
            $club->logoUrl = $data['logoUrl'];
        }

        $club->save();

        return $club;
    }

    public function createClubAdmin(string $clubId, array $data): array
    {
        $name = $data['name'];
        $email = $data['email'];
        $uname = mb_strtolower($data['username'] ?? explode('@', $email)[0]);
        $uname = preg_replace('/[^a-z0-9_.]/', '', $uname);

        $conflict = User::where('email', $email)->orWhere('username', $uname)->first();

        if ($conflict) {
            if ($conflict->email === $email) {
                throw self::error('El email ya está en uso', 409);
            }

            throw self::error("El usuario \"{$uname}\" ya está en uso", 409);
        }

        $hash = Hash::make($data['password']);

        return DB::transaction(function () use ($clubId, $email, $uname, $hash, $name) {
            $user = User::create([
                'email' => $email,
                'username' => $uname,
                'password' => $hash,
                'role' => Role::ADMIN,
                'isActivated' => true,
            ]);

            $player = Player::create(['userId' => $user->id, 'name' => $name]);

            ClubMembership::create([
                'clubId' => $clubId,
                'playerId' => $player->id,
                'role' => ClubRole::ADMIN,
                'status' => 'active',
            ]);

            return [
                'role' => 'ADMIN',
                'status' => 'active',
                'player' => [
                    'id' => $player->id,
                    'name' => $player->name,
                    'avatarUrl' => null,
                    'user' => [
                        'id' => $user->id,
                        'email' => $user->email,
                        'username' => $user->username,
                        'role' => $user->role->value,
                    ],
                ],
            ];
        });
    }

    public function updateClubAdmin(string $clubId, string $playerId, array $data): array
    {
        $membership = ClubMembership::where('clubId', $clubId)->where('playerId', $playerId)
            ->with('player:id,userId')
            ->first();

        if (! $membership) {
            throw self::error('Admin no encontrado', 404);
        }

        $userId = $membership->player->userId;

        $email = $data['email'] ?? null;
        $username = $data['username'] ?? null;

        if ($email || $username) {
            $conflict = User::where('id', '!=', $userId)
                ->where(function ($q) use ($email, $username) {
                    if ($email) {
                        $q->orWhere('email', $email);
                    }
                    if ($username) {
                        $q->orWhere('username', $username);
                    }
                })
                ->first();

            if ($conflict) {
                if ($email && $conflict->email === $email) {
                    throw self::error('El email ya está en uso', 409);
                }

                throw self::error('El nombre de usuario ya está en uso', 409);
            }
        }

        DB::transaction(function () use ($data, $playerId, $userId, $email, $username) {
            if (! empty($data['name'])) {
                Player::whereKey($playerId)->update(['name' => $data['name']]);
            }

            $userPatch = array_filter([
                'email' => $email,
                'username' => $username,
                'password' => ! empty($data['password']) ? Hash::make($data['password']) : null,
            ]);

            if ($userPatch) {
                User::whereKey($userId)->update($userPatch);
            }
        });

        return ClubMembership::where('clubId', $clubId)->where('playerId', $playerId)
            ->with(['player:id,name,avatarUrl,userId', 'player.user:id,email,username,role'])
            ->first()
            ->toArray();
    }

    public function removeClubAdmin(string $clubId, string $playerId): void
    {
        $membership = ClubMembership::where('clubId', $clubId)->where('playerId', $playerId)
            ->with('player:id,userId')
            ->first();

        if (! $membership) {
            return;
        }

        $userId = $membership->player->userId;

        DB::transaction(function () use ($clubId, $playerId, $userId) {
            ClubMembership::where('clubId', $clubId)->where('playerId', $playerId)->delete();
            User::whereKey($userId)->update(['role' => Role::PLAYER]);
        });
    }

    public function deleteClub(string $id): void
    {
        DB::transaction(function () use ($id) {
            Player::where('clubId', $id)->update(['clubId' => null]);
            TournamentInstance::where('clubId', $id)->update(['clubId' => null]);
            InviteCode::where('clubId', $id)->update(['clubId' => null]);
            ClubMembership::where('clubId', $id)->delete();
            Club::whereKey($id)->delete();
        });
    }
}
