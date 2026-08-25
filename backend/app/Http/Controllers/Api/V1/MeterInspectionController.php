<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\ScheduleMeterInspection;
use App\Actions\SubmitFieldCapture;
use App\Enums\OperationStatus;
use App\Enums\WorkflowDecision;
use App\Exceptions\WorkflowException;
use App\Http\Requests\ScheduleInspectionRequest;
use App\Http\Resources\OperationResource;
use App\Models\MeterInspection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MeterInspectionController extends OperationController
{
    protected function modelClass(): string
    {
        return MeterInspection::class;
    }

    /** GM-only scheduling; duration comes from configured options. */
    public function schedule(ScheduleInspectionRequest $request, ScheduleMeterInspection $action): OperationResource
    {
        $inspection = $action->execute($request->user(), $request->validated());

        return new OperationResource($inspection->load('steps'));
    }

    /**
     * Technical Man starts the physical inspection: barcode scan (mismatch =
     * hard stop), GPS capture, then the video recorder runs for the
     * configured duration on the client. Rejected inspections may be
     * restarted (retry counter increments).
     */
    public function start(Request $request, int $id, SubmitFieldCapture $capture): OperationResource
    {
        $inspection = $this->findOrFail($id);

        if (! in_array($inspection->status, [OperationStatus::PENDING->value, OperationStatus::IN_PROGRESS->value, OperationStatus::REJECTED->value], true)
            || $inspection->current_stage !== 'EXECUTION') {
            throw new WorkflowException('This inspection is not awaiting field execution.', 'WORKFLOW_WRONG_STAGE');
        }

        $wasRejected = $inspection->status === OperationStatus::REJECTED->value;

        DB::transaction(function () use ($request, $inspection, $capture, $wasRejected) {
            $capture->execute(
                $request->user(),
                $inspection,
                $request->validate([
                    'scan_value'   => ['required', 'string'],
                    'gps'          => ['required', 'array'],
                    'gps.latitude' => ['required', 'numeric', 'between:-90,90'],
                    'gps.longitude' => ['required', 'numeric', 'between:-180,180'],
                    'gps.accuracy' => ['required', 'numeric', 'min:0'],
                ]),
            );

            $inspection->forceFill([
                'status'         => OperationStatus::IN_PROGRESS->value,
                'started_at'     => $inspection->started_at ?? now(),
                'performed_by_id' => $request->user()->id,
                'assigned_to_id' => $request->user()->id,
                'retry_count'    => $wasRejected ? $inspection->retry_count + 1 : $inspection->retry_count,
            ])->save();
        });

        $this->audit->log('inspection_started', "Inspection {$inspection->txn} started in the field.", $inspection, $inspection->txn);

        return new OperationResource($inspection->refresh());
    }

    /** Technical Man submits the recording + observations → Secretary review. */
    public function submit(Request $request, int $id, SubmitFieldCapture $capture): OperationResource
    {
        $inspection = $this->findOrFail($id);

        $data = $request->validate([
            'scan_value'    => ['required', 'string'],
            'gps'           => ['required', 'array'],
            'gps.latitude'  => ['required', 'numeric', 'between:-90,90'],
            'gps.longitude' => ['required', 'numeric', 'between:-180,180'],
            'gps.accuracy'  => ['required', 'numeric', 'min:0'],
            'observations'  => ['required', 'string', 'min:5'],
            'video'         => ['required', 'file', 'mimes:mp4,webm', 'max:204800'],
            'video_duration_seconds' => ['required', 'integer', 'min:5'],
            'comment'       => ['nullable', 'string'],
            'idempotency_key' => ['nullable', 'string', 'max:128'],
        ]);

        $inspection = DB::transaction(function () use ($request, $inspection, $capture, $data) {
            $capture->execute($request->user(), $inspection, $data, [], $request->file('video'));

            $video = $inspection->attachments()->where('kind', 'video')->latest('id')->first();

            $inspection->forceFill([
                'video_disk'             => $video?->disk,
                'video_path'             => $video?->path,
                'video_duration_seconds' => $data['video_duration_seconds'],
                'observations'           => $data['observations'],
                'submitted_at'           => now(),
            ])->save();

            return $this->engine->decide(
                $inspection,
                WorkflowDecision::EXECUTE,
                $request->user(),
                $data['comment'] ?: 'Inspection recording submitted.',
                $data['idempotency_key'] ?? null,
            );
        });

        return new OperationResource($inspection);
    }
}
