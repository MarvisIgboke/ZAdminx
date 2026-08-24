import { Fragment, useMemo, useRef, useState } from "react";
import { Btn, Icon, SectionHead, useRoute } from "../components/ui";
import { useStore } from "../lib/store";

// ============================================================
// Types
// ============================================================
type ApiParam = { name: string; where: "path" | "query" | "header" | "form"; type: string; req?: boolean; desc: string };
type ApiEndpoint = {
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  desc: string;
  perm?: string;
  params?: ApiParam[];
  req?: string;   // JSON body sample or full URL line for GETs
  res?: string;   // JSON response sample
  note?: string;
};
type ApiGroup = { id: string; title: string; blurb: string; external?: boolean; endpoints: ApiEndpoint[] };

// ============================================================
// Shared response / request literals (exact contracts)
// ============================================================
const AUTH_NOTE = "All /api/v1 routes (except /login) require:  Authorization: Bearer {token}";

const OP_RESOURCE = `{
  "data": {
    "id": 12,
    "type": "meter_installation",
    "txn": "ZADM-INS-20260213-000011",
    "status": "PENDING",
    "current_stage": "ENERGY_MANAGER",
    "stage_index": 1,
    "meter_number": "45039813401",
    "meter_id": 16,
    "facility": { "id": 5, "code": "FAC-AJA", "name": "Ajah Feeder Station" },
    "initiator": { "id": 2, "name": "Bisi Adeyemi" },
    "initiator_role": "SECRETARY",
    "assignee": null,
    "secretary_comment": "New build at Ajah Feeder — customer waiting.",
    "md_approved_at": null,
    "zvend_status": null,
    "zvend_reference": null,
    "zvend_response_code": null,
    "tamper_code_masked": null,
    "clear_code_masked": null,
    "available_to_field_at": null,
    "retry_count": 0,
    "completed_at": null,
    "created_at": "2026-02-13T09:14:02Z",
    "steps": [
      { "stage_key": "INITIATOR", "stage_label": "Secretary Submission",
        "role": "SECRETARY", "decision": "SUBMIT",
        "decider": { "id": 2, "name": "Bisi Adeyemi" },
        "decided_by_delegation": false, "decided_at": "2026-02-13T09:14:02Z",
        "is_current": false },
      { "stage_key": "ENERGY_MANAGER", "stage_label": "Energy Manager Approval",
        "role": "ENERGY_MANAGER", "decision": null, "decider": null,
        "decided_at": null, "is_current": true }
    ],
    "comments": [
      { "id": 41, "user": { "id": 2, "name": "Bisi Adeyemi" }, "role": "SECRETARY",
        "comment": "Submitted for approval.", "created_at": "2026-02-13T09:14:02Z" }
    ],
    "attachments": [
      { "id": 9, "kind": "photo", "label": "Meter Front",
        "captured_at": "2026-02-13T11:02:44Z",
        "url": "http://localhost:8000/api/v1/attachments/9/download" }
    ],
    "gps_records": [
      { "latitude": 6.4668120, "longitude": 3.5852010, "accuracy_m": 12.0,
        "accepted": true, "captured_at": "2026-02-13T11:01:09Z" }
    ]
  }
}`;

const OP_LIST = `{
  "data": [ "...OperationResource objects" ],
  "links": { "first": "...", "next": "...", "prev": null, "last": "..." },
  "meta": {
    "current_page": 1, "per_page": 15, "total": 42, "last_page": 3,
    "from": 1, "to": 15
  }
}`;

const DECISION_REQ = `{
  "comment": "Stock verified against store ledger — approved.",
  "idempotency_key": "appr-9f3c-77ae-2b14"
}`;

const DECISION_NOTE = "comment is required at every stage and is never editable afterwards. idempotency_key is optional; a repeat with the same key replays the original outcome (HTTP 200, replay: true) instead of double-deciding.";

const HISTORY_RES = `{
  "steps": [ "...WorkflowStep rows with decider + comment" ],
  "audit": [
    { "id": 301, "user_name": "Funke Balogun", "action": "operation_approve",
      "transaction_id": "ZADM-INS-20260213-000011",
      "detail": "Meter Installation … — approve by Funke Balogun",
      "ip_address": "10.4.2.11", "created_at": "2026-02-13T10:02:11Z" }
  ],
  "api": [
    { "id": 58, "method": "POST", "endpoint": "/v1/meters/install",
      "idempotency_key": "zvend:ZADM-INS-20260213-000011:1",
      "status": "success", "duration_ms": 412, "started_at": "2026-02-13T10:41:00Z",
      "response": { "response_code": "00",
        "response_body": { "response_code": "00", "reference": "ZV-REF-88213" } } }
  ]
}`;

const REPLAY_RES = `{
  "message": "Idempotent request replayed — original outcome returned.",
  "replay": true,
  "result": { "status": "PENDING", "stage": "GENERAL_MANAGER",
              "txn": "ZADM-INS-20260213-000011" }
}`;

const ERR_401 = `{ "message": "Unauthenticated." }`;
const ERR_403 = `{ "message": "This action is unauthorized." }`;
const ERR_422_VALIDATION = `{
  "message": "The meter number has already been taken.",
  "errors": {
    "meter_number": [ "This meter number already exists." ]
  }
}`;
const ERR_422_WORKFLOW = `{
  "message": "This record is not awaiting your action (expected stage: MD).",
  "code": "WORKFLOW_WRONG_STAGE"
}`;
const ERR_502 = `{
  "message": "ZVend request failed.",
  "endpoint": "/v1/meters/install",
  "reason": "ZVend returned HTTP 503."
}`;

const INDEX_PARAMS: ApiParam[] = [
  { name: "status", where: "query", type: "string", desc: "Filter by OperationStatus (PENDING, WAITING_ZVEND, …)" },
  { name: "current_stage", where: "query", type: "string", desc: "Filter by WorkflowStage key" },
  { name: "facility_id", where: "query", type: "integer", desc: "Facility id" },
  { name: "meter_number", where: "query", type: "string", desc: "Partial meter match" },
  { name: "txn", where: "query", type: "string", desc: "Partial transaction id match" },
  { name: "from / to", where: "query", type: "date", desc: "Created-at window (YYYY-MM-DD)" },
  { name: "per_page", where: "query", type: "integer", desc: "Page size, max 50 (default 15)" },
];

// ============================================================
// Operation group factory — the five operations share one spine
// ============================================================
function decisionSet(base: string, perm: string, noun: string): ApiEndpoint[] {
  return [
    { method: "POST", path: `${base}/{id}/approve`, desc: `Approve at the current stage and advance the ${noun} chain.`, perm: `approve_${perm}`, params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Record id" }], req: DECISION_REQ, res: OP_RESOURCE, note: DECISION_NOTE },
    { method: "POST", path: `${base}/{id}/reject`, desc: `Reject — terminal REJECTED status; comments and audit are preserved.`, perm: `reject_${perm}`, params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Record id" }], req: DECISION_REQ, res: OP_RESOURCE },
    { method: "POST", path: `${base}/{id}/return`, desc: `Return to the initiator for correction — status RETURNED.`, perm: `return_${perm}`, params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Record id" }], req: DECISION_REQ, res: OP_RESOURCE },
  ];
}

function baseList(base: string, perm: string, label: string): ApiEndpoint {
  return { method: "GET", path: `${base}`, desc: `List ${label} records with workflow filters and pagination.`, perm: `view_${perm}`, params: INDEX_PARAMS, req: `GET /api/v1${base}?status=PENDING&current_stage=MD&per_page=15`, res: OP_LIST };
}

function baseShow(base: string, perm: string, label: string): ApiEndpoint[] {
  return [
    { method: "GET", path: `${base}/{id}`, desc: `Full ${label} record: status, masked codes, steps, comments, attachments, GPS.`, perm: `view_${perm}`, params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Record id" }], res: OP_RESOURCE, note: "Tamper/clear codes are always masked here — use the audited reveal endpoint." },
    { method: "GET", path: `${base}/{id}/history`, desc: "Append-only trail: workflow steps, audit events and ZVend API calls.", perm: `view_history_${perm}`, params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Record id" }], res: HISTORY_RES },
  ];
}

// ============================================================
// Full dataset
// ============================================================
const GROUPS: ApiGroup[] = [
  {
    id: "auth", title: "Authentication", blurb: "Sanctum bearer tokens; the token carries the user's permission list as abilities.",
    endpoints: [
      { method: "POST", path: "/v1/login", desc: "Exchange credentials for a bearer token. Rate limited to 10/min.", req: `{
  "email": "secretary@zarox.com",
  "password": "password"
}`, res: `{
  "token": "3|Hk2v9QfT0aBcDeFgHiJkLmNoPqRsTuVwXyZ012345",
  "user": {
    "id": 2, "name": "Bisi Adeyemi", "email": "secretary@zarox.com",
    "role": "SECRETARY",
    "permissions": [ "view_meter_installation", "create_meter_installation",
                     "approve_meter_activation", "…35 total" ]
  }
}` },
      { method: "GET", path: "/v1/me", desc: "Signed-in profile with roles and resolved permissions.", req: `GET /api/v1/me   (Authorization: Bearer {token})`, res: `{
  "id": 2, "name": "Bisi Adeyemi", "email": "secretary@zarox.com",
  "role": "SECRETARY", "roles": [ "SECRETARY" ],
  "permissions": [ "view_meter_installation", "create_meter_installation", "…" ]
}` },
      { method: "POST", path: "/v1/logout", desc: "Revoke the current token (audited).", req: `POST /api/v1/logout   (no body)`, res: `{ "message": "Signed out." }` },
    ],
  },
  {
    id: "installation", title: "Meter Installation", blurb: "Secretary → EM → GM → MD → ZVend → Secretary release → Technical Man field execution. The new meter is NOT checked against ZVend at initiation.",
    endpoints: [
      baseList("/v1/meter-installations", "meter_installation", "installation"),
      { method: "POST", path: "/v1/meter-installations", desc: "Secretary initiates a NEW meter installation. Duplicate meter numbers are rejected immediately.", perm: "create_meter_installation", req: `{
  "meter_number": "45039813401",
  "facility_id": 5,
  "comment": "New build at Ajah Feeder — customer waiting on energization."
}`, res: OP_RESOURCE, note: "meter_number: digits only, globally unique (422 otherwise). Creates the meter as IN_STOCK and starts the chain at ENERGY_MANAGER." },
      ...baseShow("/v1/meter-installations", "meter_installation", "installation"),
      ...decisionSet("/v1/meter-installations", "meter_installation", "installation"),
      { method: "POST", path: "/v1/meter-installations/{id}/release", desc: "Secretary: MAKE AVAILABLE TO TECHNICAL MAN after ZVend success.", perm: "release_meter_installation", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Record id" }], req: `{
  "comment": "Made available to Technical Man."
}`, res: OP_RESOURCE, note: "Only valid at the DELIVERY stage (status ZVEND_SUCCESS). Moves the record to ASSIGNED." },
      { method: "POST", path: "/v1/meter-installations/{id}/execute", desc: "Technical Man: barcode scan → GPS → 4 photos → completion. multipart/form-data.", perm: "execute_meter_installation", params: [
        { name: "id", where: "path", type: "integer", req: true, desc: "Record id" },
        { name: "scan_value", where: "form", type: "string", req: true, desc: "Scanned barcode — must equal meter_number (422 METER_NUMBER_MISMATCH)" },
        { name: "gps[latitude / longitude / accuracy]", where: "form", type: "number", req: true, desc: "accuracy beyond max_gps_accuracy_m → 422 GPS_ACCURACY_EXCEEDED" },
        { name: "photos[]", where: "form", type: "image×4", req: true, desc: "Meter front, installation, barcode, environment" },
        { name: "comment", where: "form", type: "string", desc: "Field note" },
      ], req: `Content-Type: multipart/form-data

scan_value = 45039813401
gps[latitude] = 6.466812
gps[longitude] = 3.585201
gps[accuracy] = 12
photos[] = meter-front.jpg
photos[] = installation.jpg
photos[] = barcode.jpg
photos[] = environment.jpg
comment = Installed, sealed and photographed.`, res: OP_RESOURCE, note: "On COMPLETED the meter flips to INSTALLED. Barcode mismatch or GPS beyond the configured ceiling aborts atomically — nothing is persisted." },
    ],
  },
  {
    id: "activation", title: "Meter Activation", blurb: "Technical Man field capture → Secretary → EM → GM → MD → ZVend → Secretary completion. Only the Technical Man can initiate.",
    endpoints: [
      baseList("/v1/meter-activations", "meter_activation", "activation"),
      { method: "POST", path: "/v1/meter-activations", desc: "Technical Man submits scan + GPS + photos + customer in one atomic capture. multipart/form-data.", perm: "create_meter_activation", params: [
        { name: "scan_value", where: "form", type: "string", req: true, desc: "Scanned barcode (must match meter_number)" },
        { name: "gps[…]", where: "form", type: "number", req: true, desc: "latitude, longitude, accuracy" },
        { name: "photos[]", where: "form", type: "image×4", req: true, desc: "Evidence photos" },
        { name: "customer[…]", where: "form", type: "object", req: true, desc: "name, phone, email, address — customers may hold multiple meters" },
      ], req: `Content-Type: multipart/form-data

meter_number = 45039813117
facility_id = 1
scan_value = 45039813117
gps[latitude] = 6.447801
gps[longitude] = 3.472102
gps[accuracy] = 9
photos[] = front.jpg
photos[] = install.jpg
photos[] = barcode.jpg
photos[] = env.jpg
customer[name] = John Joe
customer[phone] = 08031112222
customer[email] = john.joe@mail.com
customer[address] = 12 Adeola Close, Ikoyi
comment = Customer verified in person with ID.`, res: OP_RESOURCE, note: "Creates (or reuses) the customer, snapshots customer data onto the record, then starts the chain at the SECRETARY stage." },
      ...baseShow("/v1/meter-activations", "meter_activation", "activation"),
      ...decisionSet("/v1/meter-activations", "meter_activation", "activation"),
      { method: "POST", path: "/v1/meter-activations/{id}/capture", desc: "Technical Man: add or replace field evidence (e.g. after a RETURN).", perm: "execute_meter_activation", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Record id" }], req: `Content-Type: multipart/form-data

scan_value = 45039813117
gps[latitude] = 6.447801
gps[longitude] = 3.472102
gps[accuracy] = 11
photos[] = replacement.jpg`, res: OP_RESOURCE },
      { method: "POST", path: "/v1/meter-activations/{id}/complete", desc: "Secretary completion after ZVend success (DELIVERY confirm).", perm: "approve_meter_activation", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Record id" }], req: `{
  "comment": "ZVend reference verified — activation complete."
}`, res: OP_RESOURCE, note: "On COMPLETED the meter flips to ACTIVE and is linked to the customer." },
    ],
  },
  {
    id: "inspection", title: "Meter Inspection", blurb: "GM schedule → Technical Man video inspection → Secretary → EM → GM → MD. No ZVend call. Rejections requeue for retry.",
    endpoints: [
      baseList("/v1/meter-inspections", "meter_inspection", "inspection"),
      { method: "POST", path: "/v1/meter-inspections/schedule", desc: "GM schedules an inspection. Video duration comes from Super-Admin-configured options — never hard-coded.", perm: "create_meter_inspection", req: `{
  "facility_id": 3,
  "meter_number": "45039813339",
  "scheduled_for": "2026-02-15",
  "instruction": "Verify terminal block seals and display readings; meter reported FAULTY.",
  "duration_seconds": 120
}`, res: OP_RESOURCE, note: "duration_seconds must be one of system_settings.inspection_durations (e.g. 60 / 120 / 180 / 300). One open inspection per meter." },
      ...baseShow("/v1/meter-inspections", "meter_inspection", "inspection"),
      { method: "POST", path: "/v1/meter-inspections/{id}/start", desc: "Technical Man starts: barcode scan (mismatch = hard stop) + GPS capture; client then records video for the configured duration.", perm: "execute_meter_inspection", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Record id" }], req: `{
  "scan_value": "45039813339",
  "gps": { "latitude": 6.492600, "longitude": 3.360500, "accuracy": 14 }
}`, res: OP_RESOURCE, note: "Moves SCHEDULED/REJECTED → IN_PROGRESS and increments retry_count when restarting after a rejection." },
      { method: "POST", path: "/v1/meter-inspections/{id}/submit", desc: "Technical Man uploads the auto-stopped recording + observations → Secretary review. multipart/form-data.", perm: "execute_meter_inspection", params: [
        { name: "video", where: "form", type: "mp4|webm", req: true, desc: "Recording, max 200 MB" },
        { name: "video_duration_seconds", where: "form", type: "integer", req: true, desc: "Measured duration (validated against the rule)" },
        { name: "observations", where: "form", type: "string", req: true, desc: "What the Technical Man verified" },
      ], req: `Content-Type: multipart/form-data

scan_value = 45039813339
gps[latitude] = 6.492600
gps[longitude] = 3.360500
gps[accuracy] = 14
video = inspection-ZADM-INSP-20260213-000012.webm
video_duration_seconds = 120
observations = Seals intact, display matches register, no burn marks.
comment = Video recorded in one take.`, res: OP_RESOURCE },
      ...decisionSet("/v1/meter-inspections", "meter_inspection", "inspection"),
    ],
  },
  {
    id: "tamper", title: "Tamper Code", blurb: "Secretary (manual) or Technical Man (scan) → EM → GM → MD → ZVend → initiator delivery. Codes stored encrypted, masked everywhere.",
    endpoints: [
      baseList("/v1/tamper-code-requests", "tamper_code", "tamper code request"),
      { method: "POST", path: "/v1/tamper-code-requests", desc: "Initiate a tamper code request.", perm: "create_tamper_code", req: `{
  "meter_number": "45039813339",
  "facility_id": 3,
  "via": "scan",
  "reason": "Meter locked out after storm-related surge; customer verified in person."
}`, res: OP_RESOURCE, note: "via is 'manual' (Secretary) or 'scan' (Technical Man). facility_id may be omitted when the meter resolves it from the registry." },
      ...baseShow("/v1/tamper-code-requests", "tamper_code", "tamper code request"),
      { method: "GET", path: "/v1/tamper-code-requests/{id}/code", desc: "Reveal the issued 20-digit code in plaintext. Every reveal is audited.", perm: "view_tamper_code", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Record id" }], req: `GET /api/v1/tamper-code-requests/13/code`, res: `{
  "transaction": "ZADM-TMP-20260213-000013",
  "code": "8841 0293 5716 2048 3759",
  "issued_at": "2026-02-13T10:41:01Z"
}`, note: "422 CODE_NOT_ISSUED until ZVend succeeds. The code never appears in API logs or list payloads." },
      ...decisionSet("/v1/tamper-code-requests", "tamper_code", "tamper code"),
    ],
  },
  {
    id: "clear", title: "Clear Code", blurb: "Identical workflow shape to Tamper Code, issuing the 20-digit clear code from ZVend.",
    endpoints: [
      baseList("/v1/clear-code-requests", "clear_code", "clear code request"),
      { method: "POST", path: "/v1/clear-code-requests", desc: "Initiate a clear code request.", perm: "create_clear_code", req: `{
  "meter_number": "45039812990",
  "facility_id": 1,
  "via": "manual",
  "reason": "Credit lockout after token reversal — customer at office with receipt."
}`, res: OP_RESOURCE },
      ...baseShow("/v1/clear-code-requests", "clear_code", "clear code request"),
      { method: "GET", path: "/v1/clear-code-requests/{id}/code", desc: "Reveal the issued 20-digit clear code. Audited.", perm: "view_clear_code", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Record id" }], req: `GET /api/v1/clear-code-requests/8/code`, res: `{
  "transaction": "ZADM-CLR-20260213-000008",
  "code": "6629 1847 3502 1986 4530",
  "issued_at": "2026-02-13T12:05:33Z"
}` },
      ...decisionSet("/v1/clear-code-requests", "clear_code", "clear code"),
    ],
  },
  {
    id: "approvals", title: "Approvals & Attachments", blurb: "The approval center queue and authorized media delivery.",
    endpoints: [
      { method: "GET", path: "/v1/approvals", desc: "Records whose current step is owned by the caller's role. A delegated GM also sees MD-stage items.", perm: "approvals.view", params: [{ name: "type", where: "query", type: "string", desc: "meter_installation | meter_activation | meter_inspection | tamper_code | clear_code" }], req: `GET /api/v1/approvals?type=meter_installation`, res: `{
  "data": [
    { "operation": "meter_installation", "label": "Meter Installation",
      "id": 12, "txn": "ZADM-INS-20260213-000011",
      "meter_number": "45039813401", "facility": "Ajah Feeder Station",
      "initiator": "Bisi Adeyemi", "current_stage": "Energy Manager Approval",
      "status": "PENDING", "age_hours": 3.5, "delegated": false }
  ],
  "total": 1
}` },
      { method: "GET", path: "/v1/attachments/{id}/download", desc: "Stream a photo/video from private storage. Permission-checked per operation and audited.", perm: "attachments.download", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Attachment id" }], req: `GET /api/v1/attachments/9/download`, res: `200 OK — binary stream
Content-Type: image/jpeg
Content-Disposition: inline; filename="meter-front.jpg"`, note: "Files are never exposed via public URLs." },
    ],
  },
  {
    id: "facilities", title: "Facilities", blurb: "Z Admin's synced copy of the ZVend catalog, plus a manual refresh that pulls from ZVend.",
    endpoints: [
      { method: "GET", path: "/v1/facilities", desc: "Paginated facilities with customer/meter counts.", perm: "facilities.view", params: [{ name: "q", where: "query", type: "string", desc: "Name or code search" }, { name: "per_page", where: "query", type: "integer", desc: "Max 50" }], req: `GET /api/v1/facilities?q=ikoyi`, res: `{
  "data": [
    { "id": 1, "code": "FAC-IKY", "name": "Ikoyi Head Office",
      "address": "Ikoyi Head Office, Ikoyi", "city": "Ikoyi", "state": "Lagos",
      "latitude": 6.4432000, "longitude": 3.4186000, "status": "ACTIVE",
      "zvend_id": "ZV-FAC-IKY", "last_synced_at": "2026-02-13T06:00:00Z",
      "customers_count": 4, "meters_count": 6 }
  ],
  "meta": { "current_page": 1, "per_page": 20, "total": 6, "last_page": 1 }
}` },
      { method: "POST", path: "/v1/facilities/refresh", desc: "Queue a manual ZVend catalog sync (audited).", perm: "facilities.sync", req: `POST /api/v1/facilities/refresh`, res: `202 Accepted
{ "message": "ZVend refresh queued." }` },
      { method: "GET", path: "/v1/facilities/{id}", desc: "Facility detail.", perm: "facilities.view", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Facility id" }], res: `{ "data": { "...FacilityResource" } }` },
      { method: "GET", path: "/v1/facilities/{id}/customers", desc: "Customers registered at the facility, with meter counts.", perm: "facilities.view", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Facility id" }], res: `{
  "data": [
    { "id": 1, "name": "John Joe", "phone": "08031112222",
      "email": "john.joe@mail.com", "status": "ACTIVE", "meters_count": 2 }
  ],
  "meta": { "current_page": 1, "total": 4 }
}` },
      { method: "GET", path: "/v1/facilities/{id}/meters", desc: "Meters at the facility.", perm: "facilities.view", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Facility id" }], res: `{
  "data": [
    { "id": 1, "meter_number": "45039812990", "model": "ZRX-K1 Prepaid",
      "phase": "single", "status": "ACTIVE", "installed_at": "2026-01-20T10:11:00Z",
      "customer": { "id": 1, "name": "John Joe" } }
  ],
  "meta": { "current_page": 1, "total": 6 }
}` },
      { method: "GET", path: "/v1/facilities/{id}/operations", desc: "Recent operations at the facility, grouped by type.", perm: "facilities.view", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Facility id" }], res: `{
  "installations": [ { "id": 12, "txn": "ZADM-INS-20260213-000011", "status": "PENDING", "meter_number": "45039813401", "created_at": "2026-02-13T09:14:02Z" } ],
  "activations": [ "…same shape" ],
  "inspections": [ "…same shape" ]
}` },
    ],
  },
  {
    id: "customers", title: "Customers", blurb: "Catalog customers; vending and funding history are proxied live from ZVend.",
    endpoints: [
      { method: "GET", path: "/v1/customers", desc: "Search customers (names are NOT unique — one customer may hold many meters).", perm: "customers.view", params: [{ name: "q", where: "query", type: "string", desc: "Name or phone search" }], req: `GET /api/v1/customers?q=john`, res: `{
  "data": [
    { "id": 1, "name": "John Joe", "phone": "08031112222",
      "email": "john.joe@mail.com", "status": "ACTIVE",
      "facility": { "id": 1, "name": "Ikoyi Head Office" }, "meters_count": 2 },
    { "id": 2, "name": "John Joe", "phone": "08098887777",
      "email": "jj@business.ng", "status": "ACTIVE",
      "facility": { "id": 2, "name": "Lekki Service Yard" }, "meters_count": 1 }
  ],
  "meta": { "current_page": 1, "total": 2 }
}` },
      { method: "GET", path: "/v1/customers/{id}", desc: "Customer detail with meters.", perm: "customers.view", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Customer id" }], res: `{
  "id": 1, "name": "John Joe", "phone": "08031112222",
  "email": "john.joe@mail.com", "address": "12 Adeola Close, Ikoyi",
  "facility": { "id": 1, "name": "Ikoyi Head Office" },
  "meters": [ { "meter_number": "45039812990", "status": "ACTIVE" } ]
}` },
      { method: "GET", path: "/v1/customers/{id}/vending-history", desc: "Proxied from ZVend (requires the customer's ZVend reference).", perm: "customers.view", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Customer id" }], req: `GET /api/v1/customers/1/vending-history`, res: `{
  "response_code": "00",
  "data": [
    { "token": "••••-••••-8812", "amount": 5000, "units_kwh": 41.2,
      "vend_date": "2026-02-10T18:22:00Z" }
  ]
}`, note: "422 ZVEND_ID_MISSING if the catalog has not synced this customer yet." },
      { method: "GET", path: "/v1/customers/{id}/funding-history", desc: "Wallet funding events, proxied from ZVend.", perm: "customers.view", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Customer id" }], req: `GET /api/v1/customers/1/funding-history`, res: `{
  "response_code": "00",
  "data": [
    { "amount": 20000, "channel": "bank_transfer", "reference": "FND-55231",
      "funded_at": "2026-02-08T09:00:00Z" }
  ]
}` },
    ],
  },
  {
    id: "meters-sync", title: "Meters & Sync", blurb: "The meter registry and the master ZVend synchronization trigger.",
    endpoints: [
      { method: "GET", path: "/v1/meters", desc: "Registry search: number, status, facility, customer.", perm: "meters.view", params: [{ name: "q", where: "query", type: "string", desc: "Meter number search" }, { name: "status", where: "query", type: "string", desc: "IN_STOCK | INSTALLED | ACTIVE | FAULTY | DECOMMISSIONED" }], req: `GET /api/v1/meters?q=4503&status=ACTIVE`, res: `{
  "data": [
    { "id": 1, "meter_number": "45039812990", "model": "ZRX-K1 Prepaid",
      "phase": "single", "status": "ACTIVE",
      "facility": { "id": 1, "code": "FAC-IKY", "name": "Ikoyi Head Office" },
      "customer": { "id": 1, "name": "John Joe" },
      "installed_at": "2026-01-20T10:11:00Z" }
  ],
  "meta": { "current_page": 1, "total": 16 }
}` },
      { method: "POST", path: "/v1/sync/zvend", desc: "Queue the full ZVend catalog pull; sync_logs tracks processed/failed counts.", perm: "facilities.sync", req: `POST /api/v1/sync/zvend`, res: `202 Accepted
{
  "message": "ZVend synchronization queued.",
  "recent": [
    { "id": 4, "entity": "facilities", "status": "success",
      "records_processed": 6, "records_failed": 0,
      "started_at": "2026-02-13T06:00:00Z", "finished_at": "2026-02-13T06:00:04Z" }
  ]
}` },
    ],
  },
  {
    id: "notifications", title: "Notifications", blurb: "In-app notifications addressed to a role and/or user; unread drives the sidebar badges.",
    endpoints: [
      { method: "GET", path: "/v1/notifications", desc: "Notifications for the caller's role(s), newest first.", params: [{ name: "unread", where: "query", type: "boolean", desc: "Only unread" }], req: `GET /api/v1/notifications?unread=1`, res: `{
  "data": [
    { "id": "9f1c4e2a-…", "for_role": "ENERGY_MANAGER", "kind": "approval",
      "title": "Meter Installation ZADM-INS-20260213-000011 awaits your approval.",
      "transaction_id": "ZADM-INS-20260213-000011",
      "operation_type": "meter_installation", "operation_id": 12,
      "read_at": null, "created_at": "2026-02-13T09:14:03Z" }
  ],
  "meta": { "current_page": 1, "total": 5 }
}` },
      { method: "POST", path: "/v1/notifications/{id}/read", desc: "Mark one notification read.", params: [{ name: "id", where: "path", type: "uuid", req: true, desc: "Notification id" }], req: `POST /api/v1/notifications/9f1c4e2a-…/read`, res: `{ "read": true }` },
      { method: "POST", path: "/v1/notifications/read-all", desc: "Mark all of the caller's notifications read.", req: `POST /api/v1/notifications/read-all`, res: `{ "read": 5 }` },
    ],
  },
  {
    id: "reports", title: "Reports", blurb: "Cross-operation dataset powering the reports module and CSV/Excel/PDF export.",
    endpoints: [
      { method: "GET", path: "/v1/reports/operations", desc: "Filtered operations across all five types with a rollup summary.", perm: "reports.view", params: [
        { name: "type", where: "query", type: "string", desc: "One operation type" },
        { name: "facility_id", where: "query", type: "integer", desc: "Facility filter" },
        { name: "status", where: "query", type: "string", desc: "Status filter" },
        { name: "meter_number", where: "query", type: "string", desc: "Partial meter match" },
        { name: "from / to", where: "query", type: "date", desc: "Created-at window" },
      ], req: `GET /api/v1/reports/operations?type=meter_installation&from=2026-02-01&to=2026-02-13`, res: `{
  "data": [
    { "operation": "meter_installation", "txn": "ZADM-INS-20260213-000011",
      "meter_number": "45039813401", "facility": "Ajah Feeder Station",
      "initiator": "Bisi Adeyemi", "status": "PENDING",
      "stage": "ENERGY_MANAGER", "created_at": "2026-02-13T09:14:02Z",
      "updated_at": "2026-02-13T09:14:03Z" }
  ],
  "summary": { "total": 42, "completed": 31, "rejected": 2, "in_flight": 9 }
}` },
    ],
  },
  {
    id: "admin-users", title: "Administration · Users & Roles", blurb: "IT Manager / Super Admin. Roles never hard-coded in controllers — the matrix below is the source of truth.",
    endpoints: [
      { method: "GET", path: "/v1/administration/users", desc: "All users with roles and active flags.", perm: "users.manage", res: `{
  "data": [
    { "id": 3, "name": "Chike Eze", "email": "tech@zarox.com",
      "employee_code": "ZA-003", "is_active": true,
      "roles": [ { "id": 3, "name": "TECHNICAL_MAN", "label": "Technical Man" } ] }
  ]
}` },
      { method: "POST", path: "/v1/administration/users", desc: "Create a user and attach a role (audited).", perm: "users.manage", req: `{
  "name": "Ngozi Kalu",
  "email": "ngozi@zarox.com",
  "password": "Str0ng-Pass!",
  "role_id": 2,
  "employee_code": "ZA-008",
  "phone": "+234 805 555 0101"
}`, res: `201 Created
{ "data": { "id": 8, "name": "Ngozi Kalu", "email": "ngozi@zarox.com", "is_active": true } }` },
      { method: "PUT", path: "/v1/administration/users/{id}", desc: "Update profile fields or role.", perm: "users.manage", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "User id" }], req: `{
  "name": "Ngozi Kalu-Obi",
  "role_id": 4
}`, res: `{ "data": { "id": 8, "name": "Ngozi Kalu-Obi" } }` },
      { method: "PATCH", path: "/v1/administration/users/{id}/toggle-active", desc: "Activate / deactivate. Deactivated users cannot log in; history is preserved.", perm: "users.manage", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "User id" }], req: `PATCH /api/v1/administration/users/8/toggle-active`, res: `{ "data": { "id": 8, "is_active": false } }` },
      { method: "GET", path: "/v1/administration/roles", desc: "Roles with their full permission sets.", perm: "roles.manage", res: `{
  "data": [
    { "id": 2, "name": "SECRETARY", "label": "Secretary", "is_system": true,
      "permissions": [ { "id": 1, "name": "view_meter_installation", "group": "meter_installation" }, "…" ] }
  ]
}` },
      { method: "PUT", path: "/v1/administration/roles/{id}/permissions", desc: "Replace a role's permission set (audited; SYSTEM roles editable by Super Admin only).", perm: "roles.manage", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Role id" }], req: `{
  "permission_ids": [ 1, 2, 3, 7, 12, 41 ]
}`, res: `{ "role": "SECRETARY", "permissions_count": 6 }` },
    ],
  },
  {
    id: "admin-settings", title: "Administration · Settings & API Configuration", blurb: "Field rules and ZVend connection. Secrets are encrypted at rest and masked on read.",
    endpoints: [
      { method: "GET", path: "/v1/administration/settings", desc: "Runtime system settings.", perm: "settings.manage", res: `{
  "data": [
    { "key": "max_gps_accuracy_m", "value": 50, "group": "gps",
      "label": "Maximum GPS accuracy (m)", "updated_at": "2026-02-01T08:00:00Z" },
    { "key": "inspection_durations", "value": [ 60, 120, 180, 300 ],
      "group": "inspection", "label": "Allowed inspection video durations (seconds)" }
  ]
}` },
      { method: "PUT", path: "/v1/administration/settings/{key}", desc: "Update a whitelisted setting (audited).", perm: "settings.manage", params: [{ name: "key", where: "path", type: "string", req: true, desc: "max_gps_accuracy_m | inspection_durations | default_inspection_duration" }], req: `{ "value": 30 }`, res: `{ "key": "max_gps_accuracy_m", "value": 30 }` },
      { method: "GET", path: "/v1/administration/api-settings", desc: "ZVend connection settings; the token is returned masked.", perm: "api_settings.manage", res: `{
  "data": [
    { "key": "zvend_base_url", "value": "https://api.zvend.example.com", "is_secret": false },
    { "key": "zvend_api_token", "value": "••••••••••••••••", "is_secret": true },
    { "key": "zvend_timeout", "value": 20, "is_secret": false },
    { "key": "zvend_retry_count", "value": 3, "is_secret": false }
  ]
}` },
      { method: "PUT", path: "/v1/administration/api-settings/{key}", desc: "Update a ZVend setting (encrypted for secrets, audited).", perm: "api_settings.manage", params: [{ name: "key", where: "path", type: "string", req: true, desc: "zvend_base_url | zvend_api_token | zvend_timeout | zvend_retry_count" }], req: `{ "value": "https://api.zvend.zarox.com" }`, res: `{ "key": "zvend_base_url", "updated": true }` },
    ],
  },
  {
    id: "admin-delegations", title: "Administration · MD Delegations", blurb: "MD → GM only, date-windowed, auto-expiring; every delegated decision is stamped.",
    endpoints: [
      { method: "GET", path: "/v1/administration/delegations", desc: "All delegations with parties and status.", perm: "delegations.manage", res: `{
  "data": [
    { "id": 2, "delegator": { "id": 6, "name": "Zainab Farouk" },
      "delegate": { "id": 5, "name": "Ibrahim Musa" },
      "starts_on": "2026-02-10", "ends_on": "2026-02-17",
      "reason": "MD travelling — approvals continue via GM.",
      "status": "active", "revoked_at": null }
  ]
}` },
      { method: "POST", path: "/v1/administration/delegations", desc: "Create a delegation (audited).", perm: "delegations.manage", req: `{
  "delegator_id": 6,
  "delegate_id": 5,
  "starts_on": "2026-02-10",
  "ends_on": "2026-02-17",
  "reason": "MD travelling — approvals continue via GM."
}`, res: `201 Created
{ "id": 3, "status": "active", "starts_on": "2026-02-10", "ends_on": "2026-02-17" }`, note: "422 unless delegator is the MD and delegate is a GM. Expiry is enforced on every check — no cron required." },
      { method: "POST", path: "/v1/administration/delegations/{id}/revoke", desc: "Revoke early (audited).", perm: "delegations.manage", params: [{ name: "id", where: "path", type: "integer", req: true, desc: "Delegation id" }], req: `POST /api/v1/administration/delegations/3/revoke`, res: `{ "id": 3, "status": "revoked", "revoked_at": "2026-02-13T15:30:00Z" }` },
    ],
  },
  {
    id: "admin-logs", title: "Administration · Logs", blurb: "Read-only. Audit records are append-only and immutable; API logs are sanitized — secrets never appear.",
    endpoints: [
      { method: "GET", path: "/v1/administration/api-logs", desc: "ZVend request journal with response codes and latencies.", perm: "api_logs.view", params: [
        { name: "status", where: "query", type: "string", desc: "pending | success | failed | timeout" },
        { name: "endpoint", where: "query", type: "string", desc: "Partial endpoint match" },
        { name: "transaction_id", where: "query", type: "string", desc: "Exact txn" },
        { name: "from / to", where: "query", type: "date", desc: "Window" },
      ], req: `GET /api/v1/administration/api-logs?status=failed&from=2026-02-01`, res: `{
  "data": [
    { "id": 58, "user_id": 6, "operation_type": "meter_installation",
      "transaction_id": "ZADM-INS-20260213-000011",
      "method": "POST", "endpoint": "/v1/meters/install",
      "idempotency_key": "zvend:ZADM-INS-20260213-000011:1",
      "request_payload": { "meter_number": "45039813401", "facility": "FAC-AJA" },
      "status": "success", "duration_ms": 412,
      "response": { "response_code": "00",
        "response_body": { "response_code": "00", "reference": "ZV-REF-88213" } } }
  ],
  "meta": { "current_page": 1, "total": 37 }
}` },
      { method: "GET", path: "/v1/administration/audit-logs", desc: "Every login, decision, scan, GPS event, reveal and settings change.", perm: "audit_logs.view", params: [
        { name: "action", where: "query", type: "string", desc: "Partial action match (approve, code_reveal, …)" },
        { name: "user_id", where: "query", type: "integer", desc: "Actor filter" },
        { name: "transaction_id", where: "query", type: "string", desc: "Exact txn" },
      ], req: `GET /api/v1/administration/audit-logs?action=code_reveal`, res: `{
  "data": [
    { "id": 301, "user_id": 2, "user_name": "Bisi Adeyemi",
      "action": "tamper_code_reveal", "auditable_type": "tamper_code",
      "auditable_id": 13, "transaction_id": "ZADM-TMP-20260213-000013",
      "detail": "ZADM-TMP-20260213-000013 — tamper code revealed.",
      "ip_address": "10.4.2.11", "created_at": "2026-02-13T10:45:12Z" }
  ],
  "meta": { "current_page": 1, "total": 218 }
}` },
    ],
  },
  {
    id: "zvend", title: "ZVend Wire Contract", external: true, blurb: "The external vending platform. Z Admin calls these automatically (queued, idempotent, after MD approval) via ZVendApiService — clients never call ZVend directly.",
    endpoints: [
      { method: "POST", path: "{ZVEND_BASE_URL}/v1/meters/install", desc: "Register + issue codes for a new meter. Called after MD approval of an installation.", params: [{ name: "Idempotency-Key", where: "header", type: "string", req: true, desc: "zvend:{txn}:{attempt}" }], req: `{
  "meter_number": "45039813401",
  "facility": "FAC-AJA"
}`, res: `{
  "response_code": "00",
  "reference": "ZV-REF-88213",
  "tamper_code": "88410293571620483759",
  "clear_code": "66291847350219864530"
}`, note: "20-digit codes are stored encrypted and never logged." },
      { method: "POST", path: "{ZVEND_BASE_URL}/v1/meters/activate", desc: "Energize a meter with customer + GPS. Called after MD approval of an activation.", req: `{
  "facility": "FAC-IKY",
  "meter_number": "45039813117",
  "customer_name": "John Joe",
  "customer_phone": "08031112222",
  "customer_email": "john.joe@mail.com",
  "customer_address": "12 Adeola Close, Ikoyi",
  "latitude": 6.443211,
  "longitude": 3.418600
}`, res: `{
  "response_code": "00",
  "reference": "ZV-ACT-55120",
  "status": "activated"
}` },
      { method: "POST", path: "{ZVEND_BASE_URL}/v1/meters/tamper-code", desc: "Issue a 20-digit tamper code for a meter.", req: `{
  "meter_number": "45039813339"
}`, res: `{
  "response_code": "00",
  "reference": "ZV-TMP-90411",
  "tamper_code": "88410293571620483759"
}` },
      { method: "POST", path: "{ZVEND_BASE_URL}/v1/meters/clear-code", desc: "Issue a 20-digit clear code for a meter.", req: `{
  "meter_number": "45039812990"
}`, res: `{
  "response_code": "00",
  "reference": "ZV-CLR-30977",
  "clear_code": "66291847350219864530"
}` },
      { method: "GET", path: "{ZVEND_BASE_URL}/v1/facilities", desc: "Catalog source used by the sync job.", req: `GET {ZVEND_BASE_URL}/v1/facilities`, res: `{
  "response_code": "00",
  "data": [
    { "id": "ZV-FAC-IKY", "code": "FAC-IKY", "name": "Ikoyi Head Office",
      "city": "Ikoyi", "state": "Lagos", "latitude": 6.4432, "longitude": 3.4186,
      "status": "ACTIVE" }
  ]
}` },
      { method: "GET", path: "{ZVEND_BASE_URL}/v1/facilities/{facility}/customers", desc: "Customers at a ZVend facility (path param = ZVend facility id).", params: [{ name: "facility", where: "path", type: "string", req: true, desc: "ZVend facility id" }], req: `GET {ZVEND_BASE_URL}/v1/facilities/ZV-FAC-IKY/customers`, res: `{
  "response_code": "00",
  "data": [ { "id": "ZV-CUS-114", "name": "John Joe", "phone": "08031112222" } ]
}` },
      { method: "GET", path: "{ZVEND_BASE_URL}/v1/facilities/{facility}/meters", desc: "Meters at a ZVend facility.", params: [{ name: "facility", where: "path", type: "string", req: true, desc: "ZVend facility id" }], req: `GET {ZVEND_BASE_URL}/v1/facilities/ZV-FAC-IKY/meters`, res: `{
  "response_code": "00",
  "data": [ { "meter_number": "45039812990", "status": "ACTIVE", "customer_id": "ZV-CUS-114" } ]
}` },
      { method: "GET", path: "{ZVEND_BASE_URL}/v1/customers/{customer}/vending-history", desc: "Token purchase history.", params: [{ name: "customer", where: "path", type: "string", req: true, desc: "ZVend customer id" }], req: `GET {ZVEND_BASE_URL}/v1/customers/ZV-CUS-114/vending-history`, res: `{
  "response_code": "00",
  "data": [ { "token": "••••-••••-8812", "amount": 5000, "units_kwh": 41.2, "vend_date": "2026-02-10T18:22:00Z" } ]
}` },
      { method: "GET", path: "{ZVEND_BASE_URL}/v1/customers/{customer}/funding-history", desc: "Wallet funding history.", params: [{ name: "customer", where: "path", type: "string", req: true, desc: "ZVend customer id" }], req: `GET {ZVEND_BASE_URL}/v1/customers/ZV-CUS-114/funding-history`, res: `{
  "response_code": "00",
  "data": [ { "amount": 20000, "channel": "bank_transfer", "reference": "FND-55231", "funded_at": "2026-02-08T09:00:00Z" } ]
}` },
      { method: "POST", path: "{ZVEND_BASE_URL}/v1/tokens/vend", desc: "Vend a token (available on the service; not part of the five core workflows).", req: `{
  "meter_number": "45039812990",
  "amount": 5000
}`, res: `{
  "response_code": "00",
  "token": "1234-5678-9012-3456-7890",
  "units_kwh": 41.2
}` },
    ],
  },
  {
    id: "errors", title: "Common Error Envelopes", blurb: "Deterministic machine-readable errors. Workflow rule violations are 422 with a stable code — never 500.",
    endpoints: [
      { method: "POST", path: "401 · Unauthenticated", desc: "Missing or revoked bearer token.", res: ERR_401 },
      { method: "POST", path: "403 · Forbidden", desc: "The role/permission matrix denies the action (e.g. Technical Man calling an approve endpoint).", res: ERR_403 },
      { method: "POST", path: "422 · Validation", desc: "Form Request failure — duplicate meter, non-numeric meter, missing comment…", res: ERR_422_VALIDATION },
      { method: "POST", path: "422 · Workflow", desc: "Legal permission, illegal transition: wrong stage, terminal record, GPS ceiling, barcode mismatch.", res: ERR_422_WORKFLOW, note: "Stable codes: WORKFLOW_WRONG_STAGE, WORKFLOW_ILLEGAL_DECISION, WORKFLOW_TERMINAL, METER_NUMBER_MISMATCH, GPS_ACCURACY_EXCEEDED, INSPECTION_DURATION_INVALID, CODE_NOT_ISSUED…" },
      { method: "POST", path: "200 · Idempotent replay", desc: "A repeated decision with a consumed idempotency key returns the original outcome — no duplicate effect.", res: REPLAY_RES },
      { method: "POST", path: "502 · ZVend failure", desc: "ZVend refused, timed out or was unreachable. Record lands on ZVEND_FAILED with a permission-gated retry.", res: ERR_502 },
    ],
  },
];

// ============================================================
// Rendering
// ============================================================
const METHOD_META: Record<string, { bg: string; text: string; border: string }> = {
  GET: { bg: "bg-oksoft", text: "text-ok", border: "border-l-ok" },
  POST: { bg: "bg-voltsoft", text: "text-volt2", border: "border-l-volt" },
  PUT: { bg: "bg-infosoft", text: "text-info", border: "border-l-info" },
  PATCH: { bg: "bg-tealsoft", text: "text-teal", border: "border-l-teal" },
};

function JsonBlock({ code, onCopy, copied }: { code: string; onCopy: () => void; copied: boolean }) {
  const isUrl = /^(GET|POST|PUT|PATCH|200|Content-Type)/.test(code);
  return (
    <div className="group relative flex-1 overflow-hidden rounded-lg bg-side">
      <pre className="max-h-80 overflow-auto px-3.5 py-3 font-mono text-[10.8px] leading-[1.65] text-[#c9d4cc]">
        {isUrl ? <span className="text-[#9ecfae]">{code}</span> : highlight(code)}
      </pre>
      <button onClick={onCopy} aria-label="Copy JSON"
        className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border transition-all ${copied ? "border-[#3f5c4a] bg-[#1e2b23] text-[#9ecfae]" : "border-[#2a3a30] bg-[#16201a] text-[#7d8c82] opacity-0 hover:text-[#e8b25c] group-hover:opacity-100"}`}>
        <Icon name={copied ? "check" : "copy"} size={12} />
      </button>
    </div>
  );
}

function highlight(code: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) parts.push(<span key={k++}>{code.slice(last, m.index)}</span>);
    if (m[1] !== undefined) {
      const isKey = !!m[2];
      parts.push(<span key={k++} className={isKey ? "text-[#e8b25c]" : "text-[#9ecfae]"}>{m[1]}</span>);
      if (m[2]) parts.push(<span key={k++}>{m[2]}</span>);
    } else if (m[3] !== undefined) {
      parts.push(<span key={k++} className="text-[#d98d7e]">{m[3]}</span>);
    } else if (m[4] !== undefined) {
      parts.push(<span key={k++} className="text-[#8fb8d8]">{m[4]}</span>);
    }
    last = re.lastIndex;
  }
  if (last < code.length) parts.push(<span key={k++}>{code.slice(last)}</span>);
  return parts;
}

function EndpointCard({ ep, onCopy, copiedKey }: { ep: ApiEndpoint; onCopy: (text: string, key: string) => void; copiedKey: string | null }) {
  const mm = METHOD_META[ep.method];
  const pathParts = ep.path.split(/(\{[^}]+\})/g);
  return (
    <div className={`anim-rise rounded-xl border border-line border-l-4 ${mm.border} bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(26,35,30,0.08)]`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 font-mono text-[10.5px] font-extrabold ${mm.bg} ${mm.text}`}>{ep.method}</span>
        <code className="font-mono text-[12.5px] font-bold tracking-tight text-ink">
          {pathParts.map((p, i) => p.startsWith("{") && p.endsWith("}")
            ? <span key={i} className="rounded bg-paper px-1 text-volt2">{p}</span>
            : <span key={i}>{p}</span>)}
        </code>
        {ep.perm && <span className="ml-auto hidden items-center gap-1 rounded-md border border-line bg-paper px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-mute sm:flex"><Icon name="lock" size={10} />{ep.perm}</span>}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink2">{ep.desc}</p>

      {ep.params && ep.params.length > 0 && (
        <div className="mt-2.5 overflow-hidden rounded-lg border border-line/80">
          <table className="w-full text-left">
            <tbody>
              {ep.params.map((p, i) => (
                <tr key={p.name} className={i % 2 ? "bg-paper/60" : ""}>
                  <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[10.5px] font-bold text-ink">{p.name}</td>
                  <td className="whitespace-nowrap px-2.5 py-1.5">
                    <span className="rounded bg-ink/6 px-1.5 py-px font-mono text-[9px] font-extrabold uppercase tracking-wider text-ink2">{p.where}</span>
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[10px] text-info">{p.type}</td>
                  {p.req && <td className="px-1 py-1.5 font-mono text-[9px] font-extrabold text-danger">req</td>}
                  <td className="px-2.5 py-1.5 text-[10.5px] text-mute">{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(ep.req || ep.res) && (
        <div className="mt-3 flex flex-col gap-2.5 lg:flex-row">
          {ep.req && (
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-[9px] font-extrabold tracking-[0.16em] text-mute">REQUEST</span>
              <JsonBlock code={ep.req} copied={copiedKey === ep.path + ":req"} onCopy={() => onCopy(ep.req!, ep.path + ":req")} />
            </div>
          )}
          {ep.res && (
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-[9px] font-extrabold tracking-[0.16em] text-mute">RESPONSE</span>
              <JsonBlock code={ep.res} copied={copiedKey === ep.path + ":res"} onCopy={() => onCopy(ep.res!, ep.path + ":res")} />
            </div>
          )}
        </div>
      )}
      {ep.note && (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-voltsoft/70 px-2.5 py-2 text-[11px] font-semibold leading-relaxed text-volt2">
          <Icon name="info" size={13} className="mt-px shrink-0" />{ep.note}
        </p>
      )}
    </div>
  );
}

export default function ApiReferencePage() {
  const { toast } = useStore();
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("ALL");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copiedTimer = useRef<number | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: 0, GET: 0, POST: 0, PUT: 0, PATCH: 0 };
    GROUPS.forEach(g => g.endpoints.forEach(e => { c.ALL++; c[e.method]++; }));
    return c;
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return GROUPS.map(g => ({
      ...g,
      endpoints: g.endpoints.filter(e =>
        (method === "ALL" || e.method === method) &&
        (!s || e.path.toLowerCase().includes(s) || e.desc.toLowerCase().includes(s) || g.title.toLowerCase().includes(s) || (e.perm ?? "").toLowerCase().includes(s))
      ),
    })).filter(g => g.endpoints.length > 0);
  }, [q, method]);

  const shownCount = filtered.reduce((a, g) => a + g.endpoints.length, 0);

  const copy = (text: string, key: string) => {
    const done = () => {
      setCopiedKey(key);
      toast("Copied to clipboard", "ok");
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopiedKey(null), 1400);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(done);
    else {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
      done();
    }
  };

  const jump = (id: string) => document.getElementById(`grp-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="bg-dots min-h-full">
      <div className="mx-auto max-w-[1280px] pb-10">
        <SectionHead
          title="API Reference"
          sub={`${counts.ALL} endpoints · base /api/v1 · Z Admin REST + ZVend wire contract`}
          right={
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 font-mono text-[10.5px] font-bold text-ink2"><span className="okdot h-1.5 w-1.5 rounded-full bg-ok" />v1 · live</span>
              <span className="hidden items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 font-mono text-[10.5px] font-bold text-ink2 sm:flex"><Icon name="key" size={12} className="text-volt2" />Bearer auth</span>
            </div>
          }
        />
        <p className="-mt-3 mb-4 flex items-start gap-2 rounded-lg border border-line bg-card px-3 py-2.5 text-[11.5px] font-semibold text-mute">
          <Icon name="info" size={14} className="mt-px shrink-0 text-info" />{AUTH_NOTE}
        </p>

        {/* sticky toolbar */}
        <div className="sticky top-0 z-20 -mx-1 mb-5 rounded-xl border border-line bg-paper/95 px-3 py-2.5 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by path, description or permission…"
                className="w-full rounded-lg border border-line bg-card py-2 pl-8.5 pr-3 text-[12.5px] font-semibold outline-none transition-all placeholder:font-normal placeholder:text-mute focus:border-ink/50 focus:ring-2 focus:ring-volt/30" />
            </div>
            <div className="flex gap-1">
              {["ALL", "GET", "POST", "PUT", "PATCH"].map(mv => (
                <button key={mv} onClick={() => setMethod(mv)}
                  className={`rounded-lg border px-2.5 py-1.5 font-mono text-[10.5px] font-extrabold transition-all ${method === mv ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink2 hover:border-ink/40"}`}>
                  {mv} <span className={method === mv ? "text-volt" : "text-mute"}>{counts[mv]}</span>
                </button>
              ))}
            </div>
            <span className="hidden font-mono text-[10.5px] font-bold text-mute md:block">{shownCount} shown</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          {/* group rail */}
          <aside className="hidden lg:block">
            <div className="sticky top-[76px] max-h-[calc(100vh-100px)] space-y-0.5 overflow-y-auto pr-1">
              {GROUPS.map(g => (
                <button key={g.id} onClick={() => jump(g.id)}
                  className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-card">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${g.external ? "bg-info" : "bg-volt"} opacity-40 transition-opacity group-hover:opacity-100`} />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-ink2 group-hover:text-ink">{g.title}</span>
                  <span className="rounded bg-ink/6 px-1.5 font-mono text-[9.5px] font-extrabold text-mute tnum">{g.endpoints.length}</span>
                </button>
              ))}
            </div>
          </aside>

          {/* endpoint groups */}
          <div className="min-w-0 space-y-8">
            {filtered.length === 0 && (
              <div className="rounded-xl border border-line bg-card p-10 text-center anim-rise">
                <Icon name="search" size={26} className="mx-auto text-mute" />
                <p className="mt-2 font-display text-[15px] font-bold">No endpoints match</p>
                <p className="mt-1 text-[12px] text-mute">Try “install”, “approve”, “code” or clear the method filter.</p>
                <Btn variant="outline" className="mt-4" onClick={() => { setQ(""); setMethod("ALL"); }}>Clear filters</Btn>
              </div>
            )}
            {filtered.map(g => (
              <section key={g.id} id={`grp-${g.id}`} className="scroll-mt-24">
                <div className="mb-3 flex flex-wrap items-center gap-2.5">
                  <h2 className="font-display text-[17px] font-bold tracking-tight">{g.title}</h2>
                  {g.external && <span className="flex items-center gap-1 rounded-md bg-infosoft px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-wider text-info"><Icon name="plug" size={10} />EXTERNAL</span>}
                  <span className="font-mono text-[10.5px] font-bold text-mute tnum">{g.endpoints.length} endpoints</span>
                </div>
                <p className="-mt-1.5 mb-3 max-w-3xl text-[12px] leading-relaxed text-mute">{g.blurb}</p>
                <div className="space-y-3.5">
                  {g.endpoints.map((ep, i) => (
                    <Fragment key={ep.method + ep.path + i}>
                      <EndpointCard ep={ep} onCopy={copy} copiedKey={copiedKey} />
                    </Fragment>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
