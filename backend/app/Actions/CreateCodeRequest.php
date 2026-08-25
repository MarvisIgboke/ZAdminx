<?php

namespace App\Actions;

use App\Enums\OperationStatus;
use App\Enums\OperationType;
use App\Models\ClearCodeRequest;
use App\Models\Meter;
use App\Models\OperationModel;
use App\Models\TamperCodeRequest;
use App\Models\User;
use App\Services\TransactionIdService;
use App\Services\WorkflowEngine;

/**
 * Tamper / Clear code request initiation. Secretary enters the meter number
 * manually; Technical Man arrives here after a barcode scan (the scan match
 * itself is validated client-side and re-validated by SubmitFieldCapture
 * semantics — the meter must exist in the registry).
 */
class CreateCodeRequest
{
    public function __construct(
        private readonly WorkflowEngine $engine,
        private readonly TransactionIdService $txns,
    ) {}

    public function execute(OperationType $type, User $initiator, array $data): OperationModel
    {
        $meterNumber = trim((string) $data['meter_number']);
        $meter = Meter::where('meter_number', $meterNumber)->first();

        $class = $type === OperationType::TAMPER_CODE ? TamperCodeRequest::class : ClearCodeRequest::class;

        $request = new $class([
            'status'         => OperationStatus::SUBMITTED->value,
            'meter_number'   => $meterNumber,
            'meter_id'       => $meter?->id,
            'facility_id'    => $data['facility_id'] ?? $meter?->facility_id,
            'initiator_id'   => $initiator->id,
            'initiator_role' => $initiator->primaryRoleName(),
            'requested_via'  => $data['via'] ?? 'manual',
            'reason'         => $data['reason'] ?? null,
        ]);
        $request->txn = $this->txns->generate($request);
        $request->save();

        $this->engine->start($request, $initiator, $data['reason'] ?: 'Code requested.');

        return $request->refresh();
    }
}
