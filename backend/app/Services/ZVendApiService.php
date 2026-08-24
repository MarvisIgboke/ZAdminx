<?php

namespace App\Services;

use App\Exceptions\ZVendException;
use App\Models\ApiRequest;
use App\Models\ApiResponse;
use App\Models\ApiSetting;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * The ONLY HTTP client allowed to talk to ZVend. Controllers never issue
 * HTTP requests themselves.
 *
 *  - Base URL / token / timeout / retries resolve from encrypted api_settings
 *    first, then config('zvend') / env.
 *  - Every call is journaled to api_requests + api_responses with sanitized
 *    payloads (secrets and issued codes never reach the logs).
 *  - Idempotency keys travel on the wire so ZVend can dedupe on its side too.
 */
class ZVendApiService
{
    public function __construct(private readonly AuditService $audit) {}

    // ------------------------------------------------------------------
    // Read-side (catalog + history)
    // ------------------------------------------------------------------

    public function getFacilities(): array
    {
        return $this->call('GET', $this->endpoint('facilities'));
    }

    public function getCustomersByFacility(string $zvendFacilityId): array
    {
        return $this->call('GET', $this->endpoint('facility_customers', ['facility' => $zvendFacilityId]));
    }

    public function getMetersByFacility(string $zvendFacilityId): array
    {
        return $this->call('GET', $this->endpoint('facility_meters', ['facility' => $zvendFacilityId]));
    }

    public function getVendingHistory(string $zvendCustomerId): array
    {
        return $this->call('GET', $this->endpoint('customer_vending', ['customer' => $zvendCustomerId]));
    }

    public function getFundingHistory(string $zvendCustomerId): array
    {
        return $this->call('GET', $this->endpoint('customer_funding', ['customer' => $zvendCustomerId]));
    }

    public function vendToken(array $payload): array
    {
        return $this->call('POST', $this->endpoint('vend_token'), $payload);
    }

    // ------------------------------------------------------------------
    // Write-side (operations) — always after MD approval, always idempotent
    // ------------------------------------------------------------------

    public function installMeter(string $meterNumber, string $facilityCode, string $idempotencyKey): array
    {
        return $this->call('POST', $this->endpoint('install_meter'), [
            'meter_number' => $meterNumber,
            'facility'     => $facilityCode,
        ], $idempotencyKey);
    }

    public function activateMeter(array $payload, string $idempotencyKey): array
    {
        // facility, meter_number, customer_name, customer_phone,
        // customer_email, customer_address, latitude, longitude (+ extras)
        return $this->call('POST', $this->endpoint('activate_meter'), $payload, $idempotencyKey);
    }

    public function generateTamperCode(string $meterNumber, string $idempotencyKey): array
    {
        return $this->call('POST', $this->endpoint('tamper_code'), ['meter_number' => $meterNumber], $idempotencyKey);
    }

    public function generateClearCode(string $meterNumber, string $idempotencyKey): array
    {
        return $this->call('POST', $this->endpoint('clear_code'), ['meter_number' => $meterNumber], $idempotencyKey);
    }

    // ------------------------------------------------------------------
    // Transport
    // ------------------------------------------------------------------

    /**
     * @return array{status: string, response_code: string, body: array, latency_ms: int}
     *
     * @throws ZVendException
     */
    public function call(string $method, string $endpoint, array $payload = [], ?string $idempotencyKey = null, ?Model $operation = null): array
    {
        $settings = $this->settings();

        $log = ApiRequest::create([
            'user_id'         => auth()->id(),
            'operation_type'  => $operation?->getMorphClass(),
            'operation_id'    => $operation?->getKey(),
            'transaction_id'  => $operation->txn ?? null,
            'method'          => $method,
            'endpoint'        => $endpoint,
            'idempotency_key' => $idempotencyKey,
            'request_payload' => $this->sanitize($payload),
            'status'          => 'pending',
            'started_at'      => now(),
        ]);

        $started = microtime(true);

        try {
            $response = $this->client($settings, $idempotencyKey)->send($method, $settings['base_url'].$endpoint, [
                $method === 'GET' ? 'query' : 'json' => $payload,
            ]);
        } catch (ConnectionException $e) {
            $this->settle($log, 'timeout', null, null, (int) ((microtime(true) - $started) * 1000));
            $this->audit->log('api_timeout', "ZVend {$method} {$endpoint} timed out.", $operation, $operation?->txn);

            throw new ZVendException('ZVend unreachable (timeout).', $endpoint);
        }

        $latency = (int) ((microtime(true) - $started) * 1000);
        $body = $response->json() ?? [];

        if ($response->failed()) {
            $this->settle($log, 'failed', (string) $response->status(), $this->sanitize($body), $latency);
            $this->audit->log('api_response', "ZVend {$method} {$endpoint} → HTTP {$response->status()}.", $operation, $operation?->txn);

            throw new ZVendException("ZVend returned HTTP {$response->status()}.", $endpoint, (string) $response->status());
        }

        $this->settle($log, 'success', (string) $response->status(), $this->sanitize($body), $latency);
        $this->audit->log('api_response', "ZVend {$method} {$endpoint} → HTTP {$response->status()} ({$latency} ms).", $operation, $operation?->txn);

        return [
            'status'        => 'success',
            'response_code' => (string) ($body['response_code'] ?? $response->status()),
            'body'          => $body,
            'latency_ms'    => $latency,
        ];
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private function client(array $settings, ?string $idempotencyKey): PendingRequest
    {
        $client = Http::withToken($settings['token'])
            ->timeout($settings['timeout'])
            ->retry($settings['retry_count'], config('zvend.retry_delay_ms', 250), throw: false)
            ->acceptJson();

        if ($idempotencyKey) {
            $client->withHeaders(['Idempotency-Key' => $idempotencyKey]);
        }

        return $client;
    }

    /** Runtime (encrypted, IT-managed) settings override env/config. Cached 60s. */
    public function settings(): array
    {
        return Cache::remember('zvend.settings', 60, function () {
            $runtime = ApiSetting::all()->keyBy('key');

            return [
                'base_url'    => $runtime->get('zvend_base_url')?->value ?: config('zvend.base_url'),
                'token'       => $runtime->get('zvend_api_token')?->value ?: config('zvend.token'),
                'timeout'     => (int) ($runtime->get('zvend_timeout')?->value ?: config('zvend.timeout')),
                'retry_count' => (int) ($runtime->get('zvend_retry_count')?->value ?: config('zvend.retry_count')),
            ];
        });
    }

    public function flushSettingsCache(): void
    {
        Cache::forget('zvend.settings');
    }

    private function endpoint(string $name, array $params = []): string
    {
        $path = config("zvend.endpoints.{$name}", '/v1/'.str_replace('_', '-', $name));

        foreach ($params as $k => $v) {
            $path = str_replace('{'.$k.'}', rawurlencode($v), $path);
        }

        return $path;
    }

    private function settle(ApiRequest $log, string $status, ?string $code, ?array $body, int $latencyMs): void
    {
        $log->forceFill(['status' => $status, 'duration_ms' => $latencyMs])->save();

        ApiResponse::create([
            'api_request_id' => $log->id,
            'response_code'  => $code,
            'response_body'  => $body,
            'received_at'    => now(),
        ]);
    }

    /** Strips secrets and issued codes before anything touches the logs. */
    private function sanitize(array $data): array
    {
        $blocked = array_merge(
            config('zvend.sanitize_keys', []),
            ['tamper_code', 'clear_code', 'issued_code']
        );

        $walk = function (array $items) use (&$walk, $blocked): array {
            foreach ($items as $key => $value) {
                if (is_array($value)) {
                    $items[$key] = $walk($value);
                } elseif (in_array(strtolower((string) $key), $blocked, true) || preg_match('/(token|secret|password|api_key)/i', (string) $key)) {
                    $items[$key] = '••••••••';
                }
            }

            return $items;
        };

        return $walk($data);
    }
}
