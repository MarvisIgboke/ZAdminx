<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\WorkflowException;
use App\Http\Resources\FacilityResource;
use App\Jobs\SyncZVendDataJob;
use App\Models\Customer;
use App\Models\Facility;
use App\Models\Meter;
use App\Services\AuditService;
use App\Services\ZVendApiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Read-side ZVend data: Z Admin serves its own synced catalog and proxies
 * vending / funding history straight from ZVend.
 */
class ZVendDataController extends Controller
{
    public function __construct(
        private readonly ZVendApiService $zvend,
        private readonly AuditService $audit,
    ) {}

    public function facilities(Request $request)
    {
        return FacilityResource::collection(
            Facility::query()
                ->withCount(['customers', 'meters'])
                ->when($request->q, fn ($q, $t) => $q->where(fn ($w) => $w->where('name', 'like', "%{$t}%")->orWhere('code', 'like', "%{$t}%")))
                ->orderBy('name')
                ->paginate(min((int) $request->per_page ?: 20, 50))
        );
    }

    public function refresh(Request $request): JsonResponse
    {
        SyncZVendDataJob::dispatch($request->user()->id)->afterCommit();
        $this->audit->log('sync_requested', 'Manual ZVend catalog refresh queued.');

        return response()->json(['message' => 'ZVend refresh queued.'], 202);
    }

    public function facility(int $id): FacilityResource
    {
        return new FacilityResource(Facility::withCount(['customers', 'meters'])->findOrFail($id));
    }

    public function facilityCustomers(int $id)
    {
        return Facility::findOrFail($id)->customers()->withCount('meters')->orderBy('name')->paginate(20);
    }

    public function facilityMeters(int $id)
    {
        return Facility::findOrFail($id)->meters()->with('customer')->orderBy('meter_number')->paginate(20);
    }

    public function facilityOperations(int $id): JsonResponse
    {
        $facility = Facility::findOrFail($id);

        return response()->json([
            'installations' => $facility->installations()->select('id', 'txn', 'status', 'meter_number', 'created_at')->orderByDesc('id')->limit(25)->get(),
            'activations'   => $facility->activations()->select('id', 'txn', 'status', 'meter_number', 'created_at')->orderByDesc('id')->limit(25)->get(),
            'inspections'   => $facility->inspections()->select('id', 'txn', 'status', 'meter_number', 'created_at')->orderByDesc('id')->limit(25)->get(),
        ]);
    }

    public function customers(Request $request)
    {
        return Customer::query()
            ->with('facility')
            ->withCount('meters')
            ->when($request->q, fn ($q, $t) => $q->where(fn ($w) => $w->where('name', 'like', "%{$t}%")->orWhere('phone', 'like', "%{$t}%")))
            ->orderBy('name')
            ->paginate(min((int) $request->per_page ?: 20, 50));
    }

    public function customer(int $id): JsonResponse
    {
        $customer = Customer::with('facility', 'meters')->findOrFail($id);

        return response()->json($customer);
    }

    public function vendingHistory(int $id): JsonResponse
    {
        return $this->proxyHistory($id, 'vending');
    }

    public function fundingHistory(int $id): JsonResponse
    {
        return $this->proxyHistory($id, 'funding');
    }

    public function meters(Request $request)
    {
        return Meter::query()
            ->with('facility', 'customer')
            ->search($request->q)
            ->when($request->status, fn ($q, $s) => $q->where('status', $s))
            ->orderBy('meter_number')
            ->paginate(min((int) $request->per_page ?: 20, 50));
    }

    private function proxyHistory(int $customerId, string $kind): JsonResponse
    {
        $customer = Customer::findOrFail($customerId);

        if (! $customer->zvend_customer_id) {
            throw new WorkflowException('This customer has no ZVend reference — run a catalog refresh first.', 'ZVEND_ID_MISSING');
        }

        $result = $kind === 'vending'
            ? $this->zvend->getVendingHistory($customer->zvend_customer_id)
            : $this->zvend->getFundingHistory($customer->zvend_customer_id);

        return response()->json($result['body']);
    }
}
