<?php
use App\Enums\Role;
use App\Models\Player;
use App\Models\User;
use App\Services\Auth\TokenService;
use Illuminate\Support\Facades\Hash;

$admin = User::where('email', 'loga.dani@gmail.com')->first();
$token = app(TokenService::class)->issue($admin);

$levels = [1, 3, 5, 7, 10];
$ids = [];
foreach ($levels as $i => $level) {
    $u = User::create(['email' => "pairverify{$i}@bonapinta.local", 'password' => Hash::make('x'), 'username' => "pairverify{$i}", 'isActivated' => true, 'role' => Role::PLAYER]);
    $p = Player::create(['userId' => $u->id, 'name' => "PairVerify L{$level}", 'level' => $level]);
    $ids[] = $p->id;
}

echo json_encode(['token' => $token, 'playerIds' => $ids]);
