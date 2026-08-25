<?php

/*
 * The five core operation models (classmap autoloaded). All share the
 * workflow spine through OperationModel; morph aliases are registered in
 * AppServiceProvider so (operation_type, operation_id) resolves polymorphically.
 */

namespace App\Models;

use App\Enums\OperationType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

abstract class OperationModel extends Model
{
    use SoftDeletes;

    protected $guarded = [];

    abstract public function type(): OperationType;

    protected function casts(): array
    {
        return [
            'md_approved_at'        => 'datetime',
            'zvend_called_at'       => 'datetime',
            'available_to_field_at' => 'datetime',
            'completed_at'          => 'datetime',
            'cancelled_at'          => 'datetime',
            // Sensitive codes: encrypted at rest, absent from logs.
            'tamper_code'           => 'encrypted',
            'clear_code'            => 'encrypted',
        ];
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function meter(): BelongsTo
    {
        return $this->belongsTo(Meter::class);
    }

    public function initiator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'initiator_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to_id');
    }

    public function steps(): HasMany
    {
        return $this->hasMany(WorkflowStep::class, 'operation_id')
            ->where('operation_type', $this->getMorphClass())
            ->orderBy('id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(WorkflowComment::class, 'operation_id')
            ->where('operation_type', $this->getMorphClass())
            ->orderBy('id');
    }

    public function attachments(): MorphMany
    {
        return $this->morphMany(OperationAttachment::class, 'operation');
    }

    public function gpsRecords(): MorphMany
    {
        return $this->morphMany(GpsRecord::class, 'operation');
    }

    public function apiRequests(): HasMany
    {
        return $this->hasMany(ApiRequest::class, 'operation_id')
            ->where('operation_type', $this->getMorphClass())
            ->orderByDesc('id');
    }

    /** Codes formatted for secure display; masking happens in the resource. */
    public function hasIssuedCodes(): bool
    {
        return ! empty($this->tamper_code) || ! empty($this->clear_code)
            || ! empty($this->issued_code ?? null);
    }
}

class MeterInstallation extends OperationModel
{
    protected $table = 'meter_installations';

    public function type(): OperationType
    {
        return OperationType::METER_INSTALLATION;
    }
}

class MeterActivation extends OperationModel
{
    protected $table = 'meter_activations';

    public function type(): OperationType
    {
        return OperationType::METER_ACTIVATION;
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}

class MeterInspection extends OperationModel
{
    protected $table = 'meter_inspections';

    protected function casts(): array
    {
        return parent::casts() + [
            'scheduled_for' => 'date',
            'started_at'    => 'datetime',
            'submitted_at'  => 'datetime',
        ];
    }

    public function type(): OperationType
    {
        return OperationType::METER_INSPECTION;
    }

    public function scheduledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'scheduled_by_id');
    }

    public function performedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by_id');
    }
}

class TamperCodeRequest extends OperationModel
{
    protected $table = 'tamper_code_requests';

    protected function casts(): array
    {
        return parent::casts() + [
            'issued_code' => 'encrypted',
            'issued_at'   => 'datetime',
        ];
    }

    public function type(): OperationType
    {
        return OperationType::TAMPER_CODE;
    }
}

class ClearCodeRequest extends OperationModel
{
    protected $table = 'clear_code_requests';

    protected function casts(): array
    {
        return parent::casts() + [
            'issued_code' => 'encrypted',
            'issued_at'   => 'datetime',
        ];
    }

    public function type(): OperationType
    {
        return OperationType::CLEAR_CODE;
    }
}
