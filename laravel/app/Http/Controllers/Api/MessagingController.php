<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Services\MessagingService;
use Illuminate\Http\Request;

class MessagingController extends Controller
{
    public function __construct(protected MessagingService $messaging) {}

    public function conversations(Request $request)
    {
        $type = $request->query('type', 'user');

        if (! in_array($type, ['user', 'club'], true)) {
            throw new ApiException("type debe ser 'user' o 'club'", 400);
        }

        return response()->json($this->messaging->listConversations($request->user(), $type));
    }

    public function startUserConversation(Request $request)
    {
        $conv = $this->messaging->startOrGetUserConversation($request->user(), $request->input('otherUserId'));

        return response()->json($conv, 201);
    }

    public function startClubConversation(Request $request)
    {
        $conv = $this->messaging->startOrGetClubConversation(
            $request->user(),
            $request->input('clubId'),
            $request->input('targetPlayerUserId'),
        );

        return response()->json($conv, 201);
    }

    public function messages(Request $request, string $id)
    {
        $conv = $this->messaging->findOwned($id, $request->user());

        return response()->json($this->messaging->getMessages($conv, $request->user()));
    }

    public function sendMessage(Request $request, string $id)
    {
        $conv = $this->messaging->findOwned($id, $request->user());

        return response()->json(
            $this->messaging->sendMessage($conv, $request->user(), (string) $request->input('body')),
            201
        );
    }

    public function unreadCount(Request $request)
    {
        return response()->json($this->messaging->unreadCounts($request->user()));
    }

    public function block(Request $request)
    {
        $this->messaging->block(
            $request->user(),
            (string) $request->input('targetType'),
            (string) $request->input('targetId'),
            $request->input('asClubId'),
        );

        return response()->json(['message' => 'Bloqueado']);
    }

    public function unblock(Request $request)
    {
        $this->messaging->unblock(
            $request->user(),
            (string) $request->input('targetType'),
            (string) $request->input('targetId'),
            $request->input('asClubId'),
        );

        return response()->json(['message' => 'Desbloqueado']);
    }

    public function blocked(Request $request)
    {
        return response()->json($this->messaging->listBlocked($request->user()));
    }
}
