<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\ApiRequest;
use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Read-only log endpoints. Neither log type exposes delete/update routes —
 * audit records are immutable by design, and API logs never contain secrets
 * (sanitized at write time by ZVendApiService).
 */
class LogController extends Controller
{
    public function apiLogs(Request $request)
    {
        return ApiRequest::query()
            ->with('response', 'user')
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->when($request->endpoint, fn ($q, $e) => $q->where('endpoint', 'like', "%{$e}%"))
            ->when($request->transaction_id, fn ($q, $t) => $q->where('transaction_id', $t))
            ->when($request->from, fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('created_at', '<=', $d))
            ->orderByDesc('id')
            ->paginate(min((int) $request->per_page ?: 25, 100));
    }

    public function auditLogs(Request $request)
    {
        return AuditLog::query()
            ->when($request->action, fn ($q, $a) => $q->where('action', 'like', "%{$a}%"))
            ->when($request->user_id, fn ($q, $u) => $q->where('user_id', $u))
            ->when($request->transaction_id, fn ($q, $t) => $q->where('transaction_id', $t))
            ->when($request->from, fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('created_at', '<=', $d))
            ->orderByDesc('id')
            ->paginate(min((int) $request->per_page ?: 25, 100));
    }
}
