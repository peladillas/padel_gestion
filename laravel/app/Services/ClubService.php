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
use App\Support\ClubProfileRules;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Intervention\Image\Drivers\Gd\Driver as GdDriver;
use Intervention\Image\Encoders\PngEncoder;
use Intervention\Image\ImageManager;

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
        $data['profile'] = ClubProfileRules::completeness($club);

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

    /** "Club Pádel Ñoño!" → "club-padel-nono": lowercase, accents folded, only a-z 0-9 and dashes. */
    public static function cleanSlug(string $source): string
    {
        return Str::slug($source);
    }

    protected function assertSlugFree(string $slug, ?string $exceptClubId = null): void
    {
        $taken = Club::where('slug', $slug)
            ->when($exceptClubId, fn ($q) => $q->where('id', '!=', $exceptClubId))
            ->exists();

        if ($taken) {
            throw self::error("El slug \"{$slug}\" ya está en uso por otro club", 409);
        }
    }

    public function create(array $data): Club
    {
        $name = trim((string) ($data['name'] ?? ''));

        if ($name === '') {
            throw self::error('El nombre del club es obligatorio', 400);
        }

        $slug = self::cleanSlug((string) (($data['slug'] ?? '') !== '' ? $data['slug'] : $name));

        if ($slug === '') {
            throw self::error('El slug no es válido: usa letras o números', 400);
        }

        $this->assertSlugFree($slug);

        $club = new Club(['name' => $name, 'slug' => $slug]);
        $this->applyProfile($club, $data);
        $club->save();

        return $club;
    }

    /**
     * The "public face" of a club (description, services, address, contact,
     * hours, prices…) — shared by create(), update() and updateProfile() so the
     * rules can't drift. All validation lives in ClubProfileRules. Only the
     * keys present in $data are touched. Does not save.
     */
    protected function applyProfile(Club $club, array $data): void
    {
        $club->fill(ClubProfileRules::clean($data, $club->exists ? $club : null));
    }

    /** Super admins manage every club; a club admin only their own (profile, courts, block calendar). */
    public function assertCanManage(User $user, string $clubId): void
    {
        if ($user->role === Role::SUPER_ADMIN) {
            return;
        }

        $isClubAdmin = ClubMembership::where('clubId', $clubId)
            ->where('role', ClubRole::ADMIN)
            ->whereHas('player', fn ($q) => $q->where('userId', $user->id))
            ->exists();

        if (! $isClubAdmin) {
            throw self::error('No tienes permiso para editar este club', 403);
        }
    }

    /** The part of a club its own admin may edit: everything in ClubProfileRules::FIELDS (photo has its own endpoints). */
    public function updateProfile(string $id, array $data): Club
    {
        $club = Club::find($id);

        if (! $club) {
            throw self::error('Club no encontrado', 404);
        }

        // Only what was sent: omitting `description` must not wipe it.
        $this->applyProfile($club, array_intersect_key($data, array_flip(ClubProfileRules::FIELDS)));
        $club->save();

        return $club;
    }

    /**
     * Edits a club's info. The club's `id` (uuid) is never touched: tournaments,
     * members, courts and invite codes all point to it, so renaming a club or
     * changing its slug (just a human-readable handle) breaks nothing.
     * The logo has its own endpoints (setLogo/removeLogo) — it accepts an
     * uploaded image, never an arbitrary external URL.
     */
    public function update(string $id, array $data): Club
    {
        $club = Club::find($id);

        if (! $club) {
            throw self::error('Club no encontrado', 404);
        }

        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);

            if ($name === '') {
                throw self::error('El nombre del club es obligatorio', 400);
            }

            $club->name = $name;
        }

        if (array_key_exists('slug', $data)) {
            $slug = self::cleanSlug((string) $data['slug']);

            if ($slug === '') {
                throw self::error('El slug no es válido: usa letras o números', 400);
            }

            $this->assertSlugFree($slug, $club->id);
            $club->slug = $slug;
        }

        $this->applyProfile($club, $data);

        $club->save();

        return $club;
    }

    protected const LOGO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

    protected const LOGO_MAX_BYTES = 5 * 1024 * 1024;

    protected function logoDir(): string
    {
        return rtrim(config('bonapinta.uploads_path'), '/').'/clubs';
    }

    /**
     * Stores the club logo as a PNG (keeps transparency), scaled down to fit
     * 256×256 without cropping. The URL carries `?v=` so browsers and Nginx
     * (which caches /uploads for a week) pick up a replaced logo.
     */
    public function setLogo(string $id, ?UploadedFile $file): Club
    {
        $club = Club::find($id);

        if (! $club) {
            throw self::error('Club no encontrado', 404);
        }

        if (! $file) {
            throw self::error('No se subió ninguna imagen', 400);
        }

        if (! in_array($file->getMimeType(), self::LOGO_MIMES, true) || $file->getSize() > self::LOGO_MAX_BYTES) {
            throw self::error('Solo se permiten imágenes JPG, PNG o WebP de hasta 5 MB', 400);
        }

        File::ensureDirectoryExists($this->logoDir());

        $image = (new ImageManager(GdDriver::class))->decodePath($file->getRealPath());
        $image->scaleDown(256, 256);
        file_put_contents($this->logoDir()."/club_{$club->id}.png", (string) $image->encode(new PngEncoder));

        $club->logoUrl = "/uploads/clubs/club_{$club->id}.png?v=".time();
        $club->save();

        return $club;
    }

    public function removeLogo(string $id): Club
    {
        $club = Club::find($id);

        if (! $club) {
            throw self::error('Club no encontrado', 404);
        }

        $this->deleteLogoFile($club);
        $club->logoUrl = null;
        $club->save();

        return $club;
    }

    protected function deleteLogoFile(Club $club): void
    {
        $path = $this->logoDir()."/club_{$club->id}.png";

        if (is_file($path)) {
            unlink($path);
        }
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
        if ($club = Club::find($id)) {
            $this->deleteLogoFile($club);
        }

        DB::transaction(function () use ($id) {
            Player::where('clubId', $id)->update(['clubId' => null]);
            TournamentInstance::where('clubId', $id)->update(['clubId' => null]);
            InviteCode::where('clubId', $id)->update(['clubId' => null]);
            ClubMembership::where('clubId', $id)->delete();
            Club::whereKey($id)->delete();
        });
    }
}
