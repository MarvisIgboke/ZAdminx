<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\AppNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        return AppNotification::query()
            ->for($request->user())
            ->when($request->unread !== null && $request->boolean('unread'), fn ($q) => $q->whereNull('read_at'))
            ->orderByDesc('created_at')
            ->paginate(min((int) $request->per_page ?: 20, 50));
    }

    public function markRead(Request $request, string $notification): JsonResponse
    {
        $note = AppNotification::for($request->user())->findOrFail($notification);
        $note->forceFill(['read_at' => now()])->save();

        return response()->json(['read' => true]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $count = AppNotification::for($request->user())->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['read' => $count]);
    }
}
