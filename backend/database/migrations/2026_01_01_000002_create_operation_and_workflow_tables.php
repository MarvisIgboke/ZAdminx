<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * The five core operation tables share an identical workflow spine
 * (txn, status, current_stage, ZVend block, field assignment block) plus a
 * few operation-specific columns. Workflow Steps / Comments / Attachments /
 * GPS records are polymorphic over all five via (operation_type, operation_id).
 */
return new class extends Migration
{
    public function up(): void
    {
        $operationSpine = function (Blueprint $table) {
            $table->id();
            $table->string('txn', 40)->unique();                       // ZADM-INS-20260824-000001 …
            $table->string('status', 30)->index();                     // OperationStatus enum
            $table->string('current_stage', 30)->nullable()->index();  // WorkflowStage enum
            $table->unsignedTinyInteger('stage_index')->default(0);
            $table->string('meter_number', 30)->index();
            $table->foreignId('meter_id')->nullable()->constrained('meters')->nullOnDelete();
            $table->foreignId('facility_id')->constrained('facilities')->cascadeOnDelete();
            $table->foreignId('initiator_id')->constrained('users');
            $table->string('initiator_role', 30);
            // ZVend block -------------------------------------------------
            $table->timestamp('md_approved_at')->nullable();
            $table->string('zvend_status', 20)->nullable();            // pending | success | failed
            $table->string('zvend_reference', 80)->nullable();
            $table->string('zvend_response_code', 10)->nullable();
            $table->text('tamper_code')->nullable();                   // encrypted cast
            $table->text('clear_code')->nullable();                    // encrypted cast
            $table->timestamp('zvend_called_at')->nullable();
            $table->unsignedInteger('zvend_latency_ms')->nullable();
            // Field / lifecycle block --------------------------------------
            $table->timestamp('available_to_field_at')->nullable();
            $table->foreignId('assigned_to_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedTinyInteger('retry_count')->default(0);
            $table->string('idempotency_key', 128)->nullable()->unique();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        };

        Schema::create('meter_installations', function (Blueprint $table) use ($operationSpine) {
            $operationSpine($table);
            $table->text('secretary_comment')->nullable();
        });

        Schema::create('meter_activations', function (Blueprint $table) use ($operationSpine) {
            $operationSpine($table);
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            // Snapshot so the operational record survives catalog edits.
            $table->string('customer_name', 120)->nullable();
            $table->string('customer_phone', 30)->nullable();
            $table->string('customer_email')->nullable();
            $table->string('customer_address')->nullable();
            $table->text('technical_comment')->nullable();
        });

        Schema::create('meter_inspections', function (Blueprint $table) use ($operationSpine) {
            $operationSpine($table);
            $table->foreignId('scheduled_by_id')->constrained('users');               // GM
            $table->date('scheduled_for');
            $table->text('instruction');
            $table->unsignedSmallInteger('duration_seconds');                          // from system_settings, never hard-coded
            $table->foreignId('performed_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('video_disk', 20)->nullable();
            $table->string('video_path')->nullable();
            $table->unsignedSmallInteger('video_duration_seconds')->nullable();
            $table->text('observations')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('submitted_at')->nullable();
        });

        Schema::create('tamper_code_requests', function (Blueprint $table) use ($operationSpine) {
            $operationSpine($table);
            $table->string('requested_via', 10)->default('manual');   // manual (Secretary) | scan (Technical Man)
            $table->text('reason')->nullable();
            $table->text('issued_code')->nullable();                  // encrypted cast
            $table->timestamp('issued_at')->nullable();
        });

        Schema::create('clear_code_requests', function (Blueprint $table) use ($operationSpine) {
            $operationSpine($table);
            $table->string('requested_via', 10)->default('manual');
            $table->text('reason')->nullable();
            $table->text('issued_code')->nullable();                  // encrypted cast
            $table->timestamp('issued_at')->nullable();
        });

        Schema::create('workflow_steps', function (Blueprint $table) {
            $table->id();
            $table->string('operation_type', 30);
            $table->unsignedBigInteger('operation_id');
            $table->string('stage_key', 30);
            $table->string('stage_label', 60);
            $table->string('role', 30);
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();  // the actor who decided
            $table->string('decision', 20)->nullable();
            $table->boolean('decided_by_delegation')->default(false);
            $table->unsignedBigInteger('comment_id')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->boolean('is_current')->default(false)->index();
            $table->timestamps();
            $table->unique(['operation_type', 'operation_id', 'stage_key']);
            $table->index(['operation_type', 'operation_id']);
        });

        // Append-only by design: created_at only, never updated, never deleted.
        Schema::create('workflow_comments', function (Blueprint $table) {
            $table->id();
            $table->string('transaction_id', 40)->index();
            $table->string('operation_type', 30)->index();
            $table->unsignedBigInteger('operation_id');
            $table->foreignId('user_id')->constrained('users');
            $table->string('role', 30);
            $table->text('comment');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('operation_attachments', function (Blueprint $table) {
            $table->id();
            $table->string('operation_type', 30);
            $table->unsignedBigInteger('operation_id');
            $table->string('kind', 15);                    // photo | video | barcode
            $table->string('label', 60);
            $table->string('disk', 20)->default('local');
            $table->string('path');                        // {operation}/{transaction}/photos/…
            $table->string('mime_type', 60)->nullable();
            $table->unsignedInteger('size_bytes')->nullable();
            $table->string('checksum', 64)->nullable();
            $table->foreignId('captured_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('captured_at')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 11, 7)->nullable();
            $table->timestamps();
            $table->index(['operation_type', 'operation_id']);
        });

        Schema::create('gps_records', function (Blueprint $table) {
            $table->id();
            $table->string('operation_type', 30);
            $table->unsignedBigInteger('operation_id');
            $table->foreignId('user_id')->constrained('users');
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 11, 7);
            $table->decimal('accuracy_m', 8, 2);
            $table->timestamp('captured_at')->nullable();
            $table->boolean('accepted')->default(true);
            $table->string('rejection_reason')->nullable();
            $table->timestamps();
            $table->index(['operation_type', 'operation_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gps_records');
        Schema::dropIfExists('operation_attachments');
        Schema::dropIfExists('workflow_comments');
        Schema::dropIfExists('workflow_steps');
        Schema::dropIfExists('clear_code_requests');
        Schema::dropIfExists('tamper_code_requests');
        Schema::dropIfExists('meter_inspections');
        Schema::dropIfExists('meter_activations');
        Schema::dropIfExists('meter_installations');
    }
};
