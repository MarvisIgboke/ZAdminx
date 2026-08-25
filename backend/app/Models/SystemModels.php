<?php

/*
 * Integration + system models (classmap autoloaded): ApiSetting, ApiRequest,
 * ApiResponse, IdempotencyKey, SyncLog, AuditLog (append-only),
 * AppNotification, SystemSetting.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Runtime ZVend configuration managed by the IT Manager.
 * Secret values are encrypted at rest via APP_KEY.
 */
class ApiSetting extends Model
{
    protected $fillable = ['key', 'value', 'is_secret', 'updated_by'];

    protected function casts(): array
    {
        return ['is_secret' => 'boolean'];
    }

    protected function value(): Attribute
    {
        return Attribute::make(
            get: fn ($raw) => $this->is_secret && $raw ? decrypt($raw) : $raw,
            set: fn ($v) => $this->is_secret && $v ? encrypt($v) : $v,
        );
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}

class ApiRequest extends Model
{
    protected $fillable = [
        'user_id', 'operation_type', 'operation_id', 'transaction_id', 'method',
        'endpoint', 'idempotency_key', 'request_payload', 'status', 'started_at', 'duration_ms',
    ];

    protected function casts(): array
    {
        return [
            'request_payload' => 'array',
            'started_at'      => 'datetime',
        ];
    }

    public function response(): HasOne
    {
        return $this->hasOne(ApiResponse::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

class ApiResponse extends Model
{
    protected $fillable = ['api_request_id', 'response_code', 'response_body', 'received_at'];

    protected function casts(): array
    {
        return [
            'response_body' => 'array',
            'received_at'   => 'datetime',
        ];
    }

    public function request(): BelongsTo
    {
        return $this->belongsTo(ApiRequest::class, 'api_request_id');
    }
}

/** Duplicate approvals and duplicate ZVend transactions die here. */
class IdempotencyKey extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['key', 'operation_type', 'operation_id', 'purpose', 'response_snapshot', 'consumed_at'];

    protected function casts(): array
    {
        return [
            'response_snapshot' => 'array',
            'consumed_at'       => 'datetime',
        ];
    }

    public function consume(array $snapshot): void
    {
        $this->forceFill(['consumed_at' => now(), 'response_snapshot' => $snapshot])->save();
    }
}

class SyncLog extends Model
{
    protected $fillable = [
        'source', 'entity', 'direction', 'records_processed', 'records_failed',
        'status', 'error_message', 'started_at', 'finished_at', 'triggered_by',
    ];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'finished_at' => 'datetime'];
    }

    public function trigger(): BelongsTo
    {
        return $this->belongsTo(User::class, 'triggered_by');
    }
}

/** Append-only. No updated_at column, no update/delete code paths. */
class AuditLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id', 'user_name', 'action', 'auditable_type', 'auditable_id',
        'transaction_id', 'detail', 'ip_address', 'user_agent',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

/** In-app notifications addressed to a role and/or a specific user. */
class AppNotification extends Model
{
    use HasUuids;

    public const UPDATED_AT = null;

    protected $table = 'notifications';

    protected $fillable = [
        'for_role', 'for_user_id', 'kind', 'title', 'body',
        'transaction_id', 'operation_type', 'operation_id', 'read_at',
    ];

    protected function casts(): array
    {
        return ['read_at' => 'datetime'];
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'for_user_id');
    }

    public function scopeFor($query, User $user)
    {
        return $query->where(fn ($q) => $q
            ->where('for_user_id', $user->id)
            ->orWhereIn('for_role', $user->roles->pluck('name'))
        );
    }
}

class SystemSetting extends Model
{
    protected $fillable = ['key', 'value', 'group', 'label', 'updated_by'];

    protected function casts(): array
    {
        return ['value' => 'array'];
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public static function read(string $key, $default = null)
    {
        return static::where('key', $key)->value('value') ?? $default;
    }
}
