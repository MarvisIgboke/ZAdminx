<?php

namespace App\Jobs;

use App\Models\Customer;
use App\Models\Facility;
use App\Models\Meter;
use App\Models\SyncLog;
use App\Services\AuditService;
use App\Services\ZVendApiService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

/**
 * Hybrid sync: Z Admin keeps its own operational database while ZVend stays
 * the source of truth for catalog data. Manual via POST /sync/zvend and
 * architecture-ready for scheduled runs (console scheduler → dispatch).
 */
class SyncZVendDataJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public readonly ?int $triggeredBy = null) {}

    public function handle(ZVendApiService $zvend, AuditService $audit): void
    {
        $log = SyncLog::create([
            'entity' => 'facilities', 'status' => 'running',
            'started_at' => now(), 'triggered_by' => $this->triggeredBy,
        ]);

        $processed = 0;
        $failed = 0;

        try {
            $facilities = $zvend->getFacilities()['body']['data'] ?? [];

            foreach ($facilities as $row) {
                try {
                    Facility::updateOrCreate(
                        ['zvend_facility_id' => (string) $row['id']],
                        [
                            'code' => $row['code'] ?? ('ZV-'.strtoupper($row['id'])),
                            'name' => $row['name'],
                            'address' => $row['address'] ?? null,
                            'city' => $row['city'] ?? null,
                            'state' => $row['state'] ?? null,
                            'latitude' => $row['latitude'] ?? null,
                            'longitude' => $row['longitude'] ?? null,
                            'status' => strtoupper($row['status'] ?? 'ACTIVE'),
                            'last_synced_at' => now(),
                        ]
                    );
                    $processed++;
                } catch (Throwable) {
                    $failed++;
                }
            }

            $log->forceFill([
                'status' => $failed === 0 ? 'success' : 'failed',
                'records_processed' => $processed,
                'records_failed' => $failed,
                'finished_at' => now(),
            ])->save();

            Facility::query()->update(['last_synced_at' => now()]);
            $audit->log('sync_completed', "ZVend facility sync: {$processed} processed, {$failed} failed.");
        } catch (Throwable $e) {
            $log->forceFill([
                'status' => 'failed',
                'error_message' => substr($e->getMessage(), 0, 500),
                'finished_at' => now(),
            ])->save();

            $audit->log('sync_failed', 'ZVend sync failed: '.substr($e->getMessage(), 0, 200));

            throw $e;
        }
    }
}
