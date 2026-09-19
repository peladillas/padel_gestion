<?php

namespace App\Console\Commands;

use App\Enums\Role;
use App\Models\Player;
use App\Models\User;
use App\Support\UsernameHelper;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Bootstraps the first SUPER_ADMIN on an empty database — there is no
 * public sign-up that can create one, and no seeded credentials (the old
 * setup documented real passwords in the repo; this replaces that).
 */
class CreateAdmin extends Command
{
    protected $signature = 'bonapinta:create-admin {email} {--name= : Nombre visible} {--password= : Si se omite, se pide por consola}';

    protected $description = 'Crea (o promueve) una cuenta SUPER_ADMIN activada';

    public function handle(): int
    {
        $email = strtolower(trim($this->argument('email')));

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('Email inválido.');

            return self::FAILURE;
        }

        $existing = User::where('email', $email)->first();

        if ($existing) {
            $existing->update(['role' => Role::SUPER_ADMIN, 'isActivated' => true]);
            $this->info("La cuenta {$email} ya existía: ahora es SUPER_ADMIN (la contraseña no se modificó).");

            return self::SUCCESS;
        }

        $password = $this->option('password') ?: $this->secret('Contraseña (mín. 8 caracteres)');

        if (strlen((string) $password) < 8) {
            $this->error('La contraseña debe tener al menos 8 caracteres.');

            return self::FAILURE;
        }

        $name = $this->option('name') ?: ucfirst(explode('@', $email)[0]);

        DB::transaction(function () use ($email, $password, $name) {
            $user = User::create([
                'email' => $email,
                'password' => Hash::make($password),
                'username' => UsernameHelper::generateAvailableUsername($name),
                'isActivated' => true,
                'role' => Role::SUPER_ADMIN,
            ]);

            Player::create(['userId' => $user->id, 'name' => $name, 'level' => 1]);
        });

        $this->info("SUPER_ADMIN creado: {$email}");

        return self::SUCCESS;
    }
}
