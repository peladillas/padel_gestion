<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\NotificationService;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function __construct(protected NotificationService $notifications) {}

    public function index(Request $request)
    {
        return response()->json(
            $this->notifications->listForUser($request->user()->id, $request->boolean('archived'))
        );
    }

    public function unreadCount(Request $request)
    {
        return response()->json(['count' => $this->notifications->unreadCount($request->user()->id)]);
    }

    public function markRead(Request $request, string $id)
    {
        return response()->json($this->notifications->markRead($id, $request->user()->id));
    }

    public function markAllRead(Request $request)
    {
        $this->notifications->markAllRead($request->user()->id);

        return response()->json(['message' => 'Notificaciones marcadas como leídas']);
    }

    public function archive(Request $request, string $id)
    {
        return response()->json($this->notifications->archive($id, $request->user()->id));
    }

    public function unarchive(Request $request, string $id)
    {
        return response()->json($this->notifications->unarchive($id, $request->user()->id));
    }
}
