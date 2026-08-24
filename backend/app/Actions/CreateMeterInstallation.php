<?php

namespace App\Actions;

use App\Enums\OperationStatus;
use App\Enums\RoleName;
use App\Exceptions\WorkflowException;
use App\Models\Facility;
use App\Models\Meter;
use App\Models\MeterInstallation;
use App\Models\User;
use App\Services\TransactionIdService;
use App\Services\WorkflowEngine;

/**
 * Secretary initiates a NEW meter installation. The new meter is deliberately
 * NOT checked against ZVend — ZVend registration happens only after MD
 * approval. Duplicate meter numbers are rejected immediately (and again by
 * the DB unique constraint).
 */
class CreateMeterInstallation
{
    public function __construct(
        private readonly WorkflowEngine $engine,
        private readonly TransactionIdService $txns,
    ) {}

    public function execute(User $secretary, array $data): MeterInstallation
    {
        $meterNumber = trim((string) $data['meter_number']);

        if (Meter::withTrashed()->where('meter_number', $meterNumber)->exists()
            || MeterInstallation::withTrashed()->where('meter_number', $meterNumber)->exists()) {
            throw new WorkflowException('This meter number already exists.', 'METER_NUMBER_DUPLICATE');
        }

        $facility = Facility::findOrFail($data['facility_id']);

        $installation = new MeterInstallation([
            'status'            => OperationStatus::SUBMITTED->value,
            'meter_number'      => $meterNumber,
            'facility_id'       => $facility->id,
            'initiator_id'      => $secretary->id,
            'initiator_role'    => RoleName::SECRETARY->value,
            'secretary_comment' => $data['comment'] ?? null,
        ]);
        $installation->txn = $this->txns->generate($installation);
        $installation->save();

        // New meter enters the Z Admin registry as IN_STOCK.
        $meter = Meter::create([
            'meter_number' => $meterNumber,
            'facility_id'  => $facility->id,
            'status'       => 'IN_STOCK',
        ]);
        $installation->meter_id = $meter->id;
        $installation->save();

        $this->engine->start($installation, $secretary, $data['comment'] ?: 'Submitted for approval.');

        return $installation->refresh();
    }
}
