<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * ZVend integration bookkeeping (settings, requests, responses, idempotency,
 * sync logs) and system tables (notifications, append-only audit, settings,
 * queue, sanctum tokens).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('api_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 60)->unique();
            $table->text('value')->nullable();              // encrypted at rest when is_secret
            $table->boolean('is_secret')->default(false);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('api_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('operation_type', 30)->nullable();
            $table->unsignedBigInteger('operation_id')->nullable();
            $table->string('transaction_id', 40)->nullable()->index();
            $table->string('method', 10);
            $table->string('endpoint');
            $table->string('idempotency_key', 128)->nullable()->unique();
            $table->json('request_payload')->nullable();    // sanitized — never secrets
            $table->string('status', 15)->default('pending')->index();  // pending | success | failed | timeout
            $table->timestamp('started_at')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->timestamps();
        });

        Schema::create('api_responses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('api_request_id')->constrained('api_requests')->cascadeOnDelete();
            $table->string('response_code', 10)->nullable();
            $table->json('response_body')->nullable();      // sanitized
            $table->timestamp('received_at')->nullable();
            $table->timestamps();
        });

        Schema::create('idempotency_keys', function (Blueprint $table) {
            $table->id();
            $table->string('key', 128)->unique();
            $table->string('operation_type', 30)->nullable();
            $table->unsignedBigInteger('operation_id')->nullable();
            $table->string('purpose', 40);                  // approval | zvend_call | sync …
            $table->json('response_snapshot')->nullable();
            $table->timestamp('consumed_at')->nullable();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sync_logs', function (Blueprint $table) {
            $table->id();
            $table->string('source', 20)->default('zvend');
            $table->string('entity', 30);                   // facilities | customers | meters
            $table->string('direction', 10)->default('pull');
            $table->unsignedInteger('records_processed')->default(0);
            $table->unsignedInteger('records_failed')->default(0);
            $table->string('status', 15)->index();          // running | success | failed
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->foreignId('triggered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->string('for_role', 30)->nullable()->index();
            $table->foreignId('for_user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->string('kind', 20);                     // approval | zvend | field | system
            $table->string('title', 150);
            $table->text('body')->nullable();
            $table->string('transaction_id', 40)->nullable();
            $table->string('operation_type', 30)->nullable();
            $table->unsignedBigInteger('operation_id')->nullable();
            $table->timestamp('read_at')->nullable()->index();
            $table->timestamp('created_at')->nullable();
        });

        // Append-only: created_at only. No update/delete paths exist anywhere.
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('user_name', 120);               // denormalized: survives user edits
            $table->string('action', 50)->index();
            $table->string('auditable_type', 80)->nullable();
            $table->unsignedBigInteger('auditable_id')->nullable();
            $table->string('transaction_id', 40)->nullable()->index();
            $table->text('detail')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent')->nullable();
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('system_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 60)->unique();
            $table->json('value')->nullable();
            $table->string('group', 30)->index();
            $table->string('label', 120);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('jobs', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('queue')->index();
            $table->longText('payload');
            $table->unsignedTinyInteger('attempts');
            $table->unsignedInteger('reserved_at')->nullable();
            $table->unsignedInteger('available_at');
            $table->unsignedInteger('created_at');
        });

        Schema::create('failed_jobs', function (Blueprint $table) {
            $table->id();
            $table->string('uuid')->unique();
            $table->text('connection');
            $table->text('queue');
            $table->longText('payload');
            $table->longText('exception');
            $table->timestamp('failed_at')->useCurrent();
        });

        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->string('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('personal_access_tokens');
        Schema::dropIfExists('failed_jobs');
        Schema::dropIfExists('jobs');
        Schema::dropIfExists('system_settings');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('sync_logs');
        Schema::dropIfExists('idempotency_keys');
        Schema::dropIfExists('api_responses');
        Schema::dropIfExists('api_requests');
        Schema::dropIfExists('api_settings');
    }
};
