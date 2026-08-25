<?php

namespace App\Actions;

use App\Enums\OperationStatus;
use App\Enums\OperationType;
use App\Enums\RoleName;
use App\Exceptions\WorkflowException;
use App\Models\Meter;
use App\Models\MeterInspection;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\TransactionIdService;
use App\Services\WorkflowEngine;

/**
 * Only the GM schedules inspections. The video duration is chosen from the
 * Super-Admin-configured list in system_settings — never hard-coded.
 */
class ScheduleMeterInspection
{
    public function __construct(
        private readonly WorkflowEngine $engine,
        private readonly TransactionIdService $txns,
    ) {}

    public function execute(User $gm, array $data): MeterInspection
    {
        $allowed = SystemSetting::read('inspection_durations', [60, 120, 180, 300]);

        if (! in_array((int) $data['duration_seconds'], array_map('intval', $allowed), true)) {
            throw new WorkflowException(
                'Inspection duration is not one of the configured options ('.implode(', ', $allowed).' seconds).',
                'INSPECTION_DURATION_INVALID'
            );
        }

        $meter = Meter::where('meter_number', $data['meter_number'])->firstOrFail();

        if (MeterInspection::where('meter_id', $meter->id)->where('status', OperationStatus::PENDING->value)->exists()) {
            throw new WorkflowException('An inspection is already scheduled for this meter.', 'INSPECTION_DUPLICATE');
        }

        $inspection = new MeterInspection([
            'status'          => OperationStatus::SUBMITTED->value,
            'meter_number'    => $meter->meter_number,
            'meter_id'        => $meter->id,
            'facility_id'     => $data['facility_id'] ?? $meter->facility_id,
            'initiator_id'    => $gm->id,
            'initiator_role'  => RoleName::GENERAL_MANAGER->value,
            'scheduled_by_id' => $gm->id,
            'scheduled_for'   => $data['scheduled_for'],
            'instruction'     => $data['instruction'],
            'duration_seconds' => (int) $data['duration_seconds'],
        ]);
        $inspection->txn = $this->txns->generate($inspection);
        $inspection->save();

        // Stage 0 (SCHEDULE) is the GM's own submission; the engine marks the
        // EXECUTION stage current for the Technical Man. No ZVend stage exists.
        $this->engine->start($inspection, $gm, $data['instruction']);

        return $inspection->refresh();
    }
}
