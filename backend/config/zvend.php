<?php

/*
|--------------------------------------------------------------------------
| ZVend Integration
|--------------------------------------------------------------------------
| Default connection settings for the external ZVend vending platform.
| Every value here can be overridden at runtime through the encrypted
| `api_settings` table (Administration → API Configuration). The client
| (App\Services\ZVendApiService) resolves runtime overrides first and
| falls back to this file.
|
| Secrets must come from the environment — never from source control.
*/

return [

    'base_url' => env('ZVEND_BASE_URL', 'https://api.zvend.example.com'),

    'token' => env('ZVEND_API_TOKEN'),

    'timeout' => (int) env('ZVEND_TIMEOUT', 20),

    'retry_count' => (int) env('ZVEND_RETRY_COUNT', 3),

    'retry_delay_ms' => 250,

    'endpoints' => [
        'facilities'        => '/v1/facilities',
        'facility_customers' => '/v1/facilities/{facility}/customers',
        'facility_meters'   => '/v1/facilities/{facility}/meters',
        'customer_vending'  => '/v1/customers/{customer}/vending-history',
        'customer_funding'  => '/v1/customers/{customer}/funding-history',
        'install_meter'     => '/v1/meters/install',
        'activate_meter'    => '/v1/meters/activate',
        'tamper_code'       => '/v1/meters/tamper-code',
        'clear_code'        => '/v1/meters/clear-code',
        'vend_token'        => '/v1/tokens/vend',
    ],

    // Payload keys that must never be persisted to api_requests/api_responses.
    'sanitize_keys' => ['token', 'api_token', 'secret', 'password', 'api_key', 'authorization'],

];
