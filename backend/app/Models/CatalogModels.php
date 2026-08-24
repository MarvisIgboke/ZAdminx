<?php

/*
 * ZVend-synced catalog models (classmap autoloaded): Facility, Customer, Meter.
 * Customer names are intentionally NOT unique — one customer may hold many
 * meters, and names may collide across customers.
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Facility extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'zvend_facility_id', 'code', 'name', 'address', 'city', 'state',
        'latitude', 'longitude', 'status', 'last_synced_at',
    ];

    protected function casts(): array
    {
        return [
            'latitude'       => 'decimal:7',
            'longitude'      => 'decimal:7',
            'last_synced_at' => 'datetime',
        ];
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class);
    }

    public function meters(): HasMany
    {
        return $this->hasMany(Meter::class);
    }

    public function installations(): HasMany
    {
        return $this->hasMany(MeterInstallation::class);
    }

    public function activations(): HasMany
    {
        return $this->hasMany(MeterActivation::class);
    }

    public function inspections(): HasMany
    {
        return $this->hasMany(MeterInspection::class);
    }
}

class Customer extends Model
{
    use SoftDeletes;

    protected $fillable = ['facility_id', 'zvend_customer_id', 'name', 'phone', 'email', 'address', 'status'];

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function meters(): HasMany
    {
        return $this->hasMany(Meter::class);
    }
}

class Meter extends Model
{
    use SoftDeletes;

    public const STATUSES = ['IN_STOCK', 'INSTALLED', 'ACTIVE', 'FAULTY', 'DECOMMISSIONED'];

    protected $fillable = ['meter_number', 'facility_id', 'customer_id', 'model', 'phase', 'status', 'installed_at'];

    protected function casts(): array
    {
        return ['installed_at' => 'datetime'];
    }

    public function facility(): BelongsTo
    {
        return $this->belongsTo(Facility::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function scopeSearch($query, ?string $term)
    {
        return $term ? $query->where('meter_number', 'like', "%{$term}%") : $query;
    }
}
