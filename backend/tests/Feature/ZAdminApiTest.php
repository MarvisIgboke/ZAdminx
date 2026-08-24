<?php

/*
 * Z Admin API test suite.
 *
 *  - ZAdminTestCase      — boots the app, seeds RBAC + demo users, helpers.
 *  - AuthorizationTest   — a user cannot perform an operation merely by
 *                          calling its endpoint (the critical §64 test).
 *  - InstallationWorkflowTest — full chain incl. ZVend fake, barcode
 *                          mismatch, GPS ceiling, duplicate meter numbers.
 *  - IdempotencyTest     — duplicate approvals and ZVend calls collapse.
 *
 * Run: php artisan test   (sqlite :memory:, ZVend faked over HTTP)
 */

namespace Tests\Feature;

use App\Enums\OperationStatus;
use App\Jobs\CallZVendOperationJob;
use App\Models\Facility;
use App\Models\Meter;
use App\Models\MeterInstallation;
use App\Models\SystemSetting;
use App\Models\User;
use App\Models\WorkflowComment;
use Database\Seeders\DemoUserSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

abstract class ZAdminTestCase extends BaseTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolePermissionSeeder::class);
        $this->seed(DemoUserSeeder::class);

        SystemSetting::updateOrCreate(['key' => 'max_gps_accuracy_m'], ['value' => 50, 'group' => 'gps', 'label' => 'Max GPS accuracy']);
        SystemSetting::updateOrCreate(['key' => 'inspection_durations'], ['value' => [60, 120], 'group' => 'inspection', 'label' => 'Durations']);
    }

    protected function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }

    protected function facility(): Facility
    {
        return Facility::create(['code' => 'FAC-TST', 'name' => 'Test Facility', 'status' => 'ACTIVE']);
    }
}

// =====================================================================
class AuthorizationTest extends ZAdminTestCase
{
    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/v1/meter-installations')->assertStatus(401);
        $this->postJson('/api/v1/meter-installations')->assertStatus(401);
    }

    public function test_technical_man_cannot_initiate_installation(): void
    {
        $this->actingAs($this->user('tech@zarox.com'), 'sanctum')
            ->postJson('/api/v1/meter-installations', [
                'meter_number' => '999000111', 'facility_id' => $this->facility()->id,
            ])
            ->assertStatus(403);
    }

    public function test_secretary_cannot_initiate_activation(): void
    {
        $this->actingAs($this->user('secretary@zarox.com'), 'sanctum')
            ->postJson('/api/v1/meter-activations', [])
            ->assertStatus(403);
    }

    public function test_technical_man_cannot_approve(): void
    {
        $facility = $this->facility();
        $installation = $this->actingAs($this->user('secretary@zarox.com'), 'sanctum')
            ->postJson('/api/v1/meter-installations', ['meter_number' => '999000222', 'facility_id' => $facility->id, 'comment' => 'x'])
            ->assertStatus(201)->json();

        $this->actingAs($this->user('tech@zarox.com'), 'sanctum')
            ->postJson("/api/v1/meter-installations/{$installation['data']['id']}/approve", ['comment' => 'bypass attempt'])
            ->assertStatus(403);
    }

    public function test_energy_manager_cannot_schedule_inspection(): void
    {
        $this->actingAs($this->user('energy@zarox.com'), 'sanctum')
            ->postJson('/api/v1/meter-inspections/schedule', [
                'facility_id' => $this->facility()->id,
                'meter_number' => '1', 'scheduled_for' => now()->addDay()->toDateString(),
                'instruction' => 'check seals', 'duration_seconds' => 60,
            ])
            ->assertStatus(403);
    }

    public function test_it_manager_cannot_access_approvals(): void
    {
        $this->actingAs($this->user('it@zarox.com'), 'sanctum')
            ->getJson('/api/v1/approvals')
            ->assertStatus(403);
    }
}

// =====================================================================
class InstallationWorkflowTest extends ZAdminTestCase
{
    private function initiate(string $meterNumber = '45099900001'): array
    {
        return $this->actingAs($this->user('secretary@zarox.com'), 'sanctum')
            ->postJson('/api/v1/meter-installations', [
                'meter_number' => $meterNumber,
                'facility_id'  => $this->facility()->id,
                'comment'      => 'New build request.',
            ])
            ->assertStatus(201)
            ->json()['data'];
    }

    private function decideAs(string $email, int $id, string $verb): array
    {
        return $this->actingAs($this->user($email), 'sanctum')
            ->postJson("/api/v1/meter-installations/{$id}/{$verb}", ['comment' => "{$verb} by test"])
            ->assertStatus(200)
            ->json()['data'];
    }

    public function test_duplicate_meter_number_is_rejected_immediately(): void
    {
        $this->initiate('45099900077');

        $this->actingAs($this->user('secretary@zarox.com'), 'sanctum')
            ->postJson('/api/v1/meter-installations', [
                'meter_number' => '45099900077', 'facility_id' => $this->facility()->id,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('meter_number');
    }

    public function test_non_numeric_meter_number_is_rejected(): void
    {
        $this->actingAs($this->user('secretary@zarox.com'), 'sanctum')
            ->postJson('/api/v1/meter-installations', ['meter_number' => 'ABC-12', 'facility_id' => $this->facility()->id])
            ->assertStatus(422);
    }

    public function test_full_happy_path_through_zvend_to_field_completion(): void
    {
        Queue::fake([CallZVendOperationJob::class]);

        $installation = $this->initiate();
        $id = $installation['id'];

        $this->assertSame('PENDING', $installation['status']);
        $this->assertSame('ENERGY_MANAGER', $installation['current_stage']);

        $this->decideAs('energy@zarox.com', $id, 'approve');
        $this->decideAs('gm@zarox.com', $id, 'approve');
        $afterMd = $this->decideAs('md@zarox.com', $id, 'approve');

        $this->assertSame(OperationStatus::WAITING_ZVEND->value, $afterMd['status']);
        Queue::assertPushed(CallZVendOperationJob::class);

        // Run the ZVend job against a fake endpoint.
        Http::fake(['*' => Http::response([
            'response_code' => '00', 'reference' => 'ZV-REF-TEST',
            'tamper_code' => '11112222333344445555', 'clear_code' => '55554444333322221111',
        ], 200)]);

        Queue::pushed(CallZVendOperationJob::class)->each(fn ($job) => app()->call([$job[0], 'handle']));

        $record = MeterInstallation::find($id);
        $this->assertSame(OperationStatus::ZVEND_SUCCESS->value, $record->status);
        $this->assertSame('11112222333344445555', $record->tamper_code);  // decrypted via cast
        $this->assertSame('•••• •••• •••• •••• ••••',
            $this->actingAs($this->user('secretary@zarox.com'), 'sanctum')
                ->getJson("/api/v1/meter-installations/{$id}")
                ->json('data.tamper_code_masked'));

        // Secretary release → Technical Man executes.
        $this->actingAs($this->user('secretary@zarox.com'), 'sanctum')
            ->postJson("/api/v1/meter-installations/{$id}/release", ['comment' => 'Make available'])
            ->assertStatus(200);
        $this->assertSame(OperationStatus::ASSIGNED->value, MeterInstallation::find($id)->status);

        $this->actingAs($this->user('tech@zarox.com'), 'sanctum')
            ->postJson("/api/v1/meter-installations/{$id}/execute", [
                'scan_value' => '45099900001',
                'gps' => ['latitude' => 6.45, 'longitude' => 3.55, 'accuracy' => 12],
                'photos' => [
                    UploadedFile::fake()->image('front.jpg'),
                    UploadedFile::fake()->image('install.jpg'),
                    UploadedFile::fake()->image('barcode.jpg'),
                    UploadedFile::fake()->image('env.jpg'),
                ],
                'comment' => 'Installed and sealed.',
            ])
            ->assertStatus(200);

        $completed = MeterInstallation::find($id);
        $this->assertSame(OperationStatus::COMPLETED->value, $completed->status);
        $this->assertSame('INSTALLED', Meter::where('meter_number', '45099900001')->value('status'));

        // Every stage left an immutable comment.
        $this->assertGreaterThanOrEqual(6, WorkflowComment::where('transaction_id', $completed->txn)->count());
    }

    public function test_barcode_mismatch_halts_execution(): void
    {
        Queue::fake();
        $installation = $this->initiate('45099900002');
        $id = $installation['id'];
        $this->decideAs('energy@zarox.com', $id, 'approve');
        $this->decideAs('gm@zarox.com', $id, 'approve');
        $this->decideAs('md@zarox.com', $id, 'approve');
        $this->actingAs($this->user('secretary@zarox.com'), 'sanctum')
            ->postJson("/api/v1/meter-installations/{$id}/release", ['comment' => 'go'])
            ->assertStatus(200);

        $this->actingAs($this->user('tech@zarox.com'), 'sanctum')
            ->postJson("/api/v1/meter-installations/{$id}/execute", [
                'scan_value' => '999888777',
                'gps' => ['latitude' => 6.45, 'longitude' => 3.55, 'accuracy' => 10],
                'comment' => 'attempt',
            ])
            ->assertStatus(422)
            ->assertJson(['code' => 'METER_NUMBER_MISMATCH']);

        $this->assertNotSame(OperationStatus::COMPLETED->value, MeterInstallation::find($id)->status);
    }

    public function test_gps_beyond_configured_accuracy_rejects_operation(): void
    {
        Queue::fake();
        SystemSetting::where('key', 'max_gps_accuracy_m')->update(['value' => 15]);

        $installation = $this->initiate('45099900003');
        $id = $installation['id'];
        $this->decideAs('energy@zarox.com', $id, 'approve');
        $this->decideAs('gm@zarox.com', $id, 'approve');
        $this->decideAs('md@zarox.com', $id, 'approve');
        $this->actingAs($this->user('secretary@zarox.com'), 'sanctum')
            ->postJson("/api/v1/meter-installations/{$id}/release", ['comment' => 'go'])
            ->assertStatus(200);

        $this->actingAs($this->user('tech@zarox.com'), 'sanctum')
            ->postJson("/api/v1/meter-installations/{$id}/execute", [
                'scan_value' => '45099900003',
                'gps' => ['latitude' => 6.45, 'longitude' => 3.55, 'accuracy' => 90],
                'comment' => 'attempt',
            ])
            ->assertStatus(422)
            ->assertJson(['code' => 'GPS_ACCURACY_EXCEEDED']);

        $this->assertDatabaseHas('gps_records', ['accepted' => false]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'suspicious_gps']);
    }

    public function test_zvend_is_never_called_before_md_approval(): void
    {
        Queue::fake([CallZVendOperationJob::class]);
        Http::fake();

        $installation = $this->initiate('45099900004');
        $this->decideAs('energy@zarox.com', $installation['id'], 'approve');

        Queue::assertNotPushed(CallZVendOperationJob::class);
        Http::assertNothingSent();
    }
}

// =====================================================================
class IdempotencyTest extends ZAdminTestCase
{
    public function test_duplicate_approval_with_same_key_is_a_no_op_replay(): void
    {
        $facility = $this->facility();
        $installation = $this->actingAs($this->user('secretary@zarox.com'), 'sanctum')
            ->postJson('/api/v1/meter-installations', ['meter_number' => '45099900005', 'facility_id' => $facility->id, 'comment' => 'c'])
            ->json()['data'];

        $key = 'approval-unique-key-1';

        $this->actingAs($this->user('energy@zarox.com'), 'sanctum')
            ->postJson("/api/v1/meter-installations/{$installation['id']}/approve", ['comment' => 'ok', 'idempotency_key' => $key])
            ->assertStatus(200);

        $commentsBefore = WorkflowComment::count();

        $response = $this->actingAs($this->user('energy@zarox.com'), 'sanctum')
            ->postJson("/api/v1/meter-installations/{$installation['id']}/approve", ['comment' => 'ok again', 'idempotency_key' => $key])
            ->assertStatus(200)
            ->json();

        $this->assertTrue($response['replay']);
        $this->assertSame($commentsBefore, WorkflowComment::count());  // no duplicate comment
        $this->assertSame('GENERAL_MANAGER', MeterInstallation::find($installation['id'])->current_stage);
    }

    public function test_duplicate_zvend_dispatch_is_blocked(): void
    {
        Http::fake(['*' => Http::response(['response_code' => '00', 'reference' => 'ZV-1', 'tamper_code' => '1', 'clear_code' => '2'], 200)]);

        $facility = $this->facility();
        $installation = $this->actingAs($this->user('secretary@zarox.com'), 'sanctum')
            ->postJson('/api/v1/meter-installations', ['meter_number' => '45099900006', 'facility_id' => $facility->id, 'comment' => 'c'])
            ->json()['data'];
        $id = $installation['id'];

        foreach (['energy@zarox.com', 'gm@zarox.com', 'md@zarox.com'] as $email) {
            $this->actingAs($this->user($email), 'sanctum')
                ->postJson("/api/v1/meter-installations/{$id}/approve", ['comment' => 'ok'])
                ->assertStatus(200);
        }

        // QUEUE_CONNECTION=sync already ran the job once during MD approval.
        $this->assertSame(1, Http::recorded()->count());

        // A duplicate dispatch with the same armed key must not re-send.
        $job = new CallZVendOperationJob('meter_installation', $id);
        app()->call([$job, 'handle']);

        $this->assertSame(1, Http::recorded()->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'zvend_duplicate_blocked']);
    }
}
