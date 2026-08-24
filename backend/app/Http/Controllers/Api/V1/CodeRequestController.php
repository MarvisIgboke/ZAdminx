<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\CreateCodeRequest;
use App\Enums\OperationStatus;
use App\Enums\OperationType;
use App\Exceptions\WorkflowException;
use App\Http\Requests\StoreCodeRequest;
use App\Http\Resources\OperationResource;
use App\Models\ClearCodeRequest;
use App\Models\TamperCodeRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Tamper Code + Clear Code share one workflow shape; this controller serves
 * both under their distinct routes and permissions.
 */
class CodeRequestController extends OperationController
{
    // The base class needs one default; tamper is it. show/history/decisions
    // route through type-specific wrappers below.
    protected function modelClass(): string
    {
        return TamperCodeRequest::class;
    }

    // ------------------------------------------------------------ Tamper
    public function indexTamper(Request $request): AnonymousResourceCollection
    {
        return $this->listType($request, TamperCodeRequest::class);
    }

    public function storeTamper(StoreCodeRequest $request, CreateCodeRequest $action): OperationResource
    {
        $op = $action->execute(OperationType::TAMPER_CODE, $request->user(), $request->validated());

        return new OperationResource($op->load('steps'));
    }

    public function showTamper(int $request): OperationResource
    {
        return new OperationResource(TamperCodeRequest::with(['facility', 'initiator', 'steps.decider', 'comments.user', 'attachments'])->findOrFail($request));
    }

    public function revealTamper(Request $request, int $id): JsonResponse
    {
        return $this->reveal(TamperCodeRequest::findOrFail($id), 'tamper', $request);
    }

    public function approveTamper(Request $request, int $id): OperationResource
    {
        return $this->decideType(TamperCodeRequest::class, $id, \App\Enums\WorkflowDecision::APPROVE, $request);
    }

    public function rejectTamper(Request $request, int $id): OperationResource
    {
        return $this->decideType(TamperCodeRequest::class, $id, \App\Enums\WorkflowDecision::REJECT, $request);
    }

    public function returnTamper(Request $request, int $id): OperationResource
    {
        return $this->decideType(TamperCodeRequest::class, $id, \App\Enums\WorkflowDecision::RETURN, $request);
    }

    // ------------------------------------------------------------ Clear
    public function indexClear(Request $request): AnonymousResourceCollection
    {
        return $this->listType($request, ClearCodeRequest::class);
    }

    public function storeClear(StoreCodeRequest $request, CreateCodeRequest $action): OperationResource
    {
        $op = $action->execute(OperationType::CLEAR_CODE, $request->user(), $request->validated());

        return new OperationResource($op->load('steps'));
    }

    public function showClear(int $request): OperationResource
    {
        return new OperationResource(ClearCodeRequest::with(['facility', 'initiator', 'steps.decider', 'comments.user', 'attachments'])->findOrFail($request));
    }

    public function revealClear(Request $request, int $id): JsonResponse
    {
        return $this->reveal(ClearCodeRequest::findOrFail($id), 'clear', $request);
    }

    public function approveClear(Request $request, int $id): OperationResource
    {
        return $this->decideType(ClearCodeRequest::class, $id, \App\Enums\WorkflowDecision::APPROVE, $request);
    }

    public function rejectClear(Request $request, int $id): OperationResource
    {
        return $this->decideType(ClearCodeRequest::class, $id, \App\Enums\WorkflowDecision::REJECT, $request);
    }

    public function returnClear(Request $request, int $id): OperationResource
    {
        return $this->decideType(ClearCodeRequest::class, $id, \App\Enums\WorkflowDecision::RETURN, $request);
    }

    // ------------------------------------------------------------ Shared
    private function listType(Request $request, string $class): AnonymousResourceCollection
    {
        $query = $class::query()
            ->with(['facility', 'initiator'])
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->when($request->meter_number, fn ($q, $m) => $q->where('meter_number', 'like', "%{$m}%"))
            ->orderByDesc('id');

        return OperationResource::collection($query->paginate(min((int) $request->per_page ?: 15, 50)));
    }

    private function decideType(string $class, int $id, \App\Enums\WorkflowDecision $decision, Request $request): OperationResource
    {
        $payload = app(\App\Http\Requests\WorkflowDecisionRequest::class)->validated();

        $operation = $this->engine->decide(
            $class::findOrFail($id),
            $decision,
            $request->user(),
            $payload['comment'],
            $payload['idempotency_key'] ?? null,
        );

        return new OperationResource($operation);
    }

    /**
     * Secure code disclosure: masked everywhere else; reveal is audited.
     * Codes exist only after ZVend success.
     */
    private function reveal($operation, string $kind, Request $request): JsonResponse
    {
        if (! in_array($operation->status, [OperationStatus::ZVEND_SUCCESS->value, OperationStatus::COMPLETED->value], true)) {
            throw new WorkflowException('The code has not been issued yet (ZVend pending).', 'CODE_NOT_ISSUED');
        }

        $code = $operation->issued_code;

        if (! $code) {
            throw new WorkflowException('No code is stored for this record.', 'CODE_NOT_ISSUED');
        }

        $this->audit->log("{$kind}_code_reveal", "{$operation->txn} — {$kind} code revealed.", $operation, $operation->txn);

        return response()->json([
            'transaction' => $operation->txn,
            'code'        => trim(chunk_split($code, 4, ' ')),
            'issued_at'   => $operation->zvend_called_at,
        ]);
    }
}
