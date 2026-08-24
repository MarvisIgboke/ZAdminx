<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RolePermissionSeeder::class,   // roles, permissions, matrix
            DemoUserSeeder::class,         // one user per role
            DemoDataSeeder::class,         // catalog + sample workflows
        ]);
    }
}
