<?php

namespace App\Services\Auth;

use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\InviteCode;
use App\Models\Player;
use App\Models\User;
use App\Services\Email\ResendMailer;
use App\Services\NotificationService;
use App\Support\NameHelper;
use App\Support\UsernameHelper;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Direct port of backend/src/api/routes/auth.routes.js. Method names
 * mirror the route handlers 1:1 to make the two easy to diff during the
 * migration's verification phase. Every thrown \DomainException carries
 * an HTTP status via getCode() (mirrors Express's `err.status`) — the
 * controller catches these and turns them into the exact same JSON error
 * bodies as the original routes.
 */
class AuthService
{
    public function __construct(
        protected TokenService $tokens,
        protected ResendMailer $mailer,
        protected NotificationService $notifications,
    ) {}

    protected static function error(string $message, int $status, array $extra = []): ApiException
    {
        return new ApiException($message, $status, $extra);
    }

    public function checkUsername(string $username, ?string $excludeUserId): array
    {
        $error = UsernameHelper::validateUsername($username);

        if ($error) {
            return ['available' => false, 'error' => $error];
        }

        $existing = User::where('username', $username)->first();

        if (! $existing || $existing->id === $excludeUserId) {
            return ['available' => true];
        }

        $suggestions = UsernameHelper::suggestUsernames($username, $username, $excludeUserId);

        return ['available' => false, 'error' => 'Nombre de usuario ya en uso', 'suggestions' => $suggestions];
    }

    /**
     * Security hardening (not an Express carry-over — the original
     * activated the account immediately with no email check at all).
     * Brought in line with the OTHER two sign-up paths
     * (registerWithInvite, the admin-invite activate() flow), both of
     * which already required proving ownership of the email before
     * the account could be used. This was the one inconsistent path —
     * used by TournamentJoin.jsx's inline "crear cuenta" tab — that let
     * someone register (and immediately join a tournament) with an
     * email they don't control. `joinToken`, when present, is a
     * tournament invite token (see TournamentJoin.jsx) purely so the
     * verification email can send them back to finish joining instead
     * of dropping them on the dashboard with the invite context lost.
     */
    public function register(array $data): array
    {
        $email = mb_strtolower(trim($data['email'] ?? ''));
        $password = $data['password'] ?? null;
        $name = $data['name'] ?? null;

        if (! $email || ! $password || ! $name) {
            throw self::error('Email, password y nombre son requeridos', 400);
        }

        if (! preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/', $email)) {
            throw self::error('Email inválido', 400);
        }

        if (mb_strlen($password) < 6) {
            throw self::error('Contraseña mínimo 6 caracteres', 400);
        }

        $username = $data['username'] ?? null;

        if ($username) {
            $usernameError = UsernameHelper::validateUsername($username);

            if ($usernameError) {
                throw self::error($usernameError, 400);
            }

            if (User::where('username', $username)->exists()) {
                $suggestions = UsernameHelper::suggestUsernames($name, $username);

                throw self::error('Nombre de usuario ya en uso', 400, ['suggestions' => $suggestions]);
            }
        }

        if (User::where('email', $email)->exists()) {
            throw self::error('Email ya registrado', 400);
        }

        $resolvedUsername = $username ?: UsernameHelper::generateAvailableUsername($name);
        $hashed = Hash::make($password);
        $verifyToken = bin2hex(random_bytes(32));
        $verifyExpiry = now()->addDays(15);

        DB::transaction(function () use ($email, $hashed, $resolvedUsername, $verifyToken, $verifyExpiry, $data, $name) {
            $user = User::create([
                'email' => $email,
                'password' => $hashed,
                'username' => $resolvedUsername,
                'phone' => $data['phone'] ?? null,
                'isActivated' => false,
                'activationToken' => $verifyToken,
                'activationTokenExpiry' => $verifyExpiry,
                'role' => Role::PLAYER,
            ]);

            // This flow's own form (TournamentJoin.jsx) still collects
            // one "Nombre completo" field on purpose — splitting it was
            // out of scope here — but firstName/lastName still need to
            // land populated so Profile.jsx isn't blank for these
            // players the first time they edit their own name.
            $parts = NameHelper::split($name);

            Player::create([
                'userId' => $user->id,
                'name' => $name,
                'firstName' => $parts['firstName'],
                'lastName' => $parts['lastName'],
                'phone' => $data['phone'] ?? null,
                'level' => $data['level'] ?? 1,
            ]);

            return $user;
        });

        $redirectTo = ! empty($data['joinToken']) ? '/tournaments/join/'.$data['joinToken'] : null;

        try {
            $this->mailer->sendEmailVerification($email, $name, $verifyToken, $redirectTo);
        } catch (\Throwable $e) {
            Log::error('Verify email error: '.$e->getMessage());
        }

        $this->devLink('VERIFY URL for '.$email.': '.config('bonapinta.frontend_url').'/verify-email?token='.$verifyToken);

        return ['message' => 'Cuenta creada. Revisa tu email para verificarla.'];
    }

    /**
     * Port of backend/src/services/AuthService.js's invite() — creates a
     * non-activated user + player and emails an activation link. Used by
     * PlayerController (admin "Invitar jugador") and CSV import.
     *
     * Silent bug fix: the Express caller (players.routes.js) only special
     *-cased the "Email ya registrado" message to a 400; an invalid email
     * fell through to the generic error middleware as an unintended 500.
     * Both cases are now consistently ApiException(400) here.
     *
     * @return array{id:string,email:string,username:?string,role:string,player:Player}
     */
    public function invite(array $data): array
    {
        $email = $data['email'] ?? '';
        $firstName = trim($data['firstName'] ?? '');
        $lastName = trim($data['lastName'] ?? '');
        $name = NameHelper::join($firstName, $lastName);

        if (! preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/', $email)) {
            throw self::error('Email inválido', 400);
        }

        if (! $firstName) {
            throw self::error('El nombre es requerido', 400);
        }

        if (User::where('email', $email)->exists()) {
            throw self::error('Email ya registrado', 400);
        }

        $resolvedUsername = $data['username'] ?? UsernameHelper::generateAvailableUsername($name);
        $placeholderHash = Hash::make(bin2hex(random_bytes(16)));
        $activationToken = bin2hex(random_bytes(32));
        $activationTokenExpiry = now()->addDays(15);

        $user = DB::transaction(function () use ($email, $placeholderHash, $resolvedUsername, $activationToken, $activationTokenExpiry, $name, $firstName, $lastName, $data) {
            $user = User::create([
                'email' => $email,
                'password' => $placeholderHash,
                'username' => $resolvedUsername,
                'isActivated' => false,
                'activationToken' => $activationToken,
                'activationTokenExpiry' => $activationTokenExpiry,
                'role' => Role::PLAYER,
            ]);

            Player::create([
                'userId' => $user->id,
                'name' => $name,
                'firstName' => $firstName,
                'lastName' => $lastName,
                'phone' => $data['phone'] ?? null,
                'level' => $data['level'] ?? 1,
            ]);

            return $user;
        });

        $user->load('player');

        $this->devLink('INVITE TOKEN for '.$email.': '.$activationToken);
        $this->devLink('Invite URL: '.config('bonapinta.frontend_url').'/activate?token='.$activationToken);

        try {
            $this->mailer->sendInvitation($email, $name, $activationToken);
        } catch (\Throwable $e) {
            Log::error('Invitation email error: '.$e->getMessage());
        }

        return [
            'id' => $user->id,
            'email' => $user->email,
            'username' => $user->username,
            'role' => $user->role->value,
            'player' => $user->player,
        ];
    }

    public function login(string $emailOrUsername, ?string $password): array
    {
        $email = mb_strtolower(trim($emailOrUsername));

        if (! $email || ! $password) {
            throw self::error('Email o usuario y contraseña requeridos', 400);
        }

        $user = User::where('email', $email)->orWhere('username', $email)->with('player')->first();

        if (! $user || ! Hash::check($password, $user->password)) {
            throw self::error('Credenciales incorrectas', 401);
        }

        if (! $user->isActivated) {
            throw self::error('Cuenta pendiente de activación. Revisa tu email.', 403, ['notActivated' => true]);
        }

        if ($user->twoFactorEnabled) {
            $code = (string) random_int(100000, 999999);
            $user->twoFactorCode = $code;
            $user->twoFactorExpiry = now()->addMinutes(10);
            $user->save();

            $this->mailer->send2FACode($user->email, $user->player?->name ?? 'Usuario', $code);

            return ['requires2FA' => true, 'userId' => $user->id];
        }

        $token = $this->tokens->issue($user);

        return ['token' => $token, 'user' => $user];
    }

    public function verifyTwoFactor(?string $userId, ?string $code): array
    {
        if (! $userId || ! $code) {
            throw self::error('Faltan datos', 400);
        }

        $user = User::with('player')->find($userId);

        if (! $user) {
            throw self::error('Usuario no encontrado', 404);
        }

        if (! $user->twoFactorCode || $user->twoFactorCode !== $code) {
            throw self::error('Codigo incorrecto', 401);
        }

        if (now()->greaterThan($user->twoFactorExpiry)) {
            throw self::error('Codigo expirado', 401);
        }

        $user->twoFactorCode = null;
        $user->twoFactorExpiry = null;
        $user->save();

        $token = $this->tokens->issue($user);

        return ['token' => $token, 'user' => $user];
    }

    public function activate(?string $token, ?string $password): array
    {
        if (! $token || ! $password) {
            throw self::error('Faltan datos', 400);
        }

        if (mb_strlen($password) < 6) {
            throw self::error('Mínimo 6 caracteres', 400);
        }

        $user = User::where('activationToken', $token)->with('player')->first();

        if (! $user) {
            throw self::error('Enlace de activación inválido', 400);
        }

        if (now()->greaterThan($user->activationTokenExpiry)) {
            throw self::error('El enlace ha expirado. Pide al admin que te reenvíe la invitación.', 400, ['expired' => true]);
        }

        $user->password = Hash::make($password);
        $user->isActivated = true;
        $user->activationToken = null;
        $user->activationTokenExpiry = null;
        $user->save();

        $jwtToken = $this->tokens->issue($user);

        return ['message' => 'Cuenta activada. ¡Bienvenido!', 'token' => $jwtToken, 'user' => $user];
    }

    public function resendInvite(string $userId, bool $sendEmail = true): array
    {
        $user = User::with('player')->find($userId);

        if (! $user) {
            throw self::error('Usuario no encontrado', 404);
        }

        if ($user->isActivated) {
            throw self::error('El usuario ya está activado', 400);
        }

        $token = bin2hex(random_bytes(32));
        $user->activationToken = $token;
        $user->activationTokenExpiry = now()->addDays(15);
        $user->save();

        $activationUrl = config('bonapinta.frontend_url').'/activate?token='.$token;

        if ($sendEmail) {
            try {
                $this->mailer->sendInvitation($user->email, $user->player?->name ?? 'Jugador', $token);
            } catch (\Throwable $e) {
                Log::error('Email error: '.$e->getMessage());
            }
        }

        $this->devLink('INVITE URL for '.$user->email.': '.$activationUrl);

        return ['message' => $sendEmail ? 'Invitación enviada por email' : 'Enlace generado', 'activationUrl' => $activationUrl];
    }

    public function createInviteCode(string $createdBy, ?string $label, int $maxUses = 1, int $days = 15): array
    {
        $token = bin2hex(random_bytes(24));

        $code = InviteCode::create([
            'token' => $token,
            'createdBy' => $createdBy,
            'label' => $label,
            'maxUses' => $maxUses,
            'expiresAt' => now()->addDays($days),
        ]);

        $inviteUrl = config('bonapinta.frontend_url').'/join?code='.$token;
        $this->devLink('INVITE CODE created: '.$inviteUrl);

        return array_merge($code->toArray(), ['inviteUrl' => $inviteUrl]);
    }

    public function listInviteCodes(): array
    {
        $base = config('bonapinta.frontend_url');

        return InviteCode::orderByDesc('createdAt')->get()
            ->map(fn ($c) => array_merge($c->toArray(), ['inviteUrl' => $base.'/join?code='.$c->token]))
            ->all();
    }

    public function revokeInviteCode(string $id): void
    {
        InviteCode::whereKey($id)->delete();
    }

    public function validateInviteCode(string $token): array
    {
        $code = InviteCode::where('token', $token)->first();

        if (! $code) {
            throw self::error('Código de invitación inválido', 404, ['invalid' => true]);
        }

        if ($code->expiresAt && now()->greaterThan($code->expiresAt)) {
            throw self::error('Este enlace ha expirado', 400, ['expired' => true]);
        }

        if ($code->uses >= $code->maxUses) {
            throw self::error('Este enlace ya ha sido utilizado', 400, ['used' => true]);
        }

        return ['valid' => true, 'label' => $code->label];
    }

    public function registerWithInvite(array $data): array
    {
        $inviteCode = $data['inviteCode'] ?? null;
        $name = $data['name'] ?? null;
        $password = $data['password'] ?? null;
        $username = $data['username'] ?? null;
        $email = mb_strtolower(trim($data['email'] ?? ''));

        if (! $inviteCode || ! $name || ! $email || ! $password) {
            throw self::error('Faltan campos obligatorios', 400);
        }

        if (! preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/', $email)) {
            throw self::error('Email inválido', 400);
        }

        if (mb_strlen($password) < 6) {
            throw self::error('Contraseña mínimo 6 caracteres', 400);
        }

        if ($username) {
            $usernameError = UsernameHelper::validateUsername($username);

            if ($usernameError) {
                throw self::error($usernameError, 400);
            }

            if (User::where('username', $username)->exists()) {
                $suggestions = UsernameHelper::suggestUsernames($name, $username);

                throw self::error('Nombre de usuario ya en uso', 400, ['suggestions' => $suggestions]);
            }
        }

        $code = InviteCode::where('token', $inviteCode)->first();

        if (! $code) {
            throw self::error('Código de invitación inválido', 400, ['invalid' => true]);
        }

        if ($code->expiresAt && now()->greaterThan($code->expiresAt)) {
            throw self::error('Este enlace de invitación ha expirado', 400, ['expired' => true]);
        }

        if ($code->uses >= $code->maxUses) {
            throw self::error('Este enlace ya ha sido utilizado', 400, ['used' => true]);
        }

        if (User::where('email', $email)->exists()) {
            throw self::error('Este email ya está registrado', 400);
        }

        $resolvedUsername = $username ?: UsernameHelper::generateAvailableUsername($name);
        $hashed = Hash::make($password);
        $verifyToken = bin2hex(random_bytes(32));
        $verifyExpiry = now()->addDays(15);

        $user = DB::transaction(function () use ($email, $hashed, $resolvedUsername, $verifyToken, $verifyExpiry, $name) {
            $user = User::create([
                'email' => $email,
                'password' => $hashed,
                'username' => $resolvedUsername,
                'isActivated' => false,
                'activationToken' => $verifyToken,
                'activationTokenExpiry' => $verifyExpiry,
                'role' => Role::PLAYER,
            ]);

            // Same as register() above: this form (JoinPage.jsx) still
            // collects one combined name field on purpose, split here
            // so firstName/lastName aren't blank on first profile edit.
            $parts = NameHelper::split($name);

            Player::create([
                'userId' => $user->id,
                'name' => $name,
                'firstName' => $parts['firstName'],
                'lastName' => $parts['lastName'],
                'level' => 1,
            ]);

            return $user;
        });

        $code->increment('uses');

        try {
            $this->mailer->sendEmailVerification($user->email, $name, $verifyToken);
        } catch (\Throwable $e) {
            Log::error('Verify email error: '.$e->getMessage());
        }

        $this->devLink('VERIFY URL for '.$email.': '.config('bonapinta.frontend_url').'/verify-email?token='.$verifyToken);

        return ['message' => 'Cuenta creada. Revisa tu email para verificarla.'];
    }

    public function verifyEmail(?string $token): array
    {
        if (! $token) {
            throw self::error('Token requerido', 400);
        }

        $user = User::where('activationToken', $token)->with('player')->first();

        if (! $user) {
            throw self::error('Enlace de verificación inválido', 400);
        }

        if (now()->greaterThan($user->activationTokenExpiry)) {
            throw self::error('El enlace ha expirado. Contacta al administrador.', 400, ['expired' => true]);
        }

        $user->isActivated = true;
        $user->activationToken = null;
        $user->activationTokenExpiry = null;
        $user->save();

        $jwtToken = $this->tokens->issue($user);

        return ['message' => '¡Email verificado! Bienvenido a Bonapinta.', 'token' => $jwtToken, 'user' => $user];
    }

    public function me(string $userId): User
    {
        return User::with('player')->findOrFail($userId);
    }

    public function forgotPassword(?string $email): array
    {
        if (! $email) {
            throw self::error('Email requerido', 400);
        }

        $user = User::where('email', $email)->with('player')->first();

        if ($user) {
            $token = bin2hex(random_bytes(32));
            $user->resetToken = $token;
            $user->resetTokenExpiry = now()->addHour();
            $user->save();

            try {
                $this->mailer->sendPasswordReset($user->email, $user->player?->name ?? 'Usuario', $token);
            } catch (\Throwable $e) {
                Log::error('Email error: '.$e->getMessage());
            }
        }

        // Deliberately the same response whether or not the user exists
        // — avoids email enumeration, matches auth.routes.js exactly.
        return ['message' => 'Si el email existe recibirás un enlace'];
    }

    public function resetPassword(?string $token, ?string $newPassword): array
    {
        if (! $token || ! $newPassword) {
            throw self::error('Faltan datos', 400);
        }

        if (mb_strlen($newPassword) < 6) {
            throw self::error('Minimo 6 caracteres', 400);
        }

        $user = User::where('resetToken', $token)->first();

        if (! $user) {
            throw self::error('Token invalido', 400);
        }

        if (now()->greaterThan($user->resetTokenExpiry)) {
            throw self::error('Token expirado', 400);
        }

        $user->password = Hash::make($newPassword);
        $user->resetToken = null;
        $user->resetTokenExpiry = null;
        $user->save();

        return ['message' => 'Contraseña actualizada correctamente'];
    }

    public function changePassword(string $userId, ?string $currentPassword, ?string $newPassword): array
    {
        if (! $currentPassword || ! $newPassword) {
            throw self::error('Faltan datos', 400);
        }

        if (mb_strlen($newPassword) < 6) {
            throw self::error('Minimo 6 caracteres', 400);
        }

        $user = User::findOrFail($userId);

        if (! Hash::check($currentPassword, $user->password)) {
            throw self::error('Contrasena actual incorrecta', 400);
        }

        $user->password = Hash::make($newPassword);
        $user->save();

        return ['message' => 'Contrasena actualizada correctamente'];
    }

    public function updateUsername(string $userId, ?string $username): array
    {
        if (! $username) {
            throw self::error('username requerido', 400);
        }

        $error = UsernameHelper::validateUsername($username);

        if ($error) {
            throw self::error($error, 400);
        }

        $taken = User::where('username', $username)->first();

        if ($taken && $taken->id !== $userId) {
            $suggestions = UsernameHelper::suggestUsernames($username, $username, $userId);

            throw self::error('Nombre de usuario ya en uso', 400, ['suggestions' => $suggestions]);
        }

        User::whereKey($userId)->update(['username' => $username]);

        return ['message' => 'Nombre de usuario actualizado', 'username' => $username];
    }

    public function toggleTwoFactor(string $userId, bool $enabled): array
    {
        User::whereKey($userId)->update(['twoFactorEnabled' => $enabled]);

        return ['message' => $enabled ? '2FA activado' : '2FA desactivado', 'twoFactorEnabled' => $enabled];
    }

    public function updatePhone(string $userId, ?string $phone): array
    {
        User::whereKey($userId)->update(['phone' => $phone]);
        Player::where('userId', $userId)->update(['phone' => $phone]);

        return ['message' => 'Telefono actualizado', 'phone' => $phone];
    }

    /**
     * Security hardening found while reviewing Profile.jsx (not an
     * Express carry-over — the original had no password check here
     * either, but changing the email you log in with is sensitive
     * enough to deserve the same "confirm with your current password"
     * step the password-change endpoint already requires; silently
     * porting the gap forward wasn't worth it).
     *
     * Second hardening pass: a password check alone only proves it's
     * really you — it doesn't prove you own the NEW address, so a typo
     * (or someone else's inbox) would otherwise take over silently.
     * This now mirrors the exact pattern already used at account
     * creation (registerWithInvite → sendEmailVerification →
     * verifyEmail): `email` is left untouched, the requested address
     * is held in `pendingEmail` behind its own token, and only
     * confirmEmailChange() (below), reached by clicking the link sent
     * to that NEW address, actually flips the column.
     */
    public function updateEmail(string $userId, ?string $email, ?string $currentPassword): array
    {
        $email = mb_strtolower(trim((string) $email));

        if (! $email || ! preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/', $email)) {
            throw self::error('Email inválido', 400);
        }

        $user = User::with('player')->findOrFail($userId);

        if (! $currentPassword || ! Hash::check($currentPassword, $user->password)) {
            throw self::error('Contraseña actual incorrecta', 400);
        }

        if ($email === mb_strtolower($user->email)) {
            throw self::error('Ese ya es tu email actual', 400);
        }

        $taken = User::where('email', $email)->where('id', '!=', $userId)->first();

        if ($taken) {
            throw self::error('Este email ya está en uso', 409);
        }

        $token = bin2hex(random_bytes(32));

        $user->pendingEmail = $email;
        $user->pendingEmailToken = $token;
        $user->pendingEmailTokenExpiry = now()->addDays(15);
        $user->save();

        try {
            $this->mailer->sendEmailChangeVerification($email, $user->player?->name ?? 'Usuario', $token);
        } catch (\Throwable $e) {
            Log::error('Email change verification error: '.$e->getMessage());
        }

        $this->devLink('CONFIRM EMAIL CHANGE URL for '.$email.': '.config('bonapinta.frontend_url').'/confirm-email-change?token='.$token);

        // Not just the fading toast on the Profile page — this is the
        // fix for "the message disappears too fast" — the notification
        // stays in the user's notification center until they read/
        // archive it, so missing the toast doesn't lose the reminder.
        $this->notifications->create(
            $userId,
            'email_change_requested',
            'Confirma tu nuevo email',
            "Pediste cambiar tu email de acceso a {$email}. Revisa esa bandeja de entrada y confirma el cambio — hasta que lo hagas, tu email actual sigue funcionando.",
        );

        return ['message' => "Revisa {$email} y confirma el cambio. Tu email actual sigue activo hasta entonces.", 'pendingEmail' => $email];
    }

    public function confirmEmailChange(?string $token): array
    {
        if (! $token) {
            throw self::error('Token requerido', 400);
        }

        $user = User::where('pendingEmailToken', $token)->with('player')->first();

        if (! $user) {
            throw self::error('Enlace de confirmación inválido', 400);
        }

        if (now()->greaterThan($user->pendingEmailTokenExpiry)) {
            throw self::error('El enlace ha expirado. Vuelve a solicitar el cambio de email desde tu perfil.', 400, ['expired' => true]);
        }

        // Someone else could have taken the requested address in the
        // 15 days since it was requested — re-check right before
        // committing rather than trusting the check from request time.
        if (User::where('email', $user->pendingEmail)->where('id', '!=', $user->id)->exists()) {
            throw self::error('Este email ya está en uso', 409);
        }

        $newEmail = $user->pendingEmail;
        $user->email = $newEmail;
        $user->pendingEmail = null;
        $user->pendingEmailToken = null;
        $user->pendingEmailTokenExpiry = null;
        $user->save();

        $this->notifications->create(
            $user->id,
            'email_change_confirmed',
            'Email actualizado',
            "Tu email de acceso ahora es {$newEmail}.",
        );

        return ['message' => 'Email actualizado correctamente', 'email' => $newEmail];
    }

    /**
     * Local-only convenience: with MAIL_MAILER=log nobody receives the
     * email, so the link is written to the log instead. These URLs carry
     * live tokens (account activation, email verification, invites), so
     * they must never reach a production log.
     */
    protected function devLink(string $message): void
    {
        if (! app()->isProduction()) {
            Log::info($message);
        }
    }
}
