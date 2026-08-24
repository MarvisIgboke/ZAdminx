<?php

/*
 * Workflow bookkeeping models (classmap autoloaded):
 * WorkflowStep, WorkflowComment (append-only), OperationAttachment, GpsRecord.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class WorkflowStep extends Model
{
    protected $fillable = [
        'operation_type', 'operation_id', 'stage_key', 'stage_label', 'role',
        'user_id', 'decision', 'decided_by_delegation', 'comment_id',
        'decided_at', 'is_current',
    ];

    protected function casts(): array
    {
        return [
            'decided_at'             => 'datetime',
            'decided_by_delegation'  => 'boolean',
            'is_current'             => 'boolean',
        ];
    }

    public function operation(): MorphTo
    {
        return $this->morphTo();
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function comment(): BelongsTo
    {
        return $this->belongsTo(WorkflowComment::class, 'comment_id');
    }
}

/**
 * Append-only: previous comments are never updated and never deleted.
 * updated_at does not exist on this table.
 */
class WorkflowComment extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['transaction_id', 'operation_type', 'operation_id', 'user_id', 'role', 'comment'];

    public function operation(): MorphTo
    {
        return $this->morphTo();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

class OperationAttachment extends Model
{
    protected $fillable = [
        'operation_type', 'operation_id', 'kind', 'label', 'disk', 'path',
        'mime_type', 'size_bytes', 'checksum', 'captured_by', 'captured_at',
        'latitude', 'longitude',
    ];

    protected function casts(): array
    {
        return [
            'captured_at' => 'datetime',
            'latitude'    => 'decimal:7',
            'longitude'   => 'decimal:7',
        ];
    }

    public function operation(): MorphTo
    {
        return $this->morphTo();
    }

    public function capturer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'captured_by');
    }
}

class GpsRecord extends Model
{
    protected $fillable = [
        'operation_type', 'operation_id', 'user_id', 'latitude', 'longitude',
        'accuracy_m', 'captured_at', 'accepted', 'rejection_reason',
    ];

    protected function casts(): array
    {
        return [
            'captured_at' => 'datetime',
            'latitude'    => 'decimal:7',
            'longitude'   => 'decimal:7',
            'accuracy_m'  => 'decimal:2',
            'accepted'    => 'boolean',
        ];
    }

    public function operation(): MorphTo
    {
        return $this->morphTo();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
