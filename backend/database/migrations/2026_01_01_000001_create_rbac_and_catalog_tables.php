<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * RBAC (roles, permissions, pivots, users, delegations) and the ZVend-synced
 * catalog (facilities, customers, meters).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name', 40)->unique();
            $table->string('label', 80);
            $table->string('description')->nullable();
            $table->boolean('is_system')->default(true);
            $table->timestamps();
        });

        Schema::create('permissions', function (Blueprint $table) {
            $table->id();
            $table->string('name', 60)->unique();
            $table->string('group', 40)->index();
            $table->string('label', 120);
            $table->timestamps();
        });

        Schema::create('permission_role', function (Blueprint $table) {
            $table->unsignedBigInteger('permission_id');
            $table->unsignedBigInteger('role_id');
            $table->primary(['permission_id', 'role_id']);
            $table->foreign('permission_id')->references('id')->on('permissions')->cascadeOnDelete();
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
        });

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->string('phone', 30)->nullable();
            $table->string('employee_code', 20)->unique()->nullable();
            $table->boolean('is_active')->default(true);
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('role_user', function (Blueprint $table) {
            $table->unsignedBigInteger('role_id');
            $table->unsignedBigInteger('user_id');
            $table->primary(['role_id', 'user_id']);
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        Schema::create('delegations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delegator_id')->constrained('users')->cascadeOnDelete();   // MD
            $table->foreignId('delegate_id')->constrained('users')->cascadeOnDelete();   // GM
            $table->date('starts_on');
            $table->date('ends_on');
            $table->text('reason');
            $table->string('status', 15)->default('active')->index();                    // active | expired | revoked
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
            $table->unique(['delegator_id', 'delegate_id', 'starts_on']);
        });

        Schema::create('facilities', function (Blueprint $table) {
            $table->id();
            $table->string('zvend_facility_id', 40)->nullable()->unique();
            $table->string('code', 20)->unique();
            $table->string('name', 120);
            $table->string('address')->nullable();
            $table->string('city', 60)->nullable();
            $table->string('state', 60)->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 11, 7)->nullable();
            $table->string('status', 15)->default('ACTIVE')->index();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('facility_id')->constrained('facilities')->cascadeOnDelete();
            $table->string('zvend_customer_id', 40)->nullable()->unique();
            // Customer names are deliberately NOT unique: one customer may hold
            // several meters and different customers may share a name.
            $table->string('name', 120);
            $table->string('phone', 30)->nullable();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->string('status', 15)->default('ACTIVE')->index();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['facility_id', 'name']);
        });

        Schema::create('meters', function (Blueprint $table) {
            $table->id();
            // Global uniqueness — enforced at the database level in addition to
            // application validation ("This meter number already exists.").
            $table->string('meter_number', 30)->unique();
            $table->foreignId('facility_id')->nullable()->constrained('facilities')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->string('model', 60)->nullable();
            $table->string('phase', 10)->default('single');
            $table->string('status', 20)->default('IN_STOCK')->index();  // IN_STOCK | INSTALLED | ACTIVE | FAULTY | DECOMMISSIONED
            $table->timestamp('installed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meters');
        Schema::dropIfExists('customers');
        Schema::dropIfExists('facilities');
        Schema::dropIfExists('delegations');
        Schema::dropIfExists('role_user');
        Schema::dropIfExists('users');
        Schema::dropIfExists('permission_role');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
    }
};
