<?php

namespace Database\Seeders;

use App\Enums\RoleName;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * The seven canonical Z Admin users (one per role). Demo password: "password".
 */
class DemoUserSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            ['Amara Okafor',   'super.admin@zarox.com', 'ZA-001', RoleName::SUPER_ADMIN],
            ['Bisi Adeyemi',   'secretary@zarox.com',   'ZA-002', RoleName::SECRETARY],
            ['Chike Eze',      'tech@zarox.com',        'ZA-003', RoleName::TECHNICAL_MAN],
            ['Funke Balogun',  'energy@zarox.com',      'ZA-004', RoleName::ENERGY_MANAGER],
            ['Ibrahim Musa',   'gm@zarox.com',          'ZA-005', RoleName::GENERAL_MANAGER],
            ['Zainab Farouk',  'md@zarox.com',          'ZA-006', RoleName::MD],
            ['Tunde Alabi',    'it@zarox.com',          'ZA-007', RoleName::IT_MANAGER],
        ];

        foreach ($users as [$name, $email, $code, RoleName $role]) {
            $user = User::updateOrCreate(
                ['email' => $email],
                [
                    'name'          => $name,
                    'password'      => Hash::make('password'),
                    'employee_code' => $code,
                    'phone'         => '+234 803 000 00'.substr($code, -2),
                    'is_active'     => true,
                ]
            );

            $user->roles()->syncWithoutDetaching(Role::where('name', $role->value)->firstOrFail());
        }
    }
}
