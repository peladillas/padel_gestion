<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TournamentType;

class TournamentTypeController extends Controller
{
    public function index()
    {
        return response()->json(
            TournamentType::where('is_active', true)->orderBy('label')->get()
        );
    }
}
