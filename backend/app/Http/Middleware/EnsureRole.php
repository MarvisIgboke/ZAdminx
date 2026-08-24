<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Optional coarse role gate for the rare route that is role-scoped rather
 * than permission-scoped. Operational routes use `can:` permissions instead.
 */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (! $user || ! $user->roles()->whereIn('name', $roles)->exists()) {
            abort(403, 'Your role is not permitted to access this endpoint.');
        }

        return $next($request);
    }
}
