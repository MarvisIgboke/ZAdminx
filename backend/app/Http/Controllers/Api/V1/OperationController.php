<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\WorkflowDecision;
use App\Http\Requests\WorkflowDecisionRequest;
use App\Http\Resources\OperationResource;
use App\Models\OperationModel;
use App\Services\AuditService;
use App\Services\WorkflowEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Routing\Controller;

/**
 * Shared backbone for the five operation controllers: listing with filters,
 * detail with full workflow payload, audit history, and the
 * approve / reject / return decision endpoints.
 */
abstract class OperationController extends Controller
{
    /** @return class-string<OperationModel> */
    abstract protected function modelClass(): string;

    public function __construct(
        protected readonly WorkflowEngine $engine,
        protected readonly AuditService $audit,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = $this->modelClass()::query()
            ->with(['facility', 'initiator', 'assignee'])
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->when($request->current_stage, fn ($q, $s) => $q->where('current_stage', $s))
            ->when($request->facility_id, fn ($q, $f) => $q->where('facility_id', $f))
            ->when($request->meter_number, fn ($q, $m) => $q->where('meter_number', 'like', "%{$m}%"))
            ->when($request->txn, fn ($q, $t) => $q->where('txn', 'like', "%{$t}%"))
            ->when($request->from, fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
            ->when($request->to, fn ($q, $d) => $q->whereDate('created_at', '<=', $d))
            ->orderByDesc('id');

        return OperationResource::collection($query->paginate(min((int) $request->per_page ?: 15, 50)));
    }

    public function show(int $id): OperationResource
    {
        $operation = $this->findOrFail($id)
            ->load([
                'facility', 'meter', 'initiator', 'assignee',
                'steps.decider', 'steps.comment.user',
                'comments.user', 'attachments.capturer', 'gpsRecords',
            ]);

        return new OperationResource($operation);
    }

    public function history(int $id): JsonResponse
    {
        $operation = $this->findOrFail($id);

        return response()->json([
            'steps'   => $operation->steps()->with('decider', 'comment')->get(),
            'audit'   => \App\Models\AuditLog::where('transaction_id', $operation->txn)
                ->orWhere(fn ($q) => $q->where('auditable_type', $operation->getMorphClass())->where('auditable_id', $operation->id))
                ->orderByDesc('id')->limit(200)->get(),
            'api'     => $operation->apiRequests()->with('response')->get(),
        ]);
    }

    public function approve(Request $request, int $id): OperationResource
    {
        return $this->decide($id, WorkflowDecision::APPROVE, $request);
    }

    public function reject(Request $request, int $id): OperationResource
    {
        return $this->decide($id, WorkflowDecision::REJECT, $request);
    }

    public function return(Request $request, int $id): OperationResource
    {
        return $this->decide($id, WorkflowDecision::RETURN, $request);
    }

    protected function decide(int $id, WorkflowDecision $decision, Request $request): OperationResource
    {
        $payload = app(WorkflowDecisionRequest::class)->validated();
        $operation = $this->findOrFail($id);

        $operation = $this->engine->decide(
            $operation,
            $decision,
            $request->user(),
            $payload['comment'],
            $payload['idempotency_key'] ?? null,
        );

        return new OperationResource($operation->load('steps.decider'));
    }

    protected function findOrFail(int $id): OperationModel
    {
        return $this->modelClass()::findOrFail($id);
    }
}
