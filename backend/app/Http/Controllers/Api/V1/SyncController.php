<?php

namespace App\Http\Controllers\Api\V1;

use App\Jobs\SyncZVendDataJob;
use App\Models\SyncLog;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class SyncController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    /** Manual refresh; the scheduler can dispatch the same job on a cron. */
    public function zvend(Request $request): JsonResponse
    {
        SyncZVendDataJob::dispatch($request->user()->id)->afterCommit();
        $this->audit->log('sync_requested', 'POST /sync/zvend — catalog refresh queued.');

        return response()->json([
            'message' => 'ZVend synchronization queued.',
            'recent'  => SyncLog::latest('id')->limit(5)->get(),
        ], 202);
    }
}
