# Z ADMIN — Laravel API

Enterprise electricity meter **operations & field management** API for Zarox Energy
Solutions. Z Admin orchestrates internal approvals, field execution and audit
trails, and talks to the external **ZVend** vending platform exclusively through
`App\Services\ZVendApiService`.

The Next.js/React PWA in the repository root consumes the `/api/v1` contract
documented in [`routes/api.php`](routes/api.php).

---

## 1. Requirements

- PHP 8.2+, Composer, MySQL 8.0+
- Node only for the frontend (see root `package.json`)

## 2. Installation

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate

# Database
mysql -e "CREATE DATABASE zadmin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
php artisan migrate            # schema
php artisan db:seed            # RBAC matrix + demo users + sample workflows

php artisan storage:link
php artisan queue:table && php artisan migrate   # if missing
```

Run locally:

```bash
php artisan serve --port=8000
php artisan queue:work --tries=3        # ZVend jobs
php artisan schedule:work               # delegation expiry + sync housekeeping
```

## 3. Environment

All secrets come from `.env` — never from source. Runtime overrides for ZVend
credentials are stored **encrypted** in `api_settings` and managed by the IT
Manager (Administration → API Configuration). See [`.env.example`](.env.example).

## 4. Architecture

```
app/
  Enums/Enums.php            OperationType, OperationStatus, WorkflowStage,
                             WorkflowDecision, RoleName  (classmap autoloaded)
  Exceptions/Exceptions.php  ZVendException, WorkflowException,
                             IdempotencyReplayException
  Models/                    Domain-grouped Eloquent models (classmap):
    RbacModels.php           User, Role, Permission, Delegation
    CatalogModels.php        Facility, Customer, Meter
    OperationModels.php      OperationModel + 5 concrete operations
    WorkflowModels.php       WorkflowStep, WorkflowComment,
                             OperationAttachment, GpsRecord
    SystemModels.php         ApiSetting, ApiRequest, ApiResponse,
                             IdempotencyKey, SyncLog, AuditLog,
                             AppNotification, SystemSetting
  Services/
    ZVendApiService.php      The ONLY HTTP client to ZVend (timeout, retry,
                             idempotency, sanitized logging, structured errors)
    WorkflowEngine.php       Stage pipelines, transition validation, MD
                             delegation, ZVend hand-off, notifications, audit
    TransactionIdService.php ZADM-INS/ACT/INSP/TMP/CLR id generation
    AuditService.php         Append-only audit writer
  Actions/                   CreateMeterInstallation, CreateCodeRequest,
                             ScheduleMeterInspection, SubmitFieldCapture
  Policies/OperationPolicy   Permission-mapped, registered for all 5 models
  Http/Controllers/Api/V1/   Thin controllers
  Http/Requests/             Form Requests (validation + workflow-state rules)
  Jobs/CallZVendOperationJob Idempotent ZVend dispatch after MD approval
```

Domain models, enums, exceptions, form requests and resources are grouped into
domain files and resolved through Composer **classmap** autoloading (see
`composer.json`) to keep the five parallel operation modules DRY. Services,
actions, controllers and policies follow strict PSR-4, one class per file.

### Workflow engine

Pipelines (validated server-side; illegal transitions raise `WorkflowException`):

| Operation | Chain |
|---|---|
| Meter Installation | Secretary → EM → GM → MD → **ZVend** → Secretary release → Technical Man execute |
| Meter Activation | Technical Man (field capture) → Secretary → EM → GM → MD → **ZVend** → Secretary confirm |
| Meter Inspection | GM schedule → Technical Man (video) → Secretary → EM → GM → MD — *no ZVend call* |
| Tamper / Clear Code | Secretary *or* Technical Man → EM → GM → MD → **ZVend** → initiator delivery |

- Every decision persists an immutable `workflow_comments` row (never updated, never deleted).
- **MD → GM delegation** is honoured only while active; decisions are stamped
  `decided_by_delegation` and commented *"Approved under MD delegation."*
- `idempotency_keys` prevent duplicate approvals and duplicate ZVend transactions;
  replays return the original snapshot.
- Codes (tamper/clear) are stored with Eloquent `encrypted` casts and never appear
  in API logs; reveal/copy endpoints audit `code_reveal` / `code_copy`.
- Field rules (`max_gps_accuracy_m`, `inspection_durations`) live in
  `system_settings` — nothing is hard-coded.

## 5. API surface (v1)

Authentication: `POST /api/v1/login` → Sanctum bearer token with the user's
permissions as abilities. Every other route requires `Authorization: Bearer …`.

Core operations (×5: `meter-installations`, `meter-activations`,
`meter-inspections`, `tamper-code-requests`, `clear-code-requests`):
`GET /`, `POST /`, `GET /{id}`, `GET /{id}/history`, `POST /{id}/approve|reject|return`,
plus `release` / `execute` / `capture` / `submit` / `schedule` where applicable.
Decisions accept `{ "comment": "…", "idempotency_key": "…" }` (comment required).

Data: `GET facilities[/refresh]`, `facilities/{id}/customers|meters|operations`,
`customers/{id}/vending-history|funding-history`, `POST sync/zvend`.

Admin: `administration/users|roles|settings|api-settings|delegations|api-logs|audit-logs`,
`reports/operations`, `notifications`.

## 5.1 ZVend wire contract (the four operation calls)

`ZVendApiService` is the **only** HTTP path to ZVend. Z Admin calls these
automatically (queued `CallZVendOperationJob`) **after MD approval** — clients
never call ZVend directly. If you are testing ZVend itself (curl / Postman /
contract tests), these are the exact shapes Z Admin sends.

Common headers on all four:

```
Authorization:   Bearer {ZVEND_API_TOKEN}      # env or encrypted api_settings
Content-Type:    application/json
Accept:          application/json
Idempotency-Key: zvend:{transaction}:{attempt}  # e.g. zvend:ZADM-INS-20260213-000001:1
```

**1. INSTALL** — `POST {ZVEND_BASE_URL}/v1/meters/install`

```json
{ "meter_number": "45039813401", "facility": "FAC-IKY" }
```

**2. ACTIVATE** — `POST {ZVEND_BASE_URL}/v1/meters/activate`

```json
{
  "facility": "FAC-IKY",
  "meter_number": "45039813117",
  "customer_name": "John Joe",
  "customer_phone": "08031112222",
  "customer_email": "john.joe@mail.com",
  "customer_address": "12 Adeola Close, Ikoyi",
  "latitude": 6.443211,
  "longitude": 3.418600
}
```

Null/empty fields are dropped (`array_filter`) before sending.

**3. TAMPER** — `POST {ZVEND_BASE_URL}/v1/meters/tamper-code`

```json
{ "meter_number": "45039813339" }
```

**4. CLEAR** — `POST {ZVEND_BASE_URL}/v1/meters/clear-code`

```json
{ "meter_number": "45039813339" }
```

**Expected response** (parsed by `CallZVendOperationJob`; `data.reference`
accepted as fallback):

```json
{
  "response_code": "00",
  "reference": "ZV-REF-88213",
  "tamper_code": "88410293571620483759",
  "clear_code": "66291847350219864530"
}
```

`response_code` may also echo the HTTP status. Tamper/clear codes are 20-digit
numerals; they are stored encrypted and **never** appear in API logs. Non-2xx
responses raise `ZVendException` → the record moves to `ZVEND_FAILED` with a
permission-gated retry.

## 6. Storage & security

- Uploads land on the private disk under `{operation}/{transaction}/photos|video`
  and are served only through the authorized `attachments/{id}/download` route.
- Audit logs and workflow comments are append-only (no update/delete routes, `UPDATED_AT` disabled).
- Operational records are never physically deleted (soft deletes + lifecycle statuses).
- Meter numbers: unique DB constraint **and** application validation ("This meter number already exists.").
- ZVend payloads are sanitized (`config('zvend.sanitize_keys')`) before persistence.

## 7. Tests

```bash
php artisan test          # uses sqlite :memory: (phpunit.xml)
```

Covers: RBAC enforcement (a user cannot perform an operation merely by calling
its endpoint), the full installation happy path incl. ZVend fake, barcode
mismatch, GPS accuracy rejection, duplicate meter numbers, and idempotency of
approvals and ZVend calls.
