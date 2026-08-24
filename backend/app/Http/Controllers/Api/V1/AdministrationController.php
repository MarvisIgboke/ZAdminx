<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateApiSettingRequest;
use App\Http\Requests\UpdateSettingRequest;
use App\Http\Requests\SyncRolePermissionsRequest;
use App\Models\ApiSetting;
use App\Models\Role;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\AuditService;
use App\Services\ZVendApiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;

/**
 * Platform administration (IT Manager + Super Admin). Note: administering
 * the platform never bypasses operational approval workflows — the IT
 * Manager holds no approve_* permissions.
 */
class AdministrationController extends Controller
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly ZVendApiService $zvend,
    ) {}

    // ------------------------------------------------------------ Users
    public function index(Request $request)
    {
        return User::with('roles')->orderBy('name')->paginate(25);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = User::create([
            'name'          => $data['name'],
            'email'         => $data['email'],
            'password'      => Hash::make($data['password']),
            'employee_code' => $data['employee_code'] ?? null,
            'phone'         => $data['phone'] ?? null,
            'is_active'     => true,
        ]);
        $user->roles()->attach($data['role_id']);

        $this->audit->log('user_created', "User {$user->email} created with role #{$data['role_id']}.");

        return response()->json($user->load('roles'), 201);
    }

    public function update(Request $request, int $user): JsonResponse
    {
        $model = User::findOrFail($user);
        $data = $request->validate(['name' => ['sometimes', 'string', 'max:120'], 'email' => ['sometimes', 'email', 'unique:users,email,'.$model->id], 'role_id' => ['sometimes', 'exists:roles,id']]);

        $model->fill(array_intersect_key($data, ['name' => 1, 'email' => 1]))->save();
        if (! empty($data['role_id'])) {
            $model->roles()->sync([$data['role_id']]);
        }

        $this->audit->log('user_updated', "User {$model->email} updated.");

        return response()->json($model->load('roles'));
    }

    public function toggleActive(int $user): JsonResponse
    {
        $model = User::findOrFail($user);
        $model->forceFill(['is_active' => ! $model->is_active])->save();

        $this->audit->log('user_status_change', "User {$model->email} ".($model->is_active ? 'activated' : 'deactivated').'.');

        return response()->json(['is_active' => $model->is_active]);
    }

    // ------------------------------------------------------------ Roles
    public function roles(): JsonResponse
    {
        return response()->json(Role::with('permissions')->orderBy('id')->get());
    }

    public function syncRolePermissions(SyncRolePermissionsRequest $request, int $role): JsonResponse
    {
        $model = Role::findOrFail($role);
        $model->permissions()->sync($request->validated()['permission_ids']);

        $this->audit->log('roles_permissions_change', "Role {$model->name} permission matrix updated (".count($request->validated()['permission_ids']).' permissions).');

        return response()->json($model->load('permissions'));
    }

    // ------------------------------------------------------------ System settings
    public function settings(): JsonResponse
    {
        return response()->json(SystemSetting::orderBy('group')->get());
    }

    public function updateSetting(UpdateSettingRequest $request, string $key): JsonResponse
    {
        $setting = SystemSetting::where('key', $key)->firstOrFail();
        $setting->forceFill(['value' => $request->validated()['value'], 'updated_by' => $request->user()->id])->save();

        $this->audit->log('settings_change', "Setting '{$key}' updated to ".json_encode($request->validated()['value']).'.');

        return response()->json($setting);
    }

    // ------------------------------------------------------------ API configuration
    public function apiSettings(): JsonResponse
    {
        // Secret values are masked on read — the plaintext never leaves storage.
        return response()->json(ApiSetting::orderBy('key')->get()->map(fn (ApiSetting $s) => [
            'key'        => $s->key,
            'value'      => $s->is_secret ? ($s->value ? '••••••••••••' : null) : $s->value,
            'is_secret'  => $s->is_secret,
            'updated_at' => $s->updated_at,
        ]));
    }

    public function updateApiSetting(UpdateApiSettingRequest $request, string $key): JsonResponse
    {
        $setting = ApiSetting::firstOrCreate(
            ['key' => $key],
            ['is_secret' => in_array($key, ['zvend_api_token'], true)]
        );
        $setting->is_secret = in_array($key, ['zvend_api_token'], true);
        $setting->value = $request->validated()['value'];
        $setting->updated_by = $request->user()->id;
        $setting->save();

        $this->zvend->flushSettingsCache();
        $this->audit->log('api_settings_change', "API setting '{$key}' updated.");

        return response()->json(['key' => $key, 'updated' => true]);
    }
}
