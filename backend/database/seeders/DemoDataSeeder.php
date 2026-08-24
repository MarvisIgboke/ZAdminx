<?php

namespace Database\Seeders;

use App\Enums\OperationStatus;
use App\Enums\OperationType;
use App\Enums\RoleName;
use App\Enums\WorkflowDecision;
use App\Enums\WorkflowStage;
use App\Models\Customer;
use App\Models\Facility;
use App\Models\Meter;
use App\Models\MeterInspection;
use App\Models\MeterInstallation;
use App\Models\SystemSetting;
use App\Models\TamperCodeRequest;
use App\Models\User;
use App\Models\WorkflowComment;
use App\Models\WorkflowStep;
use Illuminate\Database\Seeder;

/**
 * Demo catalog + sample operations frozen at meaningful workflow stages.
 * Steps are seeded directly (not through the engine) so no ZVend job fires
 * during seeding.
 */
class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $this->settings();
        $facilities = $this->facilities();
        $customers  = $this->customers($facilities);
        $meters     = $this->meters($facilities, $customers);
        $this->operations($facilities, $meters);
    }

    private function settings(): void
    {
        foreach ([
            ['key' => 'max_gps_accuracy_m', 'value' => 50, 'group' => 'gps', 'label' => 'Maximum GPS accuracy (m)'],
            ['key' => 'inspection_durations', 'value' => [60, 120, 180, 300], 'group' => 'inspection', 'label' => 'Allowed inspection video durations (seconds)'],
            ['key' => 'default_inspection_duration', 'value' => 120, 'group' => 'inspection', 'label' => 'Default inspection duration (seconds)'],
        ] as $s) {
            SystemSetting::updateOrCreate(['key' => $s['key']], $s);
        }
    }

    private function facilities(): array
    {
        $rows = [
            ['FAC-IKY', 'Ikoyi Head Office', 'Ikoyi', 'Lagos', 6.4432, 3.4186],
            ['FAC-LEK', 'Lekki Service Yard', 'Lekki Phase 1', 'Lagos', 6.4478, 3.4721],
            ['FAC-SUR', 'Surulere Depot', 'Surulere', 'Lagos', 6.4926, 3.3605],
            ['FAC-YAB', 'Yaba Substation', 'Yaba', 'Lagos', 6.5083, 3.3711],
            ['FAC-AJA', 'Ajah Feeder Station', 'Ajah', 'Lagos', 6.4668, 3.5852],
            ['FAC-VIC', 'Victoria Island Hub', 'Victoria Island', 'Lagos', 6.4281, 3.4218],
        ];

        return collect($rows)->map(fn ($r) => Facility::updateOrCreate(['code' => $r[0]], [
            'name' => $r[1], 'city' => $r[2], 'state' => $r[3],
            'latitude' => $r[4], 'longitude' => $r[5],
            'address' => "{$r[1]}, {$r[2]}", 'status' => 'ACTIVE',
            'zvend_facility_id' => 'ZV-'.strtoupper($r[0]),
            'last_synced_at' => now()->subHours(6),
        ]))->all();
    }

    private function customers(array $facilities): array
    {
        $rows = [
            ['John Joe', '08031112222', 'john.joe@mail.com', '12 Adeola Close, Ikoyi', 0],
            ['John Joe', '08098887777', 'jj@business.ng', '4B Freedom Way, Lekki', 1],   // same name, two meters — allowed
            ['Adaeze Umeh', '08055554444', 'adaeze@mail.com', '9 Herbert Macaulay Way, Yaba', 3],
            ['Sultan Bello', '08022223333', 'sultan@mail.com', '21 Awolowo Road, Ikoyi', 0],
            ['Grace Obi', '08077776666', 'grace.obi@mail.com', '33 Admiralty Way, Lekki', 1],
            ['Musa Danladi', '08066665555', 'musa.d@mail.com', '5 Bode Thomas, Surulere', 2],
        ];

        return collect($rows)->map(fn ($r) => Customer::updateOrCreate(
            ['name' => $r[0], 'phone' => $r[1]],
            ['facility_id' => $facilities[$r[4]]->id, 'email' => $r[2], 'address' => $r[3], 'status' => 'ACTIVE']
        ))->all();
    }

    private function meters(array $facilities, array $customers): array
    {
        $rows = [
            ['45039812990', 0, 0, 'ACTIVE'],
            ['45039812991', 1, 1, 'ACTIVE'],
            ['45039813002', 3, 2, 'ACTIVE'],
            ['45039813117', 0, 3, 'INSTALLED'],
            ['45039813228', 1, 4, 'ACTIVE'],
            ['45039813339', 2, 5, 'FAULTY'],
            ['45039813401', 4, null, 'IN_STOCK'],
            ['45039813402', 5, null, 'IN_STOCK'],
        ];

        return collect($rows)->map(fn ($r) => Meter::updateOrCreate(['meter_number' => $r[0]], [
            'facility_id' => $facilities[$r[1]]->id,
            'customer_id' => $r[2] === null ? null : $customers[$r[2]]->id,
            'model' => 'ZRX-K1 Prepaid', 'phase' => 'single', 'status' => $r[3],
            'installed_at' => in_array($r[3], ['INSTALLED', 'ACTIVE']) ? now()->subDays(rand(5, 60)) : null,
        ]))->all();
    }

    private function operations(array $facilities, array $meters): void
    {
        $secretary = User::where('email', 'secretary@zarox.com')->firstOrFail();
        $tech      = User::where('email', 'tech@zarox.com')->firstOrFail();
        $em        = User::where('email', 'energy@zarox.com')->firstOrFail();
        $gm        = User::where('email', 'gm@zarox.com')->firstOrFail();
        $md        = User::where('email', 'md@zarox.com')->firstOrFail();

        // Installation awaiting the Energy Manager.
        $this->seedSteps(MeterInstallation::create([
            'txn' => 'ZADM-INS-'.now()->format('Ymd').'-000011',
            'status' => OperationStatus::PENDING->value,
            'current_stage' => WorkflowStage::ENERGY_MANAGER->value,
            'stage_index' => 1,
            'meter_number' => $meters[6]->meter_number,
            'meter_id' => $meters[6]->id,
            'facility_id' => $facilities[4]->id,
            'initiator_id' => $secretary->id,
            'initiator_role' => RoleName::SECRETARY->value,
            'secretary_comment' => 'New build at Ajah Feeder — customer waiting on energization.',
        ]), [
            [$secretary, RoleName::SECRETARY, WorkflowStage::INITIATOR, WorkflowDecision::SUBMIT, 'Submitted for approval.'],
        ], 1);

        // Inspection scheduled for the Technical Man (2-minute video rule).
        MeterInspection::create([
            'txn' => 'ZADM-INSP-'.now()->format('Ymd').'-000012',
            'status' => OperationStatus::PENDING->value,
            'current_stage' => WorkflowStage::EXECUTION->value,
            'stage_index' => 0,
            'meter_number' => $meters[5]->meter_number,
            'meter_id' => $meters[5]->id,
            'facility_id' => $facilities[2]->id,
            'initiator_id' => $gm->id,
            'initiator_role' => RoleName::GENERAL_MANAGER->value,
            'scheduled_by_id' => $gm->id,
            'scheduled_for' => now()->addDays(2)->toDateString(),
            'instruction' => 'Verify terminal block seals and display readings; meter reported FAULTY by customer.',
            'duration_seconds' => 120,
        ]);

        // Tamper request awaiting MD (EM + GM already approved).
        $tamper = TamperCodeRequest::create([
            'txn' => 'ZADM-TMP-'.now()->format('Ymd').'-000013',
            'status' => OperationStatus::PENDING->value,
            'current_stage' => WorkflowStage::MD->value,
            'stage_index' => 3,
            'meter_number' => $meters[5]->meter_number,
            'meter_id' => $meters[5]->id,
            'facility_id' => $facilities[2]->id,
            'initiator_id' => $secretary->id,
            'initiator_role' => RoleName::SECRETARY->value,
            'requested_via' => 'manual',
            'reason' => 'Meter locked out after storm-related surge; customer verified in person.',
        ]);
        $this->seedSteps($tamper, [
            [$secretary, RoleName::SECRETARY, WorkflowStage::INITIATOR, WorkflowDecision::SUBMIT, 'Requested per customer complaint #C-2291.'],
            [$em, RoleName::ENERGY_MANAGER, WorkflowStage::ENERGY_MANAGER, WorkflowDecision::APPROVE, 'Fault history confirms lockout. Approved.'],
            [$gm, RoleName::GENERAL_MANAGER, WorkflowStage::GENERAL_MANAGER, WorkflowDecision::APPROVE, 'Approved — schedule field reset after code issue.'],
        ], 3);

        // Completed installation with issued codes (masked everywhere except encrypted storage).
        $done = MeterInstallation::create([
            'txn' => 'ZADM-INS-'.now()->subDays(9)->format('Ymd').'-000004',
            'status' => OperationStatus::COMPLETED->value,
            'current_stage' => WorkflowStage::COMPLETED->value,
            'stage_index' => 7,
            'meter_number' => $meters[0]->meter_number,
            'meter_id' => $meters[0]->id,
            'facility_id' => $facilities[0]->id,
            'initiator_id' => $secretary->id,
            'initiator_role' => RoleName::SECRETARY->value,
            'secretary_comment' => 'Standard new install — Ikoyi block C.',
            'md_approved_at' => now()->subDays(9)->addHours(5),
            'zvend_status' => 'success',
            'zvend_reference' => 'ZV-REF-88213',
            'zvend_response_code' => '00',
            'tamper_code' => encrypt('88410293571620483759'),
            'clear_code' => encrypt('66291847350219864530'),
            'zvend_called_at' => now()->subDays(9)->addHours(5),
            'zvend_latency_ms' => 412,
            'assigned_to_id' => $tech->id,
            'available_to_field_at' => now()->subDays(9)->addHours(6),
            'completed_at' => now()->subDays(9)->addHours(8),
        ]);
        $this->seedSteps($done, [
            [$secretary, RoleName::SECRETARY, WorkflowStage::INITIATOR, WorkflowDecision::SUBMIT, 'Submitted.'],
            [$em, RoleName::ENERGY_MANAGER, WorkflowStage::ENERGY_MANAGER, WorkflowDecision::APPROVE, 'Stock verified.'],
            [$gm, RoleName::GENERAL_MANAGER, WorkflowStage::GENERAL_MANAGER, WorkflowDecision::APPROVE, 'Approved.'],
            [$md, RoleName::MD, WorkflowStage::MD, WorkflowDecision::APPROVE, 'Final approval granted.'],
        ], 4);
    }

    /**
     * Writes decided workflow steps + immutable comments up to a stage, then
     * marks the next step current. Mirrors the engine's bookkeeping.
     */
    private function seedSteps($operation, array $decided, int $currentIdx): void
    {
        $pipeline = \App\Services\WorkflowEngine::pipelineFor(OperationType::fromModel($operation));

        foreach ($pipeline as $i => $stage) {
            $row = [
                'operation_type' => $operation->getMorphClass(),
                'operation_id'   => $operation->id,
                'stage_key'      => $stage['key'],
                'stage_label'    => $stage['label'],
                'role'           => $stage['role'],
                'is_current'     => $i === $currentIdx,
            ];

            if ($i < count($decided)) {
                [$user, $role, , $decision, $text] = $decided[$i];

                $comment = WorkflowComment::create([
                    'transaction_id' => $operation->txn,
                    'operation_type' => $operation->getMorphClass(),
                    'operation_id'   => $operation->id,
                    'user_id'        => $user->id,
                    'role'           => $role->value,
                    'comment'        => $text,
                ]);

                $row = array_merge($row, [
                    'user_id'  => $user->id,
                    'decision' => $decision->value,
                    'comment_id' => $comment->id,
                    'decided_at' => now()->subMinutes((count($decided) - $i) * 47),
                ]);
            }

            WorkflowStep::updateOrCreate(
                ['operation_type' => $row['operation_type'], 'operation_id' => $row['operation_id'], 'stage_key' => $row['stage_key']],
                $row
            );
        }
    }
}
