<?php

use App\Exceptions\IdempotencyReplayException;
use App\Exceptions\WorkflowException;
use App\Exceptions\ZVendException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        health: '/up',
        apiPrefix: 'api',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->statefulApi();

        $middleware->throttleApi();

        $middleware->alias([
            'role' => \App\Http\Middleware\EnsureRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Workflow rule violations are deterministic client errors (422),
        // never 500s — the state machine rejected the transition.
        $exceptions->render(function (WorkflowException $e, Request $request) {
            return response()->json([
                'message' => $e->getMessage(),
                'code'    => $e->errorCode(),
            ], 422);
        });

        // ZVend is unreachable / refused: report as bad gateway with a safe body.
        $exceptions->render(function (ZVendException $e, Request $request) {
            return response()->json([
                'message'  => 'ZVend request failed.',
                'endpoint' => $e->endpoint,
                'reason'   => $e->getMessage(),
            ], 502);
        });

        // Idempotent replay: surface the original outcome, never a duplicate effect.
        $exceptions->render(function (IdempotencyReplayException $e, Request $request) {
            return response()->json([
                'message' => 'Idempotent request replayed — original outcome returned.',
                'replay'  => true,
                'result'  => $e->snapshot,
            ], 200);
        });
    })
    ->create();
