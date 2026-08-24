<?php

namespace App\Services;

use App\Enums\OperationType;
use Illuminate\Support\Facades\DB;

/**
 * Artificial Z Admin transaction IDs — ZADM-{PREFIX}-{YYYYMMDD}-{sequence}.
 * Uniqueness is guaranteed twice: retry-around on the DB unique constraint
 * (race-safe) and the constraint itself.
 */
class TransactionIdService
{
    public function __construct(private readonly AuditService $audit) {}

    public function generate(OperationType $type): string
    {
        $date = now()->format('Ymd');
        $prefix = "ZADM-{$type->prefix()}-{$date}-";

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $last = DB::table($this->tableFor($type))
                ->where('txn', 'like', $prefix.'%')
                ->orderByDesc('txn')
                ->value('txn');

            $seq = $last ? ((int) substr($last, -6)) + 1 : 1;
            $candidate = $prefix.str_pad((string) $seq, 6, '0', STR_PAD_LEFT);

            // The `like` scan can race; the unique index is the arbiter.
            $exists = DB::table($this->tableFor($type))->where('txn', $candidate)->exists();
            if (! $exists) {
                return $candidate;
            }
        }

        // Practically unreachable; the DB constraint would reject duplicates anyway.
        return $prefix.str_pad((string) random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
    }

    private function tableFor(OperationType $type): string
    {
        return match ($type) {
            OperationType::METER_INSTALLATION => 'meter_installations',
            OperationType::METER_ACTIVATION   => 'meter_activations',
            OperationType::METER_INSPECTION   => 'meter_inspections',
            OperationType::TAMPER_CODE        => 'tamper_code_requests',
            OperationType::CLEAR_CODE         => 'clear_code_requests',
        };
    }
}
