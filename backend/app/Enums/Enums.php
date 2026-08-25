<?php

/*
 * Domain enums for Z Admin. Grouped in one file and resolved through
 * Composer classmap autoloading (see composer.json) — each enum is still
 * addressable by its FQCN, e.g. App\Enums\OperationType.
 */

namespace App\Enums;

enum RoleName: string
{
    case SUPER_ADMIN    = 'SUPER_ADMIN';
    case SECRETARY      = 'SECRETARY';
    case TECHNICAL_MAN  = 'TECHNICAL_MAN';
    case ENERGY_MANAGER = 'ENERGY_MANAGER';
    case GENERAL_MANAGER = 'GENERAL_MANAGER';
    case MD             = 'MD';
    case IT_MANAGER     = 'IT_MANAGER';

    public function label(): string
    {
        return match ($this) {
            self::SUPER_ADMIN     => 'Super Admin',
            self::SECRETARY       => 'Secretary',
            self::TECHNICAL_MAN   => 'Technical Man',
            self::ENERGY_MANAGER  => 'Energy Manager',
            self::GENERAL_MANAGER => 'General Manager',
            self::MD              => 'Managing Director',
            self::IT_MANAGER      => 'IT Manager',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::SUPER_ADMIN     => 'Highest system administrator. Privileged actions are always audited.',
            self::SECRETARY       => 'Initiates installations and code requests; reviews activation and delivery stages.',
            self::TECHNICAL_MAN   => 'Executes field operations: scan, GPS, photos, video.',
            self::ENERGY_MANAGER  => 'First approval stage for all operations.',
            self::GENERAL_MANAGER => 'Second approval stage; schedules meter inspections.',
            self::MD              => 'Final approval authority. May delegate to the GM only.',
            self::IT_MANAGER      => 'Platform administration: users, API configuration, logs. No operational approvals.',
        };
    }
}

enum OperationType: string
{
    case METER_INSTALLATION = 'meter_installation';
    case METER_ACTIVATION   = 'meter_activation';
    case METER_INSPECTION   = 'meter_inspection';
    case TAMPER_CODE        = 'tamper_code';
    case CLEAR_CODE         = 'clear_code';

    public function label(): string
    {
        return match ($this) {
            self::METER_INSTALLATION => 'Meter Installation',
            self::METER_ACTIVATION   => 'Meter Activation',
            self::METER_INSPECTION   => 'Meter Inspection',
            self::TAMPER_CODE        => 'Tamper Code',
            self::CLEAR_CODE         => 'Clear Code',
        };
    }

    /** Transaction ID prefix — ZADM-INS-20260824-000001 */
    public function prefix(): string
    {
        return match ($this) {
            self::METER_INSTALLATION => 'INS',
            self::METER_ACTIVATION   => 'ACT',
            self::METER_INSPECTION   => 'INSP',
            self::TAMPER_CODE        => 'TMP',
            self::CLEAR_CODE         => 'CLR',
        };
    }

    /** Storage / logging folder per operation. */
    public function folder(): string
    {
        return match ($this) {
            self::METER_INSTALLATION => 'meter-installations',
            self::METER_ACTIVATION   => 'meter-activations',
            self::METER_INSPECTION   => 'meter-inspections',
            self::TAMPER_CODE        => 'tamper-code-requests',
            self::CLEAR_CODE         => 'clear-code-requests',
        };
    }

    public function needsZvend(): bool
    {
        return $this !== self::METER_INSPECTION;
    }

    public static function fromModel(object $operation): self
    {
        return self::from($operation->getMorphClass());
    }
}

/** Canonical status model — arbitrary status changes are impossible; only the engine moves these. */
enum OperationStatus: string
{
    case DRAFT      = 'DRAFT';
    case PENDING    = 'PENDING';
    case SUBMITTED  = 'SUBMITTED';
    case IN_REVIEW  = 'IN_REVIEW';
    case APPROVED   = 'APPROVED';
    case REJECTED   = 'REJECTED';
    case RETURNED   = 'RETURNED';
    case PROCESSING = 'PROCESSING';
    case WAITING_ZVEND = 'WAITING_ZVEND';
    case ZVEND_SUCCESS = 'ZVEND_SUCCESS';
    case ZVEND_FAILED  = 'ZVEND_FAILED';
    case ASSIGNED   = 'ASSIGNED';
    case IN_PROGRESS = 'IN_PROGRESS';
    case COMPLETED  = 'COMPLETED';
    case CANCELLED  = 'CANCELLED';
}

enum WorkflowStage: string
{
    case INITIATOR      = 'INITIATOR';
    case SCHEDULE       = 'SCHEDULE';
    case SECRETARY      = 'SECRETARY';
    case ENERGY_MANAGER = 'ENERGY_MANAGER';
    case GENERAL_MANAGER = 'GENERAL_MANAGER';
    case MD             = 'MD';
    case ZVEND          = 'ZVEND';
    case DELIVERY       = 'DELIVERY';
    case EXECUTION      = 'EXECUTION';
    case COMPLETED      = 'COMPLETED';

    public function label(): string
    {
        return match ($this) {
            self::INITIATOR       => 'Initiator',
            self::SCHEDULE        => 'Scheduled by GM',
            self::SECRETARY       => 'Secretary Review',
            self::ENERGY_MANAGER  => 'Energy Manager Approval',
            self::GENERAL_MANAGER => 'General Manager Approval',
            self::MD              => 'MD Final Approval',
            self::ZVEND           => 'ZVend API',
            self::DELIVERY        => 'Result Delivery',
            self::EXECUTION       => 'Field Execution',
            self::COMPLETED       => 'Completed',
        };
    }
}

enum WorkflowDecision: string
{
    case SUBMIT       = 'submit';
    case APPROVE      = 'approve';
    case REJECT       = 'reject';
    case RETURN       = 'return';
    case EXECUTE      = 'execute';
    case DELIVER      = 'deliver';
    case CONFIRM      = 'confirm';
    case ZVEND_SUCCESS = 'zvend_success';
    case ZVEND_FAILED  = 'zvend_failed';
}
