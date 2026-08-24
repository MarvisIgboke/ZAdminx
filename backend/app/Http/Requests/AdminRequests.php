<?php

/*
 * Administration Form Requests (classmap autoloaded): users, role matrix,
 * system settings, API settings, delegations.
 */

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('users.manage');
    }

    public function rules(): array
    {
        return [
            'name'          => ['required', 'string', 'max:120'],
            'email'         => ['required', 'email', 'unique:users,email'],
            'password'      => ['required', 'string', 'min:8'],
            'role_id'       => ['required', 'exists:roles,id'],
            'employee_code' => ['nullable', 'string', 'max:20', 'unique:users,employee_code'],
            'phone'         => ['nullable', 'string', 'max:30'],
        ];
    }
}

class SyncRolePermissionsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('roles.manage');
    }

    public function rules(): array
    {
        return [
            'permission_ids'   => ['required', 'array'],
            'permission_ids.*' => ['exists:permissions,id'],
        ];
    }
}

class UpdateSettingRequest extends FormRequest
{
    public const ALLOWED_KEYS = ['max_gps_accuracy_m', 'inspection_durations', 'default_inspection_duration'];

    public function authorize(): bool
    {
        return $this->user()->hasPermission('settings.manage')
            && in_array($this->route('key'), self::ALLOWED_KEYS, true);
    }

    public function rules(): array
    {
        return match ($this->route('key')) {
            'max_gps_accuracy_m'        => ['value' => ['required', 'numeric', 'between:1,500']],
            'inspection_durations'      => ['value' => ['required', 'array', 'min:1'], 'value.*' => ['integer', 'between:10,3600']],
            'default_inspection_duration' => ['value' => ['required', 'integer', 'between:10,3600']],
            default                     => ['value' => ['required']],
        };
    }
}

class UpdateApiSettingRequest extends FormRequest
{
    public const ALLOWED_KEYS = ['zvend_base_url', 'zvend_api_token', 'zvend_timeout', 'zvend_retry_count'];

    public function authorize(): bool
    {
        return $this->user()->hasPermission('api_settings.manage')
            && in_array($this->route('key'), self::ALLOWED_KEYS, true);
    }

    public function rules(): array
    {
        return match ($this->route('key')) {
            'zvend_base_url'    => ['value' => ['required', 'url', 'max:255']],
            'zvend_api_token'   => ['value' => ['required', 'string', 'min:8']],
            'zvend_timeout'     => ['value' => ['required', 'integer', 'between:3,120']],
            'zvend_retry_count' => ['value' => ['required', 'integer', 'between:0,10']],
            default             => ['value' => ['required']],
        };
    }
}

class StoreDelegationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('delegations.manage');
    }

    public function rules(): array
    {
        return [
            'delegator_id' => ['required', 'exists:users,id'],
            'delegate_id'  => ['required', 'exists:users,id', 'different:delegator_id'],
            'starts_on'    => ['required', 'date'],
            'ends_on'      => ['required', 'date', 'after_or_equal:starts_on'],
            'reason'       => ['required', 'string', 'min:5', 'max:500'],
        ];
    }
}
