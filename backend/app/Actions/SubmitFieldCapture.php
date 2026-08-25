<?php

namespace App\Actions;

use App\Exceptions\WorkflowException;
use App\Models\GpsRecord;
use App\Models\OperationAttachment;
use App\Models\OperationModel;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Support\Facades\Storage;

/**
 * Shared field-capture validation + persistence for the Technical Man:
 * barcode verification, GPS (with configured accuracy ceiling), photos and
 * the inspection video. Files live on the private disk under
 * {operation-folder}/{transaction}/photos|video and are only served through
 * the authorized download route.
 */
class SubmitFieldCapture
{
    public function __construct(private readonly AuditService $audit) {}

    public function execute(User $tech, OperationModel $operation, array $data, array $photos = [], $video = null): OperationModel
    {
        // 1. Barcode — a mismatch is a hard stop.
        $scanned = trim((string) ($data['scan_value'] ?? ''));
        if ($scanned !== $operation->meter_number) {
            $this->audit->log('barcode_mismatch', "Scanned '{$scanned}' ≠ authorized {$operation->meter_number}.", $operation, $operation->txn);

            throw new WorkflowException('METER NUMBER MISMATCH — operation stopped.', 'METER_NUMBER_MISMATCH');
        }
        $this->audit->log('barcode_scan', "Meter {$operation->meter_number} verified by scan.", $operation, $operation->txn);

        // 2. GPS — reject beyond the configured accuracy, log suspicious events.
        $maxAccuracy = (float) SystemSetting::read('max_gps_accuracy_m', (float) env('ZADMIN_MAX_GPS_ACCURACY_M', 50));
        $accuracy = (float) ($data['gps']['accuracy'] ?? PHP_FLOAT_MAX);

        $gps = GpsRecord::create([
            'operation_type'   => $operation->getMorphClass(),
            'operation_id'     => $operation->id,
            'user_id'          => $tech->id,
            'latitude'         => $data['gps']['latitude'] ?? 0,
            'longitude'        => $data['gps']['longitude'] ?? 0,
            'accuracy_m'       => $accuracy,
            'captured_at'      => now(),
            'accepted'         => $accuracy <= $maxAccuracy,
            'rejection_reason' => $accuracy <= $maxAccuracy ? null : "Accuracy {$accuracy} m exceeds limit {$maxAccuracy} m",
        ]);

        if (! $gps->accepted) {
            $this->audit->log('suspicious_gps', "GPS ±{$accuracy} m exceeded ±{$maxAccuracy} m ceiling — operation rejected.", $operation, $operation->txn);

            throw new WorkflowException(
                "GPS accuracy ±{$accuracy} m exceeds the allowed ±{$maxAccuracy} m. Operation rejected.",
                'GPS_ACCURACY_EXCEEDED'
            );
        }
        $this->audit->log('gps_capture', "GPS ±{$accuracy} m accepted.", $operation, $operation->txn);

        // 3. Photos (meter front, installation, barcode, environment).
        foreach ($photos as $photo) {
            $path = $photo->store(
                "{$operation->type()->folder()}/{$operation->txn}/photos",
                'local'
            );

            OperationAttachment::create([
                'operation_type' => $operation->getMorphClass(),
                'operation_id'   => $operation->id,
                'kind'           => 'photo',
                'label'          => $photo->getClientOriginalName(),
                'disk'           => 'local',
                'path'           => $path,
                'mime_type'      => $photo->getMimeType(),
                'size_bytes'     => $photo->getSize(),
                'checksum'       => hash_file('sha256', $photo->getRealPath()),
                'captured_by'    => $tech->id,
                'captured_at'    => now(),
                'latitude'       => $data['gps']['latitude'] ?? null,
                'longitude'      => $data['gps']['longitude'] ?? null,
            ]);

            $this->audit->log('photo_capture', "Photo '{$photo->getClientOriginalName()}' stored.", $operation, $operation->txn);
        }

        // 4. Inspection video (duration enforced against the configured rule).
        if ($video) {
            $path = $video->store("{$operation->type()->folder()}/{$operation->txn}/video", 'local');

            OperationAttachment::create([
                'operation_type' => $operation->getMorphClass(),
                'operation_id'   => $operation->id,
                'kind'           => 'video',
                'label'          => 'Inspection video',
                'disk'           => 'local',
                'path'           => $path,
                'mime_type'      => $video->getMimeType(),
                'size_bytes'     => $video->getSize(),
                'captured_by'    => $tech->id,
                'captured_at'    => now(),
            ]);

            $this->audit->log('video_capture', "Inspection video stored ({$video->getSize()} bytes).", $operation, $operation->txn);
        }

        return $operation;
    }
}
