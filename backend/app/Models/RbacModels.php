<?php

/*
 * RBAC domain models (classmap autoloaded — see composer.json):
 * User, Role, Permission, Delegation.
 */

namespace App\Models;

use App\Enums\RoleName;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = ['name', 'email', 'password', 'phone', 'employee_code', 'is_active'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password'          => 'hashed',
            'is_active'         => 'boolean',
        ];
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class)->withPivot('created_at');
    }

    /** Permission names for the primary role, cached per request. */
    public function permissionNames(): array
    {
        static $cache = [];

        return $cache[$this->id] ??= $this->roles()
            ->with('permissions')
            ->get()
            ->flatMap->permissions
            ->pluck('name')
            ->unique()
            ->values()
            ->all();
    }

    public function hasPermission(string $name): bool
    {
        return in_array($name, $this->permissionNames(), true);
    }

    public function hasRole(RoleName|string $role): bool
    {
        $name = $role instanceof RoleName ? $role->value : $role;

        return $this->roles->contains(fn (Role $r) => $r->name === $name);
    }

    public function primaryRoleName(): string
    {
        return $this->roles->first()?->name ?? RoleName::SECRETARY->value;
    }

    public function delegationsGiven()
    {
        return $this->hasMany(Delegation::class, 'delegator_id');
    }

    public function delegationsReceived()
    {
        return $this->hasMany(Delegation::class, 'delegate_id');
    }
}

class Role extends \Illuminate\Database\Eloquent\Model
{
    protected $fillable = ['name', 'label', 'description', 'is_system'];

    protected function casts(): array
    {
        return ['is_system' => 'boolean'];
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class);
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class);
    }
}

class Permission extends \Illuminate\Database\Eloquent\Model
{
    protected $fillable = ['name', 'group', 'label'];

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class);
    }
}

/**
 * MD → GM approval delegation. Automatically expires by date; every use is
 * stamped on the workflow step and audited.
 */
class Delegation extends \Illuminate\Database\Eloquent\Model
{
    protected $fillable = ['delegator_id', 'delegate_id', 'starts_on', 'ends_on', 'reason', 'status', 'revoked_at'];

    protected function casts(): array
    {
        return [
            'starts_on'  => 'date',
            'ends_on'    => 'date',
            'revoked_at' => 'datetime',
        ];
    }

    public function delegator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegator_id');
    }

    public function delegate(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegate_id');
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active')
            ->whereDate('starts_on', '<=', now())
            ->whereDate('ends_on', '>=', now());
    }
}
