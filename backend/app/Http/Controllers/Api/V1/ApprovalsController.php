<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OperationType;
use App\Models\User;
use App\Models\WorkflowStep;
use App\Services\WorkflowEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Relation;

/**
 * The approval center queue: records whose CURRENT step is owned by the
 * signed-in user's role (MD stage also matches a delegated GM). Approvers
 * only ever see records they are authorized to decide.
 */
class ApprovalsController extends Controller
{
    public function index(Request $request, WorkflowEngine $engine): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $roles = $user->roles->pluck('name');

        // A delegated GM also owns MD-stage records.
        $stageRoles = collect($roles);
        if ($engine->activeDelegationFor($user)) {
            $stageRoles->push('MD');
        }

        $items = collect();

        foreach (OperationType::cases() as $type) {
            if ($request->filled('type') && $request->type !== $type->value) {
                continue;
            }

            $class = Relation::morphMap()[$type->value];

            $operations = $class::query()
                ->with('facility', 'initiator')
                ->whereIn('status', ['PENDING', 'ZVEND_SUCCESS', 'RETURNED'])
                ->get();

            foreach ($operations as $operation) {
                $step = WorkflowStep::where('operation_type', $type->value)
                    ->where('operation_id', $operation->id)
                    ->where('is_current', true)
                    ->first();

                if (! $step) {
                    continue;
                }

                $mine = match (true) {
                    $step->role === 'INITIATOR' => (int) $operation->initiator_id === $user->id,
                    default                      => $stageRoles->contains($step->role),
                };

                if ($mine) {
                    $items->push([
                        'operation'      => $type->value,
                        'label'          => $type->label(),
                        'id'             => $operation->id,
                        'txn'            => $operation->txn,
                        'meter_number'   => $operation->meter_number,
                        'facility'       => $operation->facility?->name,
                        'initiator'      => $operation->initiator?->name,
                        'current_stage'  => $step->stage_label,
                        'status'         => $operation->status,
                        'age_hours'      => round((now()->timestamp - strtotime($operation->updated_at)) / 3600, 1),
                        'delegated'      => $step->role === 'MD' && ! $user->hasRole(\App\Enums\RoleName::MD),
                    ]);
                }
            }
        }

        return response()->json([
            'data'  => $items->sortByDesc('age_hours')->values(),
            'total' => $items->count(),
        ]);
    }
}
