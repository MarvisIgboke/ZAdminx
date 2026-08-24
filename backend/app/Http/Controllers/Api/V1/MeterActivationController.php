<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\SubmitFieldCapture;
use App\Enums\OperationStatus;
use App\Enums\RoleName;
use App\Enums\WorkflowDecision;
use App\Http\Requests\StoreActivationRequest;
use App\Http\Resources\OperationResource;
use App\Models\Customer;
use App\Models\Meter;
use App\Models\MeterActivation;
use App\Services\TransactionIdService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MeterActivationController extends OperationController
{
    protected function modelClass(): string
    {
        return MeterActivation::class;
    }

    /**
     * Technical Man initiates the physical activation: scan + GPS + photos +
     * customer data, submitted as one atomic capture. The Secretary cannot
     * reach this endpoint (permission-gated + initiator-stage enforced).
     */
    public function store(
        StoreActivationRequest $request,
        SubmitFieldCapture $capture,
        TransactionIdService $txns,
    ): OperationResource {
        $activation = DB::transaction(function () use ($request, $capture, $txns) {
            $data = $request->validated();

            $customer = Customer::firstOrCreate(
                ['name' => $data['customer']['name'], 'phone' => $data['customer']['phone'], 'facility_id' => $data['facility_id']],
                ['email' => $data['customer']['email'] ?? null, 'address' => $data['customer']['address'] ?? null, 'status' => 'ACTIVE']
            );

            $activation = new MeterActivation([
                'status'           => OperationStatus::SUBMITTED->value,
                'meter_number'     => $data['meter_number'],
                'meter_id'         => Meter::where('meter_number', $data['meter_number'])->value('id'),
                'facility_id'      => $data['facility_id'],
                'initiator_id'     => $request->user()->id,
                'initiator_role'   => RoleName::TECHNICAL_MAN->value,
                'customer_id'      => $customer->id,
                'customer_name'    => $data['customer']['name'],
                'customer_phone'   => $data['customer']['phone'],
                'customer_email'   => $data['customer']['email'] ?? null,
                'customer_address' => $data['customer']['address'] ?? null,
                'technical_comment' => $data['comment'] ?? null,
            ]);
            $activation->txn = $txns->generate($activation);
            $activation->save();

            // Barcode mismatch / GPS ceiling violations abort the transaction.
            $capture->execute($request->user(), $activation, $data, $request->file('photos', []));

            $this->engine->start($activation, $request->user(), $data['comment'] ?: 'Field capture submitted.');

            return $activation;
        });

        return new OperationResource($activation->refresh()->load('steps'));
    }

    /** Technical Man adds/replaces field evidence (e.g. after a RETURN). */
    public function capture(Request $request, int $id, SubmitFieldCapture $capture): OperationResource
    {
        $activation = $this->findOrFail($id);

        if (! in_array($activation->status, [OperationStatus::SUBMITTED->value, OperationStatus::RETURNED->value, OperationStatus::PENDING->value], true)) {
            return new OperationResource($activation);
        }

        $capture->execute(
            $request->user(),
            $activation,
            $request->validate([
                'scan_value' => ['required', 'string'],
                'gps' => ['required', 'array'],
                'gps.latitude' => ['required', 'numeric', 'between:-90,90'],
                'gps.longitude' => ['required', 'numeric', 'between:-180,180'],
                'gps.accuracy' => ['required', 'numeric', 'min:0'],
            ]),
            $request->file('photos', []),
        );

        return new OperationResource($activation->refresh()->load('attachments'));
    }

    /**
     * Secretary completion after ZVend success (DELIVERY confirm). The route
     * middleware uses the approval permission; the engine additionally
     * verifies the actor owns the DELIVERY stage.
     */
    public function complete(Request $request, int $id): OperationResource
    {
        $activation = $this->findOrFail($id);

        $activation = $this->engine->decide(
            $activation,
            WorkflowDecision::CONFIRM,
            $request->user(),
            $request->input('comment', 'Activation confirmed after ZVend success.'),
            $request->input('idempotency_key'),
        );

        if ($activation->status === 'COMPLETED') {
            Meter::where('id', $activation->meter_id)->update([
                'status' => 'ACTIVE',
                'customer_id' => $activation->customer_id,
            ]);
            $this->audit->log('meter_status_change', "Meter {$activation->meter_number} → ACTIVE (energized).", $activation, $activation->txn);
        }

        return new OperationResource($activation);
    }
}
