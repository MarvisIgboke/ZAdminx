<?php

namespace App\Providers;

use App\Models\ClearCodeRequest;
use App\Models\MeterActivation;
use App\Models\MeterInspection;
use App\Models\MeterInstallation;
use App\Models\TamperCodeRequest;
use App\Models\User;
use App\Policies\OperationPolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Relation;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Morph aliases shared by workflow_steps / comments / attachments /
        // gps_records / idempotency / notifications.
        Relation::enforceMorphMap([
            'meter_installation' => MeterInstallation::class,
            'meter_activation'   => MeterActivation::class,
            'meter_inspection'   => MeterInspection::class,
            'tamper_code'        => TamperCodeRequest::class,
            'clear_code'         => ClearCodeRequest::class,
        ]);

        // Single, central permission resolution. Controllers and middleware
        // ask for capabilities ("can:approve_meter_installation") — role
        // names never appear in controller logic.
        Gate::before(function ($user, string $ability) {
            return $user instanceof User && $user->hasPermission($ability) ? true : null;
        });

        foreach ([
            MeterInstallation::class,
            MeterActivation::class,
            MeterInspection::class,
            TamperCodeRequest::class,
            ClearCodeRequest::class,
        ] as $model) {
            Gate::policy($model, OperationPolicy::class);
        }
    }
}
