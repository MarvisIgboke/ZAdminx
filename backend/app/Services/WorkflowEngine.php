<?php

namespace App\Services;

use App\Enums\OperationStatus;
use App\Enums\OperationType;
use App\Enums\RoleName;
use App\Enums\WorkflowDecision;
use App\Enums\WorkflowStage;
use App\Exceptions\IdempotencyReplayException;
use App\Exceptions\WorkflowException;
use App\Jobs\CallZVendOperationJob;
use App\Models\AppNotification;
use App\Models\Delegation;
use App\Models\IdempotencyKey;
use App\Models\User;
use App\Models\WorkflowComment;
use App\Models\WorkflowStep;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * The universal approval workflow engine.
 *
 *  - Pipelines are declared per operation; transitions are validated against
 *    the current stage (no arbitrary status changes, ever).
 *  - MD approval may be exercised by a GM holding an ACTIVE delegation —
 *    the step is stamped and the comment carries "Approved under MD delegation."
 *  - Every decision writes an immutable workflow_comments row and an audit row.
 *  - Idempotency keys make duplicate approvals / duplicate API effects impossible.
 *  - ZVend is only reachable after the MD stage approved.
 */
class WorkflowEngine
{
    private const INITIATOR = 'INITIATOR';

    public function __construct(private readonly AuditService $audit) {}

    // ------------------------------------------------------------------
    // Pipelines
    // ------------------------------------------------------------------

    /** @return array<int, array{key: string, label: string, role: string, decisions: string[]}> */
    public static function pipelineFor(OperationType $type): array
    {
        $approvals = [
            ['key' => WorkflowStage::ENERGY_MANAGER->value,  'label' => 'Energy Manager Approval',  'role' => RoleName::ENERGY_MANAGER->value,  'decisions' => ['approve', 'reject', 'return']],
            ['key' => WorkflowStage::GENERAL_MANAGER->value, 'label' => 'General Manager Approval', 'role' => RoleName::GENERAL_MANAGER->value, 'decisions' => ['approve', 'reject', 'return']],
            ['key' => WorkflowStage::MD->value,              'label' => 'MD Final Approval',        'role' => RoleName::MD->value,              'decisions' => ['approve', 'reject', 'return']],
        ];

        $zvend = ['key' => WorkflowStage::ZVEND->value, 'label' => 'ZVend API', 'role' => 'ZVEND', 'decisions' => ['zvend_success', 'zvend_failed']];

        return match ($type) {
            OperationType::METER_INSTALLATION => [
                ['key' => WorkflowStage::INITIATOR->value, 'label' => 'Secretary Submission', 'role' => RoleName::SECRETARY->value, 'decisions' => ['submit']],
                ...$approvals,
                $zvend,
                ['key' => WorkflowStage::DELIVERY->value, 'label' => 'Secretary Release', 'role' => RoleName::SECRETARY->value, 'decisions' => ['deliver']],
                ['key' => WorkflowStage::EXECUTION->value, 'label' => 'Field Installation', 'role' => RoleName::TECHNICAL_MAN->value, 'decisions' => ['execute']],
                ['key' => WorkflowStage::COMPLETED->value, 'label' => 'Completed', 'role' => '-', 'decisions' => []],
            ],
            OperationType::METER_ACTIVATION => [
                ['key' => WorkflowStage::INITIATOR->value, 'label' => 'Technical Man Capture', 'role' => RoleName::TECHNICAL_MAN->value, 'decisions' => ['submit']],
                ['key' => WorkflowStage::SECRETARY->value, 'label' => 'Secretary Review', 'role' => RoleName::SECRETARY->value, 'decisions' => ['approve', 'reject', 'return']],
                ...$approvals,
                $zvend,
                ['key' => WorkflowStage::DELIVERY->value, 'label' => 'Secretary Completion', 'role' => RoleName::SECRETARY->value, 'decisions' => ['confirm']],
                ['key' => WorkflowStage::COMPLETED->value, 'label' => 'Completed', 'role' => '-', 'decisions' => []],
            ],
            OperationType::METER_INSPECTION => [
                ['key' => WorkflowStage::SCHEDULE->value, 'label' => 'Scheduled by GM', 'role' => RoleName::GENERAL_MANAGER->value, 'decisions' => ['submit']],
                ['key' => WorkflowStage::EXECUTION->value, 'label' => 'Field Inspection (video)', 'role' => RoleName::TECHNICAL_MAN->value, 'decisions' => ['execute']],
                ['key' => WorkflowStage::SECRETARY->value, 'label' => 'Secretary Review', 'role' => RoleName::SECRETARY->value, 'decisions' => ['approve', 'reject', 'return']],
                ...$approvals,
                ['key' => WorkflowStage::COMPLETED->value, 'label' => 'Completed', 'role' => '-', 'decisions' => []],
            ],
            OperationType::TAMPER_CODE, OperationType::CLEAR_CODE => [
                ['key' => WorkflowStage::INITIATOR->value, 'label' => 'Request Initiated', 'role' => self::INITIATOR, 'decisions' => ['submit']],
                ...$approvals,
                $zvend,
                ['key' => WorkflowStage::DELIVERY->value, 'label' => 'Code Delivered', 'role' => self::INITIATOR, 'decisions' => ['confirm']],
                ['key' => WorkflowStage::COMPLETED->value, 'label' => 'Completed', 'role' => '-', 'decisions' => []],
            ],
        };
    }

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    /** Materializes all steps, marks stage 0 decided-by-initiator, stage 1 current. */
    public function start(Model $operation, User $initiator, string $submitComment): void
    {
        $type = OperationType::fromModel($operation);
        $pipeline = self::pipelineFor($type);

        DB::transaction(function () use ($operation, $initiator, $submitComment, $pipeline, $type) {
            $comment = WorkflowComment::create([
                'transaction_id' => $operation->txn,
                'operation_type' => $operation->getMorphClass(),
                'operation_id'   => $operation->id,
                'user_id'        => $initiator->id,
                'role'           => $initiator->primaryRoleName(),
                'comment'        => $submitComment,
            ]);

            foreach ($pipeline as $i => $stage) {
                WorkflowStep::create([
                    'operation_type' => $operation->getMorphClass(),
                    'operation_id'   => $operation->id,
                    'stage_key'      => $stage['key'],
                    'stage_label'    => $stage['label'],
                    'role'           => $stage['role'],
                    'is_current'     => $i === 1,
                    'user_id'        => $i === 0 ? $initiator->id : null,
                    'decision'       => $i === 0 ? WorkflowDecision::SUBMIT->value : null,
                    'comment_id'     => $i === 0 ? $comment->id : null,
                    'decided_at'     => $i === 0 ? now() : null,
                ]);
            }

            $operation->forceFill([
                'status'        => OperationStatus::PENDING->value,
                'current_stage' => $pipeline[1]['key'],
                'stage_index'   => 1,
            ])->save();
        });

        $this->audit->log('operation_submitted', "{$type->label()} {$operation->txn} submitted.", $operation, $operation->txn);
        $this->notify($pipeline[1]['role'], "{$type->label()} {$operation->txn} awaits your approval.", 'approval', $operation);
    }

    /**
     * Validates and applies a decision at the current stage.
     *
     * @throws WorkflowException|IdempotencyReplayException
     */
    public function decide(
        Model $operation,
        WorkflowDecision $decision,
        User $actor,
        string $comment,
        ?string $idempotencyKey = null,
    ): Model {
        $operation->refresh();
        $type = OperationType::fromModel($operation);
        $pipeline = self::pipelineFor($type);

        if (in_array($operation->status, [OperationStatus::COMPLETED->value, OperationStatus::CANCELLED->value], true)) {
            throw WorkflowException::terminal();
        }

        // Retry path: ZVend failed — an approver may re-arm the call (fresh idempotency key).
        if ($operation->status === OperationStatus::ZVEND_FAILED->value) {
            if ($decision !== WorkflowDecision::APPROVE || ! $actor->can('approve_'.$type->value)) {
                throw new WorkflowException('ZVend failed — the only permitted action is to retry the ZVend call.', 'WORKFLOW_ZVEND_FAILED');
            }

            return $this->retryZvend($operation, $actor, $idempotencyKey);
        }

        $idx = (int) $operation->stage_index;
        $stage = $pipeline[$idx] ?? throw WorkflowException::terminal();
        $step = $operation->steps()->where('stage_key', $stage['key'])->firstOrFail();

        // Server-side actor validation — the `can:` middleware already checked
        // the permission; the engine additionally checks stage ownership.
        $delegated = false;
        if ($stage['role'] === self::INITIATOR) {
            if ($actor->id !== (int) $operation->initiator_id) {
                throw WorkflowException::notYourStage('Initiator');
            }
        } elseif ($stage['role'] === RoleName::MD->value) {
            if (! $actor->hasRole(RoleName::MD)) {
                if ($actor->hasRole(RoleName::GENERAL_MANAGER) && $this->activeDelegationFor($actor)) {
                    $delegated = true;
                } else {
                    throw WorkflowException::notYourStage($stage['role']);
                }
            }
        } elseif ($actor->primaryRoleName() !== $stage['role']) {
            throw WorkflowException::notYourStage($stage['role']);
        }

        if (! in_array($decision->value, $stage['decisions'], true)) {
            throw WorkflowException::illegalDecision($decision->value);
        }

        // Idempotency — duplicate approvals collapse into a replay.
        $key = $idempotencyKey ?: "{$operation->txn}:{$stage['key']}:{$decision->value}";
        $idem = IdempotencyKey::firstOrCreate(
            ['key' => $key],
            ['operation_type' => $operation->getMorphClass(), 'operation_id' => $operation->id, 'purpose' => 'workflow_decision']
        );
        if ($idem->consumed_at !== null) {
            throw new IdempotencyReplayException($idem->response_snapshot);
        }

        if ($delegated) {
            $comment .= ' — Approved under MD delegation.';
        }

        DB::transaction(function () use ($operation, $type, $pipeline, $step, $idx, $decision, $actor, $comment, $delegated, $idem) {
            $commentRow = WorkflowComment::create([
                'transaction_id' => $operation->txn,
                'operation_type' => $operation->getMorphClass(),
                'operation_id'   => $operation->id,
                'user_id'        => $actor->id,
                'role'           => $actor->primaryRoleName(),
                'comment'        => $comment,
            ]);

            $step->forceFill([
                'user_id' => $actor->id,
                'decision' => $decision->value,
                'decided_by_delegation' => $delegated,
                'comment_id' => $commentRow->id,
                'decided_at' => now(),
                'is_current' => false,
            ])->save();

            $this->audit->log(
                'operation_'.$decision->value.($delegated ? '_delegated' : ''),
                "{$type->label()} {$operation->txn} — {$decision->value} by {$actor->name}".($delegated ? ' (MD delegation)' : ''),
                $operation,
                $operation->txn
            );

            if (in_array($decision, [WorkflowDecision::REJECT, WorkflowDecision::RETURN], true)) {
                $operation->forceFill([
                    'status' => $decision === WorkflowDecision::REJECT ? OperationStatus::REJECTED->value : OperationStatus::RETURNED->value,
                    'current_stage' => null,
                ])->save();

                $this->notify(
                    $this->roleOfUser((int) $operation->initiator_id),
                    "{$type->label()} {$operation->txn} was {$decision->value}ed at {$step->stage_label}.",
                    'approval',
                    $operation
                );

                // Rejected inspections remain in the inspection queue for retry.
                if ($type === OperationType::METER_INSPECTION && $decision === WorkflowDecision::REJECT) {
                    $this->notify(RoleName::TECHNICAL_MAN->value, "Inspection {$operation->txn} rejected — technical action required.", 'field', $operation);
                }

                $idem->consume(['status' => $operation->status, 'txn' => $operation->txn]);

                return;
            }

            // Advancing decisions: approve | execute | deliver | confirm
            $nextIdx = $idx + 1;
            $next = $pipeline[$nextIdx] ?? throw WorkflowException::terminal();

            if ($step->stage_key === WorkflowStage::MD->value && $decision === WorkflowDecision::APPROVE) {
                $operation->forceFill(['md_approved_at' => now()]);
            }

            if ($next['key'] === WorkflowStage::COMPLETED->value) {
                $operation->forceFill([
                    'status' => OperationStatus::COMPLETED->value,
                    'current_stage' => WorkflowStage::COMPLETED->value,
                    'stage_index' => $nextIdx,
                    'completed_at' => now(),
                ])->save();
                $operation->steps()->where('stage_key', WorkflowStage::COMPLETED->value)->update(['is_current' => true]);

                $this->audit->log('operation_completed', "{$type->label()} {$operation->txn} completed.", $operation, $operation->txn);
                $this->notify($this->roleOfUser((int) $operation->initiator_id), "{$type->label()} {$operation->txn} is complete.", 'system', $operation);
            } elseif ($next['key'] === WorkflowStage::ZVEND->value) {
                // ZVend is ONLY reachable after MD approval — this branch is the sole entry.
                $operation->forceFill([
                    'status' => OperationStatus::WAITING_ZVEND->value,
                    'current_stage' => WorkflowStage::ZVEND->value,
                    'stage_index' => $nextIdx,
                    'idempotency_key' => "zvend:{$operation->txn}:1",
                    'zvend_status' => 'pending',
                ])->save();
                $operation->steps()->where('stage_key', WorkflowStage::ZVEND->value)->update(['is_current' => true]);

                $this->audit->log('zvend_requested', "{$type->label()} {$operation->txn} queued for ZVend after MD approval.", $operation, $operation->txn);
                $this->notify(RoleName::IT_MANAGER->value, "{$type->label()} {$operation->txn} — ZVend call in progress.", 'zvend', $operation);

                CallZVendOperationJob::dispatch($operation->getMorphClass(), $operation->id)->afterCommit();
            } else {
                $nextStatus = match (true) {
                    $type === OperationType::METER_INSTALLATION && $next['key'] === WorkflowStage::EXECUTION->value
                        => OperationStatus::ASSIGNED->value,
                    default => OperationStatus::PENDING->value,
                };

                $operation->forceFill([
                    'status' => $nextStatus,
                    'current_stage' => $next['key'],
                    'stage_index' => $nextIdx,
                ])->save();
                $operation->steps()->where('stage_key', $next['key'])->update(['is_current' => true]);

                if ($type === OperationType::METER_INSTALLATION && $next['key'] === WorkflowStage::EXECUTION->value) {
                    $operation->forceFill(['available_to_field_at' => now()])->save();
                    $this->notify(RoleName::TECHNICAL_MAN->value, "Installation {$operation->txn} assigned for field execution.", 'field', $operation);
                } else {
                    $notifyRole = $next['role'] === self::INITIATOR
                        ? $this->roleOfUser((int) $operation->initiator_id)
                        : $next['role'];
                    $this->notify($notifyRole, "{$type->label()} {$operation->txn} awaits your action at {$next['label']}.", 'approval', $operation);
                }
            }

            $idem->consume(['status' => $operation->status, 'stage' => $next['key'], 'txn' => $operation->txn]);
        });

        return $operation->refresh();
    }

    /**
     * Called by CallZVendOperationJob with the sanitized outcome.
     */
    public function zvendSettled(Model $operation, bool $success, array $data = []): void
    {
        $operation->refresh();
        $type = OperationType::fromModel($operation);

        if ((int) $operation->stage_index !== array_search(
            WorkflowStage::ZVEND->value,
            array_column(self::pipelineFor($type), 'key'),
            true
        )) {
            return; // stale job — the record moved on (idempotency protection)
        }

        DB::transaction(function () use ($operation, $type, $success, $data) {
            $operation->steps()->where('stage_key', WorkflowStage::ZVEND->value)->update([
                'decision' => $success ? WorkflowDecision::ZVEND_SUCCESS->value : WorkflowDecision::ZVEND_FAILED->value,
                'decided_at' => now(),
                'is_current' => false,
            ]);

            if (! $success) {
                $operation->forceFill(['status' => OperationStatus::ZVEND_FAILED->value, 'zvend_status' => 'failed'])->save();
                $this->audit->log('zvend_failed', "{$type->label()} {$operation->txn} — ZVend call failed.", $operation, $operation->txn);
                $this->notify(RoleName::IT_MANAGER->value, "{$type->label()} {$operation->txn} — ZVend call FAILED. Retry available.", 'zvend', $operation);

                return;
            }

            $zvIdx = (int) $operation->stage_index;
            $pipeline = self::pipelineFor($type);
            $next = $pipeline[$zvIdx + 1];

            $fill = [
                'status' => OperationStatus::ZVEND_SUCCESS->value,
                'zvend_status' => 'success',
                'zvend_reference' => $data['reference'] ?? null,
                'zvend_response_code' => $data['response_code'] ?? null,
                'zvend_called_at' => now(),
                'zvend_latency_ms' => $data['latency_ms'] ?? null,
                'current_stage' => $next['key'],
                'stage_index' => $zvIdx + 1,
            ];

            // Sensitive codes: encrypted at rest, never logged.
            foreach (['tamper_code', 'clear_code', 'issued_code'] as $field) {
                if (! empty($data[$field])) {
                    $fill[$field] = $data[$field];
                }
            }

            $operation->forceFill($fill)->save();
            $operation->steps()->where('stage_key', $next['key'])->update(['is_current' => true]);

            $this->audit->log('zvend_success', "{$type->label()} {$operation->txn} — ZVend completed (ref {$fill['zvend_reference']}).", $operation, $operation->txn);
            $this->notify(RoleName::SECRETARY->value, "{$type->label()} {$operation->txn} — ZVend succeeded, result ready for delivery.", 'zvend', $operation);
        });
    }

    private function retryZvend(Model $operation, User $actor, ?string $idempotencyKey): Model
    {
        $key = $idempotencyKey ?: "zvend:{$operation->txn}:".(((int) $operation->retry_count) + 2);
        $idem = IdempotencyKey::firstOrCreate(
            ['key' => $key],
            ['operation_type' => $operation->getMorphClass(), 'operation_id' => $operation->id, 'purpose' => 'zvend_call']
        );
        if ($idem->consumed_at !== null) {
            throw new IdempotencyReplayException($idem->response_snapshot);
        }

        $operation->forceFill([
            'status' => OperationStatus::WAITING_ZVEND->value,
            'zvend_status' => 'pending',
            'retry_count' => ((int) $operation->retry_count) + 1,
            'idempotency_key' => $key,
        ])->save();

        $this->audit->log('zvend_retry', "{$operation->txn} — ZVend retry #{$operation->retry_count} armed by {$actor->name}.", $operation, $operation->txn);
        CallZVendOperationJob::dispatch($operation->getMorphClass(), $operation->id)->afterCommit();

        return $operation->refresh();
    }

    public function activeDelegationFor(User $gm): ?Delegation
    {
        return Delegation::where('delegate_id', $gm->id)
            ->where('status', 'active')
            ->whereDate('starts_on', '<=', now())
            ->whereDate('ends_on', '>=', now())
            ->first();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private function notify(string $forRole, string $title, string $kind, Model $operation): void
    {
        AppNotification::create([
            'for_role' => $forRole === self::INITIATOR ? null : $forRole,
            'for_user_id' => null,
            'kind' => $kind,
            'title' => $title,
            'transaction_id' => $operation->txn,
            'operation_type' => $operation->getMorphClass(),
            'operation_id' => $operation->id,
        ]);
    }

    private function roleOfUser(int $userId): string
    {
        return User::find($userId)?->primaryRoleName() ?? RoleName::SECRETARY->value;
    }
}
