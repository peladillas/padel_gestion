<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Services\PlayerService;
use Illuminate\Http\Request;

/**
 * Thin controller mirroring backend/src/api/routes/players.routes.js.
 */
class PlayerController extends Controller
{
    public function __construct(protected PlayerService $players) {}

    public function updateMe(Request $request)
    {
        return response()->json($this->players->updateMe(
            $request->user()->id,
            $request->only(['firstName', 'lastName', 'phone', 'birthDate', 'gender', 'dominantHand', 'position']),
        ));
    }

    public function updatePrivacy(Request $request)
    {
        return response()->json($this->players->updatePrivacy(
            $request->user()->id,
            $request->only(['isPublic', 'showStats', 'showMatches', 'showContact']),
        ));
    }

    public function updateMyClub(Request $request)
    {
        return response()->json($this->players->updateMyClub($request->user()->id, $request->input('clubId')));
    }

    public function invite(Request $request)
    {
        $result = $this->players->invite($request->only(['email', 'firstName', 'lastName', 'phone', 'level', 'username']));

        return response()->json($result, 201);
    }

    public function clubPlayers(Request $request)
    {
        return response()->json($this->players->getClubPlayers($request->user()->id));
    }

    public function clubMembers(Request $request)
    {
        return response()->json($this->players->getClubMembers($request->user()->id, $request->user()->role));
    }

    public function createClubPlayer(Request $request)
    {
        $result = $this->players->createClubPlayer(
            $request->user()->id,
            $request->only(['firstName', 'lastName', 'email', 'username', 'password', 'level', 'phone']),
        );

        return response()->json($result, 201);
    }

    public function search(Request $request)
    {
        return response()->json($this->players->search($request->query('q'), $request->query('clubId')));
    }

    public function publicProfile(Request $request, string $id)
    {
        return response()->json($this->players->publicProfile($id, $request->user()));
    }

    public function index()
    {
        return response()->json($this->players->all());
    }

    public function show(string $id)
    {
        return response()->json($this->players->find($id));
    }

    public function update(Request $request, string $id)
    {
        return response()->json($this->players->adminUpdate(
            $id,
            $request->user(),
            $request->only(['firstName', 'lastName', 'phone', 'level', 'birthDate', 'gender', 'dominantHand', 'position', 'username', 'email']),
        ));
    }

    public function updatePassword(Request $request, string $id)
    {
        return response()->json(
            $this->players->adminUpdatePassword($id, $request->user(), $request->input('password'))
        );
    }

    public function destroy(string $id)
    {
        return response()->json($this->players->softDelete($id));
    }

    public function restore(Request $request, string $id)
    {
        return response()->json($this->players->restore($id, $request->input('email')));
    }

    public function import(Request $request)
    {
        return response()->json($this->players->importCsv($request->file('file')));
    }
}
