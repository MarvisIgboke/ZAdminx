<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * Append-only audit writer. AuditLog has no updated_at and no update/delete
 * code paths exist anywhere in the application.
 */
class AuditService
{
    public function log(
        string $action,
        ?string $detail = null,
        ?Model $auditable = null,
        ?string $transactionId = null,
    ): AuditLog {
        $user = Auth::user();
        $request = request();

        return AuditLog::create([
            'user_id'        => $user?->id,
            'user_name'      => $user?->name ?? 'system',
            'action'         => $action,
            'auditable_type' => $auditable?->getMorphClass(),
            'auditable_id'   => $auditable?->getKey(),
            'transaction_id' => $transactionId,
            'detail'         => $detail,
            'ip_address'     => $request?->ip(),
            'user_agent'     => $request?->userAgent(),
        ]);
    }
}
