<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OperationType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Relation;

/**
 * Cross-operation reporting dataset. The frontend renders charts and builds
 * CSV/Excel/PDF exports from this payload.
 */
class ReportController extends Controller
{
    public function operations(Request $request): JsonResponse
    {
        $rows = collect();

        foreach (OperationType::cases() as $type) {
            if ($request->filled('type') && $request->type !== $type->value) {
                continue;
            }

            $class = Relation::morphMap()[$type->value];

            $class::query()
                ->with('facility', 'initiator')
                ->when($request->facility_id, fn ($q, $f) => $q->where('facility_id', $f))
                ->when($request->status, fn ($q, $s) => $q->where('status', $s))
                ->when($request->meter_number, fn ($q, $m) => $q->where('meter_number', 'like', "%{$m}%"))
                ->when($request->from, fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
                ->when($request->to, fn ($q, $d) => $q->whereDate('created_at', '<=', $d))
                ->orderByDesc('created_at')
                ->limit(500)
                ->get()
                ->each(fn ($op) => $rows->push([
                    'operation'    => $type->value,
                    'txn'          => $op->txn,
                    'meter_number' => $op->meter_number,
                    'facility'     => $op->facility?->name,
                    'initiator'    => $op->initiator?->name,
                    'status'       => $op->status,
                    'stage'        => $op->current_stage,
                    'created_at'   => $op->created_at,
                    'updated_at'   => $op->updated_at,
                ]));
        }

        $rows = $rows->sortByDesc('created_at')->values();

        return response()->json([
            'data'    => $rows,
            'summary' => [
                'total'     => $rows->count(),
                'completed' => $rows->where('status', 'COMPLETED')->count(),
                'rejected'  => $rows->where('status', 'REJECTED')->count(),
                'in_flight' => $rows->whereNotIn('status', ['COMPLETED', 'REJECTED', 'CANCELLED'])->count(),
            ],
        ]);
    }
}
