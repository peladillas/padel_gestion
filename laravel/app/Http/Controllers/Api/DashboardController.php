<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DashboardService;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(protected DashboardService $dashboard) {}

    public function admin()
    {
        return response()->json($this->dashboard->admin());
    }

    public function player(Request $request)
    {
        return response()->json($this->dashboard->player($request->user()->id));
    }
}
