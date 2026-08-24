<?php

namespace Database\Seeders;

use App\Enums\RoleName;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

/**
 * Seeds the seven roles, the explicit permission catalogue and the role →
 * permission matrix. Nothing in controllers hard-codes roles: every gate
 * resolves through this matrix (Gate::before → User::hasPermission).
 */
class RolePermissionSeeder extends Seeder
{
    public const OPERATIONS = [
        'meter_installation' => 'Meter Installation',
        'meter_activation'   => 'Meter Activation',
        'meter_inspection'   => 'Meter Inspection',
        'tamper_code'        => 'Tamper Code',
        'clear_code'         => 'Clear Code',
    ];

    public const VERBS = ['view', 'create', 'edit', 'approve', 'reject', 'return', 'execute', 'cancel', 'view_history'];

    public function run(): void
    {
        // ------------------------------------------------ permissions
        $permissions = [];
        foreach (self::OPERATIONS as $op => $label) {
            foreach (self::VERBS as $verb) {
                $name = "{$verb}_{$op}";
                $permissions[$name] = ['name' => $name, 'group' => $op, 'label' => ucfirst(str_replace('_', ' ', $verb))." — {$label}"];
            }
        }
        $permissions['release_meter_installation'] = ['name' => 'release_meter_installation', 'group' => 'meter_installation', 'label' => 'Release installation to Technical Man'];

        foreach ([
            'facilities.view'      => 'View facilities',
            'facilities.sync'      => 'Refresh facilities from ZVend',
            'customers.view'       => 'View customers',
            'meters.view'          => 'View meters',
            'reports.view'         => 'View reports',
            'approvals.view'       => 'View approval center',
            'notifications.view'   => 'View notifications',
            'attachments.download' => 'Download operation attachments',
            'api_logs.view'        => 'View API logs',
            'audit_logs.view'      => 'View audit logs',
            'settings.manage'      => 'Manage system settings',
            'api_settings.manage'  => 'Manage API configuration',
            'users.manage'         => 'Manage users',
            'roles.manage'         => 'Manage roles & permissions',
            'delegations.manage'   => 'Manage MD delegations',
        ] as $name => $label) {
            $permissions[$name] = ['name' => $name, 'group' => 'module', 'label' => $label];
        }

        foreach ($permissions as $p) {
            Permission::updateOrCreate(['name' => $p['name']], $p);
        }

        // ------------------------------------------------ roles
        foreach (RoleName::cases() as $role) {
            Role::updateOrCreate(['name' => $role->value], [
                'label'       => $role->label(),
                'description' => $role->description(),
                'is_system'   => true,
            ]);
        }

        // ------------------------------------------------ matrix
        $opPerms = fn (string ...$ops) => collect($ops)
            ->flatMap(fn ($op) => collect(self::VERBS)->map(fn ($v) => "{$v}_{$op}"))
            ->all();

        $allOps = array_keys(self::OPERATIONS);

        $dataView = ['facilities.view', 'customers.view', 'meters.view', 'notifications.view', 'attachments.download'];

        $matrix = [
            RoleName::SUPER_ADMIN->value => array_keys($permissions),

            RoleName::SECRETARY->value => array_merge(
                $opPerms(...$allOps),
                ['release_meter_installation', 'approvals.view', 'reports.view', ...$dataView],
            ),

            RoleName::TECHNICAL_MAN->value => array_merge(
                $opPerms(...$allOps),
                ['edit_meter_activation', ...$dataView],
            ),

            RoleName::ENERGY_MANAGER->value => array_merge(
                $opPerms(...$allOps),
                ['approvals.view', 'reports.view', ...$dataView],
            ),

            RoleName::GENERAL_MANAGER->value => array_merge(
                $opPerms(...$allOps),
                ['approvals.view', 'reports.view', ...$dataView],
            ),

            RoleName::MD->value => array_merge(
                $opPerms(...$allOps),
                ['approvals.view', 'reports.view', 'delegations.manage', ...$dataView],
            ),

            // IT Manager administers the platform but never bypasses
            // operational approval workflows.
            RoleName::IT_MANAGER->value => array_merge(
                $opPerms(...$allOps),
                ['reports.view', 'api_logs.view', 'audit_logs.view', 'settings.manage', 'api_settings.manage', 'users.manage', 'facilities.sync', ...$dataView],
            ),
        ];

        foreach ($matrix as $roleName => $permNames) {
            $role = Role::where('name', $roleName)->firstOrFail();
            $role->permissions()->syncWithoutDetaching(
                Permission::whereIn('name', array_unique($permNames))->pluck('id')
            );
        }
    }
}
