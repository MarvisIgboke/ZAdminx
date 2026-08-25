<?php

/*
 * API Resources (classmap autoloaded): OperationResource, FacilityResource.
 * Tamper/clear codes are masked by default — plaintext is served only by the
 * audited reveal endpoints.
 */

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OperationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'type'          => $this->getMorphClass(),
            'txn'           => $this->txn,
            'status'        => $this->status,
            'current_stage' => $this->current_stage,
            'stage_index'   => $this->stage_index,
            'meter_number'  => $this->meter_number,
            'meter_id'      => $this->meter_id,
            'facility'      => $this->whenLoaded('facility', fn () => $this->facility?->only(['id', 'code', 'name'])),
            'initiator'     => $this->whenLoaded('initiator', fn () => $this->initiator?->only(['id', 'name'])),
            'initiator_role' => $this->initiator_role,
            'assignee'      => $this->whenLoaded('assignee', fn () => $this->assignee?->only(['id', 'name'])),

            // Operation-specific extras ---------------------------------------
            'secretary_comment'  => $this->when(isset($this->secretary_comment), $this->secretary_comment),
            'technical_comment'  => $this->when(isset($this->technical_comment), $this->technical_comment),
            'reason'             => $this->when(isset($this->reason), $this->reason),
            'requested_via'      => $this->when(isset($this->requested_via), $this->requested_via),
            'instruction'        => $this->when(isset($this->instruction), $this->instruction),
            'scheduled_for'      => $this->when(isset($this->scheduled_for), $this->scheduled_for?->toDateString()),
            'duration_seconds'   => $this->when(isset($this->duration_seconds), $this->duration_seconds),
            'observations'       => $this->when(isset($this->observations), $this->observations),
            'video_url'          => $this->when(! empty($this->video_path), fn () => url("/api/v1/attachments/{$this->attachments()->where('kind', 'video')->value('id')}/download")),
            'customer'           => $this->when(isset($this->customer_name), [
                'name' => $this->customer_name, 'phone' => $this->customer_phone,
                'email' => $this->customer_email, 'address' => $this->customer_address,
            ]),

            // ZVend block — codes always masked here ---------------------------
            'md_approved_at'      => $this->md_approved_at,
            'zvend_status'        => $this->zvend_status,
            'zvend_reference'     => $this->zvend_reference,
            'zvend_response_code' => $this->zvend_response_code,
            'zvend_called_at'     => $this->zvend_called_at,
            'tamper_code_masked'  => $this->mask($this->tamper_code),
            'clear_code_masked'   => $this->mask($this->clear_code),
            'issued_code_masked'  => $this->mask($this->issued_code ?? null),

            'available_to_field_at' => $this->available_to_field_at,
            'retry_count'           => $this->retry_count,
            'completed_at'          => $this->completed_at,
            'created_at'            => $this->created_at,
            'updated_at'            => $this->updated_at,

            'steps'       => WorkflowStepResource::collection($this->whenLoaded('steps')),
            'comments'    => $this->whenLoaded('comments', fn () => $this->comments->map(fn ($c) => [
                'id' => $c->id, 'user' => $c->user?->only(['id', 'name']), 'role' => $c->role,
                'comment' => $c->comment, 'created_at' => $c->created_at,
            ])),
            'attachments' => $this->whenLoaded('attachments', fn () => $this->attachments->map(fn ($a) => [
                'id' => $a->id, 'kind' => $a->kind, 'label' => $a->label,
                'captured_at' => $a->captured_at, 'url' => url("/api/v1/attachments/{$a->id}/download"),
            ])),
            'gps_records' => $this->whenLoaded('gpsRecords', fn () => $this->gpsRecords->map(fn ($g) => [
                'latitude' => $g->latitude, 'longitude' => $g->longitude,
                'accuracy_m' => $g->accuracy_m, 'accepted' => $g->accepted, 'captured_at' => $g->captured_at,
            ])),
        ];
    }

    private function mask(?string $code): ?string
    {
        return $code ? '•••• •••• •••• •••• ••••' : null;
    }
}

class WorkflowStepResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'stage_key'   => $this->stage_key,
            'stage_label' => $this->stage_label,
            'role'        => $this->role,
            'decision'    => $this->decision,
            'decided_by_delegation' => $this->decided_by_delegation,
            'decider'     => $this->whenLoaded('decider', fn () => $this->decider?->only(['id', 'name'])),
            'comment'     => $this->whenLoaded('comment', fn () => $this->comment?->only(['comment', 'created_at'])),
            'decided_at'  => $this->decided_at,
            'is_current'  => $this->is_current,
        ];
    }
}

class FacilityResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'              => $this->id,
            'code'            => $this->code,
            'name'            => $this->name,
            'address'         => $this->address,
            'city'            => $this->city,
            'state'           => $this->state,
            'latitude'        => $this->latitude,
            'longitude'       => $this->longitude,
            'status'          => $this->status,
            'zvend_id'        => $this->zvend_facility_id,
            'last_synced_at'  => $this->last_synced_at,
            'customers_count' => $this->when(isset($this->customers_count), $this->customers_count),
            'meters_count'    => $this->when(isset($this->meters_count), $this->meters_count),
        ];
    }
}
