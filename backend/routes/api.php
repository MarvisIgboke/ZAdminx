<?php

use App\Http\Controllers\Api\V1 as Api;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Z Admin API — /api/v1
|--------------------------------------------------------------------------
| Authorization is declarative: `can:` middleware resolves the permission
| matrix (roles → permissions) seeded in RolePermissionSeeder. Controllers
| contain NO hard-coded role checks; the workflow engine re-validates the
| actor against the current workflow stage server-side on every transition.
*/

Route::prefix('v1')->group(function () {

    Route::post('login', [Api\AuthController::class, 'login'])
        ->middleware('throttle:10,1');

    Route::middleware('auth:sanctum')->group(function () {

        Route::get('me', [Api\AuthController::class, 'me']);
        Route::post('logout', [Api\AuthController::class, 'logout']);

        // ------------------------------------------------ Core operations
        // Each of the five operations exposes: list, create, detail,
        // approve / reject / return, plus operation-specific execution.
        Route::middleware('can:view_meter_installation')->prefix('meter-installations')->group(function () {
            Route::get('/', [Api\MeterInstallationController::class, 'index']);
            Route::post('/', [Api\MeterInstallationController::class, 'store'])->middleware('can:create_meter_installation');
            Route::get('{installation}', [Api\MeterInstallationController::class, 'show']);
            Route::get('{installation}/history', [Api\MeterInstallationController::class, 'history'])->middleware('can:view_history_meter_installation');
            Route::post('{installation}/approve', [Api\MeterInstallationController::class, 'approve'])->middleware('can:approve_meter_installation');
            Route::post('{installation}/reject', [Api\MeterInstallationController::class, 'reject'])->middleware('can:reject_meter_installation');
            Route::post('{installation}/return', [Api\MeterInstallationController::class, 'return'])->middleware('can:return_meter_installation');
            Route::post('{installation}/release', [Api\MeterInstallationController::class, 'release'])->middleware('can:release_meter_installation');
            Route::post('{installation}/execute', [Api\MeterInstallationController::class, 'execute'])->middleware('can:execute_meter_installation');
        });

        Route::middleware('can:view_meter_activation')->prefix('meter-activations')->group(function () {
            Route::get('/', [Api\MeterActivationController::class, 'index']);
            Route::post('/', [Api\MeterActivationController::class, 'store'])->middleware('can:create_meter_activation');
            Route::get('{activation}', [Api\MeterActivationController::class, 'show']);
            Route::get('{activation}/history', [Api\MeterActivationController::class, 'history'])->middleware('can:view_history_meter_activation');
            Route::post('{activation}/approve', [Api\MeterActivationController::class, 'approve'])->middleware('can:approve_meter_activation');
            Route::post('{activation}/reject', [Api\MeterActivationController::class, 'reject'])->middleware('can:reject_meter_activation');
            Route::post('{activation}/return', [Api\MeterActivationController::class, 'return'])->middleware('can:return_meter_activation');
            Route::post('{activation}/capture', [Api\MeterActivationController::class, 'capture'])->middleware('can:execute_meter_activation');
            Route::post('{activation}/complete', [Api\MeterActivationController::class, 'complete'])->middleware('can:approve_meter_activation');
        });

        Route::middleware('can:view_meter_inspection')->prefix('meter-inspections')->group(function () {
            Route::get('/', [Api\MeterInspectionController::class, 'index']);
            Route::post('schedule', [Api\MeterInspectionController::class, 'schedule'])->middleware('can:create_meter_inspection');
            Route::get('{inspection}', [Api\MeterInspectionController::class, 'show']);
            Route::get('{inspection}/history', [Api\MeterInspectionController::class, 'history'])->middleware('can:view_history_meter_inspection');
            Route::post('{inspection}/start', [Api\MeterInspectionController::class, 'start'])->middleware('can:execute_meter_inspection');
            Route::post('{inspection}/submit', [Api\MeterInspectionController::class, 'submit'])->middleware('can:execute_meter_inspection');
            Route::post('{inspection}/approve', [Api\MeterInspectionController::class, 'approve'])->middleware('can:approve_meter_inspection');
            Route::post('{inspection}/reject', [Api\MeterInspectionController::class, 'reject'])->middleware('can:reject_meter_inspection');
            Route::post('{inspection}/return', [Api\MeterInspectionController::class, 'return'])->middleware('can:return_meter_inspection');
        });

        Route::middleware('can:view_tamper_code')->prefix('tamper-code-requests')->group(function () {
            Route::get('/', [Api\CodeRequestController::class, 'indexTamper']);
            Route::post('/', [Api\CodeRequestController::class, 'storeTamper'])->middleware('can:create_tamper_code');
            Route::get('{request}', [Api\CodeRequestController::class, 'showTamper']);
            Route::get('{request}/code', [Api\CodeRequestController::class, 'revealTamper'])->middleware('can:view_tamper_code');
            Route::post('{request}/approve', [Api\CodeRequestController::class, 'approveTamper'])->middleware('can:approve_tamper_code');
            Route::post('{request}/reject', [Api\CodeRequestController::class, 'rejectTamper'])->middleware('can:reject_tamper_code');
            Route::post('{request}/return', [Api\CodeRequestController::class, 'returnTamper'])->middleware('can:return_tamper_code');
        });

        Route::middleware('can:view_clear_code')->prefix('clear-code-requests')->group(function () {
            Route::get('/', [Api\CodeRequestController::class, 'indexClear']);
            Route::post('/', [Api\CodeRequestController::class, 'storeClear'])->middleware('can:create_clear_code');
            Route::get('{request}', [Api\CodeRequestController::class, 'showClear']);
            Route::get('{request}/code', [Api\CodeRequestController::class, 'revealClear'])->middleware('can:view_clear_code');
            Route::post('{request}/approve', [Api\CodeRequestController::class, 'approveClear'])->middleware('can:approve_clear_code');
            Route::post('{request}/reject', [Api\CodeRequestController::class, 'rejectClear'])->middleware('can:reject_clear_code');
            Route::post('{request}/return', [Api\CodeRequestController::class, 'returnClear'])->middleware('can:return_clear_code');
        });

        // ------------------------------------------------ Approvals & workflow
        Route::get('approvals', [Api\ApprovalsController::class, 'index'])->middleware('can:approvals.view');
        Route::get('attachments/{attachment}/download', [Api\OperationAttachmentController::class, 'download'])->middleware('can:attachments.download');

        // ------------------------------------------------ ZVend-sourced data
        Route::middleware('can:facilities.view')->prefix('facilities')->group(function () {
            Route::get('/', [Api\ZVendDataController::class, 'facilities']);
            Route::post('refresh', [Api\ZVendDataController::class, 'refresh'])->middleware('can:facilities.sync');
            Route::get('{facility}', [Api\ZVendDataController::class, 'facility']);
            Route::get('{facility}/customers', [Api\ZVendDataController::class, 'facilityCustomers']);
            Route::get('{facility}/meters', [Api\ZVendDataController::class, 'facilityMeters']);
            Route::get('{facility}/operations', [Api\ZVendDataController::class, 'facilityOperations']);
        });

        Route::middleware('can:customers.view')->prefix('customers')->group(function () {
            Route::get('/', [Api\ZVendDataController::class, 'customers']);
            Route::get('{customer}', [Api\ZVendDataController::class, 'customer']);
            Route::get('{customer}/vending-history', [Api\ZVendDataController::class, 'vendingHistory']);
            Route::get('{customer}/funding-history', [Api\ZVendDataController::class, 'fundingHistory']);
        });

        Route::get('meters', [Api\ZVendDataController::class, 'meters'])->middleware('can:meters.view');

        Route::post('sync/zvend', [Api\SyncController::class, 'zvend'])->middleware('can:facilities.sync');

        // ------------------------------------------------ Notifications
        Route::prefix('notifications')->group(function () {
            Route::get('/', [Api\NotificationController::class, 'index']);
            Route::post('{notification}/read', [Api\NotificationController::class, 'markRead']);
            Route::post('read-all', [Api\NotificationController::class, 'markAllRead']);
        });

        // ------------------------------------------------ Reports
        Route::get('reports/operations', [Api\ReportController::class, 'operations'])->middleware('can:reports.view');

        // ------------------------------------------------ Administration
        Route::prefix('administration')->group(function () {
            Route::apiResource('users', Api\AdministrationController::class)->only(['index', 'store', 'update'])->middleware('can:users.manage');
            Route::patch('users/{user}/toggle-active', [Api\AdministrationController::class, 'toggleActive'])->middleware('can:users.manage');

            Route::get('roles', [Api\AdministrationController::class, 'roles'])->middleware('can:roles.manage');
            Route::put('roles/{role}/permissions', [Api\AdministrationController::class, 'syncRolePermissions'])->middleware('can:roles.manage');

            Route::get('settings', [Api\AdministrationController::class, 'settings'])->middleware('can:settings.manage');
            Route::put('settings/{key}', [Api\AdministrationController::class, 'updateSetting'])->middleware('can:settings.manage');

            Route::get('api-settings', [Api\AdministrationController::class, 'apiSettings'])->middleware('can:api_settings.manage');
            Route::put('api-settings/{key}', [Api\AdministrationController::class, 'updateApiSetting'])->middleware('can:api_settings.manage');

            Route::get('delegations', [Api\DelegationController::class, 'index'])->middleware('can:delegations.manage');
            Route::post('delegations', [Api\DelegationController::class, 'store'])->middleware('can:delegations.manage');
            Route::post('delegations/{delegation}/revoke', [Api\DelegationController::class, 'revoke'])->middleware('can:delegations.manage');

            Route::get('api-logs', [Api\LogController::class, 'apiLogs'])->middleware('can:api_logs.view');
            Route::get('audit-logs', [Api\LogController::class, 'auditLogs'])->middleware('can:audit_logs.view');
        });
    });
});
