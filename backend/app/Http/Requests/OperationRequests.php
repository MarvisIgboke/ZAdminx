<?php

/*
 * Form Requests for the five core operations (classmap autoloaded).
 * Frontend validation is never trusted — these rules are the contract.
 */

namespace App\Http\Requests;

use App\Models\Meter;
use App\Models\MeterInstallation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreMeterInstallationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('create_meter_installation');
    }

    public function rules(): array
    {
        return [
            // Numerals only; duplicates rejected here AND by the DB constraint.
            'meter_number' => [
                'required', 'string', 'regex:/^\d+$/', 'min:6', 'max:30',
                Rule::unique('meters', 'meter_number'),
                Rule::unique('meter_installations', 'meter_number'),
            ],
            'facility_id' => ['required', 'exists:facilities,id'],
            'comment'     => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'meter_number.regex'  => 'Meter number must contain numerals only.',
            'meter_number.unique' => 'This meter number already exists.',
        ];
    }
}

/** Every workflow decision REQUIRES a comment; idempotency keys are optional. */
class WorkflowDecisionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // capability checked by route middleware + engine stage ownership
    }

    public function rules(): array
    {
        return [
            'comment'         => ['required', 'string', 'min:2', 'max:2000'],
            'idempotency_key' => ['nullable', 'string', 'max:128'],
        ];
    }
}

class ScheduleInspectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('create_meter_inspection');
    }

    public function rules(): array
    {
        return [
            'facility_id'      => ['required', 'exists:facilities,id'],
            'meter_number'     => ['required', 'string', 'regex:/^\d+$/', 'exists:meters,meter_number'],
            'scheduled_for'    => ['required', 'date', 'after_or_equal:today'],
            'instruction'      => ['required', 'string', 'min:5', 'max:2000'],
            // Validated against the configured options inside the action.
            'duration_seconds' => ['required', 'integer', 'min:10', 'max:3600'],
        ];
    }
}

class StoreActivationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission('create_meter_activation');
    }

    public function rules(): array
    {
        return [
            'meter_number'        => ['required', 'string', 'regex:/^\d+$/', 'exists:meters,meter_number'],
            'facility_id'         => ['required', 'exists:facilities,id'],
            'scan_value'          => ['required', 'string'],
            'gps'                 => ['required', 'array'],
            'gps.latitude'        => ['required', 'numeric', 'between:-90,90'],
            'gps.longitude'       => ['required', 'numeric', 'between:-180,180'],
            'gps.accuracy'        => ['required', 'numeric', 'min:0'],
            'photos'              => ['required', 'array', 'min:4', 'max:8'],
            'photos.*'            => ['image', 'max:5120'],
            'customer'            => ['required', 'array'],
            'customer.name'       => ['required', 'string', 'min:2', 'max:120'],
            'customer.phone'      => ['required', 'string', 'min:7', 'max:30'],
            'customer.email'      => ['nullable', 'email', 'max:150'],
            'customer.address'    => ['nullable', 'string', 'max:255'],
            'comment'             => ['nullable', 'string', 'max:2000'],
        ];
    }
}

class StoreCodeRequest extends FormRequest
{
    public function authorize(): bool
    {
        $type = str_contains($this->path(), 'tamper') ? 'tamper_code' : 'clear_code';

        return $this->user()->hasPermission("create_{$type}");
    }

    public function rules(): array
    {
        return [
            'meter_number' => ['required', 'string', 'regex:/^\d+$/', 'min:6', 'max:30'],
            'facility_id'  => ['nullable', 'exists:facilities,id'],
            'via'          => ['sometimes', Rule::in(['manual', 'scan'])],
            'reason'       => ['nullable', 'string', 'max:2000'],
        ];
    }
}

/**
 * Field capture payloads (installation execute, inspection start/submit,
 * activation capture). GPS bounds and photo limits enforced server-side.
 */
class FieldCaptureRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // per-route execute_* permission middleware applies
    }

    public function rules(): array
    {
        return [
            'scan_value'    => ['required', 'string'],
            'gps'           => ['required', 'array'],
            'gps.latitude'  => ['required', 'numeric', 'between:-90,90'],
            'gps.longitude' => ['required', 'numeric', 'between:-180,180'],
            'gps.accuracy'  => ['required', 'numeric', 'min:0'],
            'photos'        => ['sometimes', 'array', 'max:8'],
            'photos.*'      => ['image', 'max:5120'],
            'comment'       => ['nullable', 'string', 'max:2000'],
            'idempotency_key' => ['nullable', 'string', 'max:128'],
        ];
    }
}
