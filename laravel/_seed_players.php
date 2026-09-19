<?php

use App\Enums\Role;
use App\Models\Player;
use App\Models\User;
use App\Support\NameHelper;
use Illuminate\Support\Facades\Hash;

// Top 20 men + top 20 women, current Premier Padel / FIP ranking.
$players = [
    // Men
    ['Arturo Coello', 'M'], ['Agustín Tapia', 'M'], ['Alejandro Galán', 'M'], ['Federico Chingotto', 'M'],
    ['Juan Lebron', 'M'], ['Leandro Augsburger', 'M'], ['Paquito Navarro', 'M'], ['Franco Stupaczuk', 'M'],
    ['Miguel Yanguas', 'M'], ['Jon Sanz', 'M'], ['Martín Di Nenno', 'M'], ['Coki Nieto', 'M'],
    ['Fran Guerrero', 'M'], ['Momo González', 'M'], ['Javier Leal', 'M'], ['Lucas Campagnolo', 'M'],
    ['Lucas Bergamini', 'M'], ['Eduardo Alonso', 'M'], ['Juan Tello', 'M'], ['Javier Garrido', 'M'],
    // Women
    ['Gemma Triay', 'F'], ['Delfina Brea', 'F'], ['Ariana Sánchez', 'F'], ['Beatriz González', 'F'],
    ['Paula Josemaría', 'F'], ['Claudia Fernández', 'F'], ['Andrea Ustero', 'F'], ['Martina Calvo', 'F'],
    ['Sofía Araújo', 'F'], ['Claudia Jensen', 'F'], ['Marta Ortega', 'F'], ['Tamara Icardo', 'F'],
    ['Alejandra Alonso', 'F'], ['Alejandra Salazar', 'F'], ['Marina Guinart', 'F'], ['Verónica Virseda', 'F'],
    ['Aranzazu Osoro', 'F'], ['Beatriz Caldera', 'F'], ['Carmen Goenaga', 'F'], ['Victoria Iglesias', 'F'],
];

function slug(string $s): string
{
    $s = mb_strtolower($s);
    $s = strtr($s, [
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ñ' => 'n', 'ü' => 'u',
    ]);
    $s = preg_replace('/[^a-z0-9]+/', '', $s);

    return $s;
}

$created = [];
$skipped = [];

foreach ($players as [$fullName, $gender]) {
    $parts = NameHelper::split($fullName);
    $emailLocal = slug($parts['firstName']).'.'.slug($parts['lastName']);
    $email = "{$emailLocal}@bonapinta.com";

    if (User::where('email', $email)->exists()) {
        $skipped[] = $email;

        continue;
    }

    $user = User::create([
        'email' => $email,
        'password' => Hash::make('123456'),
        'username' => $emailLocal,
        'isActivated' => true,
        'role' => Role::PLAYER,
    ]);

    Player::create([
        'userId' => $user->id,
        'name' => $fullName,
        'firstName' => $parts['firstName'],
        'lastName' => $parts['lastName'],
        'gender' => $gender,
        'level' => 1,
    ]);

    $created[] = $email;
}

echo json_encode(['created' => count($created), 'skipped' => count($skipped), 'createdEmails' => $created, 'skippedEmails' => $skipped]);
