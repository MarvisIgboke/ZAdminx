<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\CreateMeterInstallation;
use App\Actions\SubmitFieldCapture;
use App\Enums\WorkflowDecision;
use App\Http\Requests\FieldCaptureRequest;
use App\Http\Requests\StoreMeterInstallationRequest;
use App\Http\Resources\OperationResource;
use App\Models\Meter;
use App\Models\MeterInstallation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MeterInstallationController extends OperationController
{
    protected function modelClass(): string
    {
        return MeterInstallation::class;
    }

    /** Secretary initiates — the new meter is NOT checked against ZVend here. */
    public function store(StoreMeterInstallationRequest $request, CreateMeterInstallation $action): OperationResource
    {
        $installation = $action->execute($request->user(), $request->validated());

        return new OperationResource($installation->load('steps'));
    }

    /** Secretary: MAKE AVAILABLE TO TECHNICAL MAN (DELIVERY stage). */
    public function release(Request $request, int $id): OperationResource
    {
        $installation = $this->findOrFail($id);

        $installation = $this->engine->decide(
            $installation,
            WorkflowDecision::DELIVER,
            $request->user(),
            $request->input('comment', 'Made available to Technical Man.'),
            $request->input('idempotency_key'),
        );

        return new OperationResource($installation);
    }

    /**
     * Technical Man executes: barcode scan → GPS → photos → customer data.
     * Mismatched barcodes and out-of-ceiling GPS abort inside the transaction.
     */
    public function execute(FieldCaptureRequest $request, int $id, SubmitFieldCapture $capture): OperationResource
    {
        $installation = $this->findOrFail($id);

        $installation = DB::transaction(function () use ($request, $installation, $capture) {
            $capture->execute(
                $request->user(),
                $installation,
                $request->validated(),
                $request->file('photos', []),
            );

            // ASSIGN: the record becomes this Technical Man's task.
            $installation->forceFill(['assigned_to_id' => $request->user()->id])->save();

            $installation = $this->engine->decide(
                $installation,
                WorkflowDecision::EXECUTE,
                $request->user(),
                $request->input('comment', 'Installation executed in the field.'),
                $request->input('idempotency_key'),
            );

            if ($installation->status === 'COMPLETED') {
                Meter::where('id', $installation->meter_id)->update([
                    'status' => 'INSTALLED',
                    'installed_at' => now(),
                ]);
                $this->audit->log('meter_status_change', "Meter {$installation->meter_number} → INSTALLED.", $installation, $installation->txn);
            }

            return $installation;
        });

        return new OperationResource($installation);
    }
}
