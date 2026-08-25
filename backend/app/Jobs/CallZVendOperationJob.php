<?php

namespace App\Jobs;

use App\Enums\OperationType;
use App\Exceptions\ZVendException;
use App\Models\IdempotencyKey;
use App\Services\AuditService;
use App\Services\WorkflowEngine;
use App\Services\ZVendApiService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Relation;

/**
 * Performs the single ZVend call for an operation after MD approval.
 * Duplicate dispatches are neutralized by the idempotency key recorded on
 * the operation — a second run is audited and skipped, never re-sent.
 */
class CallZVendOperationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1; // transport retries live inside the HTTP client

    public function __construct(
        public readonly string $operationType,
        public readonly int $operationId,
    ) {}

    public function handle(
        ZVendApiService $zvend,
        WorkflowEngine $engine,
        AuditService $audit,
    ): void {
        $operation = Relation::morphMap()[$this->operationType]::find($this->operationId);

        if (! $operation || $operation->status !== 'WAITING_ZVEND' || $operation->zvend_status !== 'pending') {
            return; // stale dispatch
        }

        // ---- idempotency gate: one ZVend transaction per armed key --------
        $idem = IdempotencyKey::firstOrCreate(
            ['key' => $operation->idempotency_key],
            ['operation_type' => $this->operationType, 'operation_id' => $operation->id, 'purpose' => 'zvend_call']
        );

        if ($idem->consumed_at !== null) {
            $audit->log('zvend_duplicate_blocked', "{$operation->txn} — duplicate ZVend dispatch blocked ({$idem->key}).", $operation, $operation->txn);

            return;
        }

        $type = OperationType::from($this->operationType);

        try {
            $result = match ($type) {
                OperationType::METER_INSTALLATION => $zvend->installMeter(
                    $operation->meter_number,
                    $operation->facility->code,
                    $operation->idempotency_key,
                ),
                OperationType::METER_ACTIVATION => $zvend->activateMeter(array_filter([
                    'facility'         => $operation->facility->code,
                    'meter_number'     => $operation->meter_number,
                    'customer_name'    => $operation->customer_name,
                    'customer_phone'   => $operation->customer_phone,
                    'customer_email'   => $operation->customer_email,
                    'customer_address' => $operation->customer_address,
                    'latitude'         => $operation->gpsRecords()->where('accepted', true)->latest('id')->value('latitude'),
                    'longitude'        => $operation->gpsRecords()->where('accepted', true)->latest('id')->value('longitude'),
                ]), $operation->idempotency_key),
                OperationType::TAMPER_CODE => $zvend->generateTamperCode($operation->meter_number, $operation->idempotency_key),
                OperationType::CLEAR_CODE  => $zvend->generateClearCode($operation->meter_number, $operation->idempotency_key),
                OperationType::METER_INSPECTION => throw new ZVendException('Inspections never call ZVend.', 'n/a'),
            };
        } catch (ZVendException) {
            $idem->consume(['status' => 'failed', 'txn' => $operation->txn]);
            $engine->zvendSettled($operation, false);

            return;
        }

        $body = $result['body'];

        $data = [
            'reference'     => $body['reference'] ?? ($body['data']['reference'] ?? null),
            'response_code' => $result['response_code'],
            'latency_ms'    => $result['latency_ms'],
        ];

        // Expected ZVend install response: 20-digit tamper + clear codes.
        if (in_array($type, [OperationType::METER_INSTALLATION, OperationType::TAMPER_CODE], true)) {
            $data[$type === OperationType::TAMPER_CODE ? 'issued_code' : 'tamper_code'] =
                $body['tamper_code'] ?? ($body['data']['tamper_code'] ?? null);
        }
        if (in_array($type, [OperationType::METER_INSTALLATION, OperationType::CLEAR_CODE], true)) {
            $data[$type === OperationType::CLEAR_CODE ? 'issued_code' : 'clear_code'] =
                $body['clear_code'] ?? ($body['data']['clear_code'] ?? null);
        }

        $idem->consume(['status' => 'success', 'txn' => $operation->txn, 'reference' => $data['reference']]);
        $engine->zvendSettled($operation, true, $data);
    }
}
