<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Auth\AuthService;
use Illuminate\Http\Request;

/**
 * Thin controller mirroring backend/src/api/routes/auth.routes.js — all
 * logic lives in AuthService; this only extracts request data and picks
 * status codes exactly matching the original route handlers.
 */
class AuthController extends Controller
{
    public function __construct(protected AuthService $auth) {}

    public function checkUsername(Request $request, string $username)
    {
        return response()->json(
            $this->auth->checkUsername($username, $request->query('excludeUserId'))
        );
    }

    public function register(Request $request)
    {
        $result = $this->auth->register($request->only(['email', 'password', 'name', 'phone', 'level', 'username', 'joinToken']));

        return response()->json($result, 201);
    }

    public function login(Request $request)
    {
        return response()->json(
            $this->auth->login((string) $request->input('email'), $request->input('password'))
        );
    }

    public function verifyTwoFactor(Request $request)
    {
        return response()->json(
            $this->auth->verifyTwoFactor($request->input('userId'), $request->input('code'))
        );
    }

    public function activate(Request $request)
    {
        return response()->json(
            $this->auth->activate($request->input('token'), $request->input('password'))
        );
    }

    public function resendInvite(Request $request, string $userId)
    {
        return response()->json(
            $this->auth->resendInvite($userId, $request->boolean('sendEmail', true))
        );
    }

    public function createInviteCode(Request $request)
    {
        $result = $this->auth->createInviteCode(
            $request->attributes->get('jwt')->userId,
            $request->input('label'),
            (int) $request->input('maxUses', 1),
            (int) $request->input('days', 15),
        );

        return response()->json($result, 201);
    }

    public function listInviteCodes()
    {
        return response()->json($this->auth->listInviteCodes());
    }

    public function revokeInviteCode(string $id)
    {
        $this->auth->revokeInviteCode($id);

        return response()->json(['message' => 'Código revocado']);
    }

    public function validateInviteCode(string $token)
    {
        return response()->json($this->auth->validateInviteCode($token));
    }

    public function registerWithInvite(Request $request)
    {
        $result = $this->auth->registerWithInvite(
            $request->only(['inviteCode', 'name', 'email', 'password', 'username'])
        );

        return response()->json($result, 201);
    }

    public function verifyEmail(Request $request)
    {
        return response()->json($this->auth->verifyEmail($request->input('token')));
    }

    public function me(Request $request)
    {
        return response()->json($this->auth->me($request->attributes->get('jwt')->userId));
    }

    public function forgotPassword(Request $request)
    {
        return response()->json($this->auth->forgotPassword($request->input('email')));
    }

    public function resetPassword(Request $request)
    {
        return response()->json(
            $this->auth->resetPassword($request->input('token'), $request->input('newPassword'))
        );
    }

    public function changePassword(Request $request)
    {
        return response()->json($this->auth->changePassword(
            $request->attributes->get('jwt')->userId,
            $request->input('currentPassword'),
            $request->input('newPassword'),
        ));
    }

    public function updateUsername(Request $request)
    {
        return response()->json($this->auth->updateUsername(
            $request->attributes->get('jwt')->userId,
            $request->input('username'),
        ));
    }

    public function toggleTwoFactor(Request $request)
    {
        return response()->json($this->auth->toggleTwoFactor(
            $request->attributes->get('jwt')->userId,
            $request->boolean('enabled'),
        ));
    }

    public function updatePhone(Request $request)
    {
        return response()->json($this->auth->updatePhone(
            $request->attributes->get('jwt')->userId,
            $request->input('phone'),
        ));
    }

    public function updateEmail(Request $request)
    {
        return response()->json($this->auth->updateEmail(
            $request->attributes->get('jwt')->userId,
            $request->input('email'),
            $request->input('currentPassword'),
        ));
    }

    public function confirmEmailChange(Request $request)
    {
        return response()->json($this->auth->confirmEmailChange($request->input('token')));
    }
}
