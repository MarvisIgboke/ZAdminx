<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\RoleName;
use App\Exceptions\WorkflowException;
use App\Http\Requests\StoreDelegationRequest;
use App\Models\Delegation;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

/**
 * MD → GM approval delegation. Expiry is derived from the date window on
 * every check (WorkflowEngine::activeDelegationFor), so delegations expire
 * automatically without a cron. Every delegated decision is stamped.
 */
class DelegationController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    public function index(): JsonResponse
    {
        return response()->json(Delegation::with('delegator', 'delegate')->orderByDesc('id')->get());
    }

    public function store(StoreDelegationRequest $request): JsonResponse
    {
        $data = $request->validated();

        $delegator = User::findOrFail($data['delegator_id']);
        $delegate  = User::findOrFail($data['delegate_id']);

        if (! $delegator->hasRole(RoleName::MD)) {
            throw new WorkflowException('Only the MD may delegate approval authority.', 'DELEGATION_NOT_MD');
        }
        if (! $delegate->hasRole(RoleName::GENERAL_MANAGER)) {
            throw new WorkflowException('The MD may delegate to the General Manager only.', 'DELEGATION_NOT_GM');
        }

        $delegation = Delegation::create([
            'delegator_id' => $delegator->id,
            'delegate_id'  => $delegate->id,
            'starts_on'    => $data['starts_on'],
            'ends_on'      => $data['ends_on'],
            'reason'       => $data['reason'],
            'status'       => 'active',
        ]);

        $this->audit->log('delegation_created', "MD delegation to {$delegate->name} ({$data['starts_on']} → {$data['ends_on']}).");

        return response()->json($delegation->load('delegator', 'delegate'), 201);
    }

    public function revoke(int $delegation): JsonResponse
    {
        $model = Delegation::findOrFail($delegation);
        $model->forceFill(['status' => 'revoked', 'revoked_at' => now()])->save();

        $this->audit->log('delegation_revoked', "Delegation #{$model->id} revoked.");

        return response()->json($model);
    }
}
