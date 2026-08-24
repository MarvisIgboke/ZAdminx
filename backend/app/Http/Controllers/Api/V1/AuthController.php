<?php

namespace App\Http\Controllers\Api\V1;

use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = \App\Models\User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'Invalid credentials.']);
        }

        if (! $user->is_active) {
            $this->audit->log('login_denied', "Inactive account attempt: {$user->email}");
            throw ValidationException::withMessages(['email' => 'This account has been deactivated.']);
        }

        // Token abilities mirror the permission matrix.
        $token = $user->createToken('zadmin', $user->permissionNames());

        $this->audit->log('login', "Signed in ({$user->primaryRoleName()}).");

        return response()->json([
            'token' => $token->plainTextToken,
            'user'  => [
                'id'          => $user->id,
                'name'        => $user->name,
                'email'       => $user->email,
                'role'        => $user->primaryRoleName(),
                'permissions' => $user->permissionNames(),
            ],
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('roles');

        return response()->json([
            'id'          => $user->id,
            'name'        => $user->name,
            'email'       => $user->email,
            'role'        => $user->primaryRoleName(),
            'roles'       => $user->roles->pluck('name'),
            'permissions' => $user->permissionNames(),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $this->audit->log('logout', 'Signed out.');
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Signed out.']);
    }
}
