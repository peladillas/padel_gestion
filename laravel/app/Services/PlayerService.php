<?php

namespace App\Services;

use App\Enums\ClubRole;
use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\Club;
use App\Models\ClubMembership;
use App\Models\Player;
use App\Models\User;
use App\Services\Auth\AuthService;
use App\Support\NameHelper;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use League\Csv\Reader;

/**
 * Direct port of backend/src/api/routes/players.routes.js. Method names
 * mirror the route handlers 1:1.
 */
class PlayerService
{
    public function __construct(protected AuthService $auth) {}

    protected static function error(string $message, int $status, array $extra = []): ApiException
    {
        return new ApiException($message, $status, $extra);
    }

    /**
     * Repeated 3x in the original players.routes.js (club-players,
     * club-members, club-players POST) — the admin's own club, found via
     * their Player row's ADMIN ClubMembership. Returns null exactly when
     * the Express code would have returned early with [] / null clubId.
     */
    protected function adminClubId(string $userId): ?string
    {
        $adminPlayer = Player::where('userId', $userId)->first();

        if (! $adminPlayer) {
            return null;
        }

        $membership = ClubMembership::where('playerId', $adminPlayer->id)
            ->where('role', ClubRole::ADMIN)
            ->first();

        return $membership?->clubId;
    }

    public function updateMe(string $userId, array $data): Player
    {
        $firstName = trim($data['firstName'] ?? '');
        $lastName = trim($data['lastName'] ?? '');

        if (! $firstName || mb_strlen($firstName) < 2) {
            throw self::error('El nombre es inválido', 400);
        }

        if (mb_strlen($firstName) > 60 || mb_strlen($lastName) > 60) {
            throw self::error('El nombre o apellido es demasiado largo', 400);
        }

        $player = Player::where('userId', $userId)->firstOrFail();

        // Mirrors Express's `...(field !== undefined && { field })`: only
        // touch a column if the client actually sent that key (even
        // `null` counts as "sent" and clears the column) — firstName/
        // lastName are always sent since firstName is required and
        // validated above. `name` (still read everywhere else in the
        // app — cromos, match cards, standings...) is kept in sync from
        // the two parts rather than sent independently.
        $player->firstName = $firstName;
        $player->lastName = $lastName;
        $player->name = NameHelper::join($firstName, $lastName);

        if (array_key_exists('phone', $data)) {
            $player->phone = $data['phone'];
        }

        if (array_key_exists('birthDate', $data)) {
            $player->birthDate = $data['birthDate'] ?: null;
        }

        if (array_key_exists('gender', $data)) {
            $player->gender = $data['gender'];
        }

        if (array_key_exists('dominantHand', $data)) {
            $player->dominantHand = $data['dominantHand'];
        }

        if (array_key_exists('position', $data)) {
            $player->position = $data['position'];
        }

        $player->save();

        return $player;
    }

    public function updatePrivacy(string $userId, array $data): Player
    {
        $player = Player::where('userId', $userId)->firstOrFail();

        foreach (['isPublic', 'showStats', 'showMatches', 'showContact'] as $field) {
            if (array_key_exists($field, $data)) {
                $player->{$field} = (bool) $data[$field];
            }
        }

        $player->save();

        return $player;
    }

    public function updateMyClub(string $userId, ?string $clubId): Player
    {
        if ($clubId && ! Club::whereKey($clubId)->exists()) {
            throw self::error('Club no encontrado', 404);
        }

        $player = Player::where('userId', $userId)->firstOrFail();
        $player->clubId = $clubId ?: null;
        $player->save();

        return $player->load('club:id,name');
    }

    public function invite(array $data): array
    {
        $email = $data['email'] ?? null;
        $firstName = trim($data['firstName'] ?? '');
        $lastName = trim($data['lastName'] ?? '');

        if (! $email || ! $firstName) {
            throw self::error('Email y nombre son requeridos', 400);
        }

        return $this->auth->invite([
            'email' => $email,
            'firstName' => $firstName,
            'lastName' => $lastName,
            'phone' => $data['phone'] ?? null,
            'level' => (int) ($data['level'] ?? 1) ?: 1,
            'username' => $data['username'] ?? null,
        ]);
    }

    /** @return array<int, Player> */
    public function getClubPlayers(string $userId): array
    {
        $clubId = $this->adminClubId($userId);

        if (! $clubId) {
            return [];
        }

        return Player::whereHas('memberships', fn ($q) => $q->where('clubId', $clubId))
            ->whereHas('user', fn ($q) => $q->where('role', Role::PLAYER))
            ->with('user:id,email,username,isActivated')
            ->orderBy('name')
            ->get()
            ->all();
    }

    /**
     * Silent bug fix (approved): Express returns a bare `[]` in several
     * branches (SUPER_ADMIN, admin without a Player row, admin without a
     * club membership) and `{club, players}` otherwise — the frontend
     * (Dashboard.jsx) already unconditionally reads `.club` and
     * `.players`, so the bare-array branches were a latent bug, not a
     * relied-upon shape. Always return {club, players} here.
     *
     * Second fix (found while reviewing the frontend, not an Express
     * carry-over): this used to filter by `Player.clubId` — a player's
     * own self-selected "club I belong to" preference on their profile
     * — while the sibling `getClubPlayers()` (the "Jugadores del club"
     * ABM panel) filters by `ClubMembership` — who an admin actually
     * added. Those are two different sets, so a player an admin created
     * via the ABM panel (which only creates a ClubMembership, not a
     * `clubId`) was invisible here — confusing for the admin ("I added
     * them, why don't they show up in Socios?"). Both panels now use the
     * same ClubMembership-based criterion; `Player.clubId` remains a
     * separate, legitimate "which club to display on my public profile"
     * preference, untouched by this.
     */
    public function getClubMembers(string $userId, Role $role): array
    {
        if ($role === Role::SUPER_ADMIN) {
            return ['club' => null, 'players' => []];
        }

        $clubId = $this->adminClubId($userId);

        if (! $clubId) {
            return ['club' => null, 'players' => []];
        }

        $club = Club::select('id', 'name')->find($clubId);

        $players = Player::whereHas('memberships', fn ($q) => $q->where('clubId', $clubId))
            ->whereHas('user', fn ($q) => $q->where('role', Role::PLAYER))
            ->with('user:id,email,username,isActivated')
            ->orderBy('name')
            ->get();

        return ['club' => $club, 'players' => $players];
    }

    public function createClubPlayer(string $userId, array $data): array
    {
        $firstName = trim($data['firstName'] ?? '');
        $lastName = trim($data['lastName'] ?? '');
        $email = $data['email'] ?? null;
        $password = $data['password'] ?? null;

        if (! $firstName || ! $email || ! $password) {
            throw self::error('Nombre, email y contraseña son requeridos', 400);
        }

        if (User::where('email', $email)->exists()) {
            throw self::error('El email ya está en uso', 409);
        }

        $clubId = $this->adminClubId($userId);
        $uname = mb_strtolower($data['username'] ?? explode('@', $email)[0]);
        $uname = preg_replace('/[^a-z0-9_.]/', '', $uname);
        $hash = Hash::make($password);
        $fullName = NameHelper::join($firstName, $lastName);

        return DB::transaction(function () use ($email, $uname, $hash, $data, $firstName, $lastName, $fullName, $clubId) {
            $user = User::create([
                'email' => $email,
                'username' => $uname,
                'password' => $hash,
                'role' => Role::PLAYER,
                'isActivated' => true,
            ]);

            $player = Player::create([
                'userId' => $user->id,
                'name' => $fullName,
                'firstName' => $firstName,
                'lastName' => $lastName,
                'level' => (int) ($data['level'] ?? 1) ?: 1,
                'phone' => $data['phone'] ?? null,
            ]);

            if ($clubId) {
                ClubMembership::create([
                    'clubId' => $clubId,
                    'playerId' => $player->id,
                    'role' => ClubRole::MEMBER,
                    'status' => 'active',
                ]);
            }

            return array_merge($player->toArray(), [
                'user' => [
                    'id' => $user->id,
                    'email' => $user->email,
                    'username' => $user->username,
                    'isActivated' => $user->isActivated,
                ],
            ]);
        });
    }

    /**
     * @param string|null $clubId when given, scopes to players with a
     *   ClubMembership in that club — added so a SUPER_ADMIN can narrow
     *   the platform-wide directory down to one club instead of always
     *   getting every player on the platform in one flat list (found
     *   while reviewing Players.jsx: `isSuperAdmin ? search('') :
     *   getClubPlayers()` gave super admins no club-scoping option at
     *   all).
     * @return array<int, Player>
     */
    public function search(?string $q, ?string $clubId = null): array
    {
        return Player::query()
            ->when($q, fn ($query) => $query->where('name', 'ilike', '%'.$q.'%'))
            ->when($clubId, fn ($query) => $query->whereHas('memberships', fn ($m) => $m->where('clubId', $clubId)))
            ->whereHas('user', fn ($query) => $query->where('role', Role::PLAYER))
            ->with('user:id,email,role,username,isActivated')
            ->orderBy('name')
            ->get()
            ->all();
    }

    /**
     * @return array{player: array, stats: array, matches: array} `matches` = finished tournament matches, newest first
     */
    public function publicProfile(string $id, ?User $viewer): array
    {
        $player = Player::with(['user:id,email,role', 'club:id,name'])->find($id);

        if (! $player) {
            throw self::error('Jugador no encontrado', 404);
        }

        $isOwner = $viewer && $player->userId === $viewer->id;
        $isAdmin = $viewer?->role?->isAdmin() ?? false;

        if (! $player->isPublic && ! $isOwner && ! $isAdmin) {
            throw self::error('Perfil privado', 403, ['isPrivate' => true]);
        }

        $safePlayer = $player->toArray();

        if (! $player->showContact && ! $isOwner && ! $isAdmin) {
            $safePlayer['user'] = null;
            $safePlayer['phone'] = null;
        }

        $stats = ['total' => 0];

        if ($player->showStats || $isOwner || $isAdmin) {
            $stats = app(ValorationService::class)->statsForPlayer($id);
        }

        // Tournament matches only — the classic Match/Team system was never
        // ported, so it can't have data here.
        $matches = ($player->showMatches || $isOwner || $isAdmin)
            ? app(\App\Services\Tournament\TournamentService::class)->publicMatchHistory($player)
            : [];

        return ['player' => $safePlayer, 'stats' => $stats, 'matches' => $matches];
    }

    /** @return array<int, Player> */
    public function all(): array
    {
        return Player::with('user:id,email,role')->get()->all();
    }

    public function find(string $id): Player
    {
        $player = Player::with('user:id,email,role')->find($id);

        if (! $player) {
            throw self::error('Jugador no encontrado', 404);
        }

        return $player;
    }

    public function adminUpdate(string $id, User $actingUser, array $data): Player
    {
        $player = Player::with('user:id,role')->find($id);

        if (! $player) {
            throw self::error('Jugador no encontrado', 404);
        }

        if ($actingUser->role === Role::ADMIN && $player->user?->role?->isAdmin()) {
            throw self::error('No tienes permiso para editar este usuario', 403);
        }

        if (array_key_exists('firstName', $data) || array_key_exists('lastName', $data)) {
            $firstName = trim($data['firstName'] ?? $player->firstName ?? '');
            $lastName = trim($data['lastName'] ?? $player->lastName ?? '');

            if (! $firstName) {
                throw self::error('El nombre es requerido', 400);
            }

            $player->firstName = $firstName;
            $player->lastName = $lastName;
            $player->name = NameHelper::join($firstName, $lastName);
        }

        $player->phone = $data['phone'] ?? null;
        $player->level = (int) ($data['level'] ?? 1) ?: 1;

        foreach (['birthDate', 'gender', 'dominantHand', 'position'] as $field) {
            if (array_key_exists($field, $data)) {
                $player->{$field} = $data[$field] ?: null;
            }
        }

        $player->save();

        $userPatch = [];

        if (! empty($data['username'])) {
            $taken = User::where('username', $data['username'])->where('id', '!=', $player->userId)->exists();

            if ($taken) {
                throw self::error('El nombre de usuario ya está en uso', 409);
            }

            $userPatch['username'] = $data['username'];
        }

        if (! empty($data['email'])) {
            $email = trim($data['email']);

            if (! preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/', $email)) {
                throw self::error('Email inválido', 400);
            }

            $taken = User::where('email', $email)->where('id', '!=', $player->userId)->exists();

            if ($taken) {
                throw self::error('El email ya está en uso', 409);
            }

            $userPatch['email'] = $email;
        }

        if ($userPatch) {
            User::whereKey($player->userId)->update($userPatch);
        }

        return Player::with('user:id,email,username,isActivated')->find($id);
    }

    public function adminUpdatePassword(string $id, User $actingUser, ?string $password): array
    {
        if (! $password || mb_strlen($password) < 6) {
            throw self::error('La contraseña debe tener al menos 6 caracteres', 400);
        }

        $player = Player::with('user')->find($id);

        if (! $player) {
            throw self::error('Jugador no encontrado', 404);
        }

        if ($actingUser->role === Role::ADMIN && $player->user?->role?->isAdmin()) {
            throw self::error('No tienes permiso para cambiar la contraseña de este usuario', 403);
        }

        if ($actingUser->role === Role::ADMIN) {
            $clubId = $this->adminClubId($actingUser->id);

            if ($clubId) {
                $inClub = ClubMembership::where('playerId', $player->id)->where('clubId', $clubId)->exists();

                if (! $inClub) {
                    throw self::error('Este jugador no pertenece a tu club', 403);
                }
            }
        }

        User::whereKey($player->userId)->update(['password' => Hash::make($password)]);

        return ['message' => 'Contraseña actualizada'];
    }

    public function softDelete(string $id): array
    {
        $player = Player::with('user')->find($id);

        if (! $player) {
            throw self::error('Jugador no encontrado', 404);
        }

        if ($player->user?->role?->isAdmin()) {
            throw self::error('No se puede eliminar un administrador', 403);
        }

        $deadHash = Hash::make(bin2hex(random_bytes(32)));

        DB::transaction(function () use ($player, $deadHash) {
            $player->update(['avatarUrl' => null, 'phone' => null, 'active' => false]);

            // ClubMembership is intentionally kept so the club admin can
            // still see this player under "Eliminados".
            User::whereKey($player->userId)->update([
                'isActivated' => false,
                'email' => "deleted_{$player->id}@deleted.local",
                'username' => null,
                'password' => $deadHash,
            ]);
        });

        return ['message' => 'Jugador eliminado'];
    }

    public function restore(string $id, ?string $email): Player
    {
        if (! $email || ! trim($email)) {
            throw self::error('Se requiere un email válido para restaurar el jugador', 400);
        }

        $email = trim($email);
        $player = Player::with('user')->find($id);

        if (! $player) {
            throw self::error('Jugador no encontrado', 404);
        }

        if ($player->active) {
            throw self::error('El jugador ya está activo', 400);
        }

        $existing = User::where('email', $email)->where('id', '!=', $player->userId)->exists();

        if ($existing) {
            throw self::error('Ese email ya está en uso por otro usuario', 400);
        }

        DB::transaction(function () use ($player, $email) {
            $player->update(['active' => true]);
            User::whereKey($player->userId)->update(['email' => $email, 'isActivated' => false]);
        });

        return Player::with('user:id,email,role,username,isActivated')->find($id);
    }

    /** @return array{imported:int, errors:array, results:array} */
    public function importCsv(UploadedFile $file): array
    {
        $csv = Reader::createFromPath($file->getRealPath(), 'r');
        $csv->setHeaderOffset(0);

        $results = [];

        foreach ($csv->getRecords() as $row) {
            try {
                // CSV template still has one "name" column (not
                // changed — external tooling/spreadsheets already
                // built against it), split here so firstName/lastName
                // land populated same as every other creation path.
                $parts = NameHelper::split($row['name'] ?? null);

                $result = $this->auth->invite([
                    'email' => $row['email'] ?? null,
                    'firstName' => $parts['firstName'],
                    'lastName' => $parts['lastName'],
                    'phone' => $row['phone'] ?? null,
                    'level' => (int) ($row['level'] ?? 1) ?: 1,
                ]);
                $results[] = ['success' => true, 'player' => $result['player']];
            } catch (\Throwable $e) {
                $results[] = ['success' => false, 'email' => $row['email'] ?? null, 'error' => $e->getMessage()];
            }
        }

        return [
            'imported' => count(array_filter($results, fn ($r) => $r['success'])),
            'errors' => array_values(array_filter($results, fn ($r) => ! $r['success'])),
            'results' => $results,
        ];
    }
}
