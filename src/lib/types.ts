// ============================================================
// Z ADMIN — Domain model, workflow state machine, RBAC
// ============================================================

export type Role =
  | "SUPER_ADMIN" | "SECRETARY" | "TECHNICAL_MAN" | "ENERGY_MANAGER"
  | "GENERAL_MANAGER" | "MD" | "IT_MANAGER";

export type OpType = "installation" | "activation" | "inspection" | "tamper" | "clear";

export type OpStatus =
  | "PENDING_ENERGY_MANAGER" | "PENDING_GM" | "PENDING_MD" | "PENDING_SECRETARY"
  | "WAITING_ZVEND" | "ZVEND_SUCCESS" | "ZVEND_FAILED"
  | "ASSIGNED" | "IN_PROGRESS" | "SCHEDULED" | "SUBMITTED"
  | "COMPLETED" | "REJECTED" | "RETURNED" | "CANCELLED";

export type Tone = "amber" | "green" | "red" | "blue" | "gray" | "teal" | "orange" | "ink";

export interface User {
  id: string; name: string; role: Role; email: string;
  active: boolean; createdAt: number; lastLogin?: number;
}

export interface Facility {
  id: string; code: string; name: string; region: string; address: string;
  lat: number; lng: number; feeder: string; status: "ACTIVE" | "INACTIVE";
  metersCount: number; customersCount: number; lastSyncedAt?: number;
}

export interface Meter {
  number: string; facilityId: string; model: string; phase: "1Φ" | "3Φ";
  status: "IN_STOCK" | "INSTALLED" | "ACTIVE" | "FAULTY";
  customerName?: string; installedAt?: number; activatedAt?: number;
}

export interface CustomerInfo { name: string; phone: string; email: string; address: string; }

export interface Customer extends CustomerInfo {
  id: string; facilityId: string; meters: string[]; since: number;
}

export type Decision =
  | "SUBMIT" | "APPROVE" | "REJECT" | "RETURN" | "RELEASE" | "START"
  | "COMPLETE" | "RETRY" | "SCHEDULE" | "RESUBMIT" | "CONFIRM" | "SYSTEM";

export interface WorkflowComment {
  id: string; userId: string; userName: string; role: Role | "SYSTEM";
  stage: string; decision: Decision; text: string; at: number; delegated?: boolean;
}

export interface PhotoRec {
  id: string; label: string; dataUrl: string; at: number; lat?: number; lng?: number;
}

export interface GpsRec {
  lat: number; lng: number; accuracy: number; at: number;
  source: "device" | "simulated"; accepted: boolean;
}

export interface ScanRec { value: string; matched: boolean; at: number; }

export interface ZvendCall {
  idemKey: string; status: "pending" | "success" | "failed";
  requestedAt: number; respondedAt?: number; responseCode?: string;
  reference?: string; tamperCode?: string; clearCode?: string; error?: string; attempt: number;
}

export interface Op {
  id: string; txn: string; type: OpType; status: OpStatus; stageIdx: number;
  meterNumber: string; facilityId: string;
  initiatorId: string; initiatorName: string; initiatorRole: Role;
  createdAt: number; updatedAt: number;
  comments: WorkflowComment[];
  customer?: CustomerInfo;
  instruction?: string; technicalComment?: string; observations?: string;
  gps?: GpsRec; gpsFailed?: boolean;
  photos: PhotoRec[];
  video?: { durationSec: number; at: number; simulated: boolean; sizeKB: number };
  scan?: ScanRec;
  scheduledFor?: number; durationSec?: number; retryCount?: number;
  zvend?: ZvendCall;
  pendingSync?: boolean;
  returnedFrom?: string;
}

export interface AuditEntry {
  id: string; at: number; userId: string; userName: string; role: Role | "SYSTEM";
  action: string; detail: string; txn?: string;
}

export interface ApiLog {
  id: string; at: number; userName: string; operation: string; method: string;
  endpoint: string; txn?: string; status: "success" | "failed" | "pending";
  responseCode: string; durationMs: number;
}

export interface SyncLog {
  id: string; at: number; operation: string; status: "success" | "failed";
  processed: number; failed: number; error?: string; by: string;
}

export interface Notif {
  id: string; at: number; forRole: Role | "ALL"; forUser?: string;
  text: string; read: boolean; txn?: string; opId?: string; kind: "approval" | "zvend" | "field" | "system";
}

export interface Delegation {
  id: string; mdId: string; mdName: string; gmId: string; gmName: string;
  start: number; end: number; reason: string; status: "ACTIVE" | "EXPIRED" | "REVOKED";
}

export interface ZvendConfig {
  baseUrl: string; token: string; timeoutSec: number; retryCount: number;
  endpoints: Record<string, string>;
}

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  charset: string;
  collation: string;
  prefix: string;
  ssl: boolean;
  connected?: boolean;
  testedAt?: number;
  serverVersion?: string;
  schemaInstalled?: boolean;
  migratedAt?: number;
  seededAt?: number;
}

export interface Settings {
  inspectionDurations: number[]; // seconds
  defaultDurationSec: number;
  maxGpsAccuracyM: number;
  allowedDistanceM: number;
  zvend: ZvendConfig;
  db?: DbConfig;
}

export interface AppState {
  v: number;
  currentUserId: string | null;
  users: User[];
  permissionMatrix: Record<Role, string[]>;
  operations: Op[];
  facilities: Facility[];
  customers: Customer[];
  meters: Meter[];
  notifications: Notif[];
  audit: AuditEntry[];
  apiLogs: ApiLog[];
  syncLogs: SyncLog[];
  delegations: Delegation[];
  settings: Settings;
  seq: Record<OpType, number>;
  idemKeys: string[];
  lastFacilitySync?: number;
}

// ------------------------------------------------------------
// Labels & metadata
// ------------------------------------------------------------

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin", SECRETARY: "Secretary", TECHNICAL_MAN: "Technical Man",
  ENERGY_MANAGER: "Energy Manager", GENERAL_MANAGER: "General Manager", MD: "Managing Director",
  IT_MANAGER: "IT Manager",
};

export const OPS: Record<OpType, { label: string; short: string; code: string; path: string; icon: string; blurb: string }> = {
  installation: { label: "Meter Installation", short: "Installation", code: "INS", path: "meter-installation", icon: "wrench", blurb: "Register new meters and push installation to ZVend after MD approval." },
  activation:   { label: "Meter Activation",   short: "Activation",   code: "ACT", path: "meter-activation", icon: "power", blurb: "Field activation capture by Technical Man, approved up to MD, then ZVend." },
  inspection:   { label: "Meter Inspection",   short: "Inspection",   code: "INSP", path: "meter-inspection", icon: "clipboard", blurb: "GM-scheduled inspections with barcode-verified video evidence. No ZVend call." },
  tamper:       { label: "Tamper Code",        short: "Tamper",       code: "TMP", path: "tamper-code", icon: "shield", blurb: "Request 20-digit tamper codes from ZVend after MD approval." },
  clear:        { label: "Clear Code",         short: "Clear",        code: "CLR", path: "clear-code", icon: "key", blurb: "Request 20-digit clear codes from ZVend after MD approval." },
};

export const OP_ORDER: OpType[] = ["installation", "activation", "inspection", "tamper", "clear"];

export const STATUS_META: Record<OpStatus, { label: string; tone: Tone }> = {
  PENDING_ENERGY_MANAGER: { label: "Pending Energy Manager", tone: "amber" },
  PENDING_GM:             { label: "Pending GM", tone: "amber" },
  PENDING_MD:             { label: "Pending MD", tone: "amber" },
  PENDING_SECRETARY:      { label: "Pending Secretary", tone: "amber" },
  WAITING_ZVEND:          { label: "Waiting ZVend", tone: "blue" },
  ZVEND_SUCCESS:          { label: "ZVend Success", tone: "teal" },
  ZVEND_FAILED:           { label: "ZVend Failed", tone: "red" },
  ASSIGNED:               { label: "Assigned to Technical", tone: "teal" },
  IN_PROGRESS:            { label: "In Progress", tone: "orange" },
  SCHEDULED:              { label: "Scheduled", tone: "blue" },
  SUBMITTED:              { label: "Submitted", tone: "blue" },
  COMPLETED:              { label: "Completed", tone: "green" },
  REJECTED:               { label: "Rejected", tone: "red" },
  RETURNED:               { label: "Returned", tone: "orange" },
  CANCELLED:              { label: "Cancelled", tone: "gray" },
};

export const TERMINAL: OpStatus[] = ["COMPLETED", "REJECTED", "CANCELLED"];

export interface Stage { key: string; label: string; role: Role | "ZVEND"; wait: OpStatus; }

export const STAGES: Record<OpType, Stage[]> = {
  installation: [
    { key: "EM", label: "Energy Manager Review", role: "ENERGY_MANAGER", wait: "PENDING_ENERGY_MANAGER" },
    { key: "GM", label: "General Manager Review", role: "GENERAL_MANAGER", wait: "PENDING_GM" },
    { key: "MD", label: "MD Final Approval", role: "MD", wait: "PENDING_MD" },
    { key: "ZVEND", label: "ZVend Registration", role: "ZVEND", wait: "WAITING_ZVEND" },
    { key: "RELEASE", label: "Secretary Release", role: "SECRETARY", wait: "ZVEND_SUCCESS" },
    { key: "FIELD", label: "Technical Execution", role: "TECHNICAL_MAN", wait: "ASSIGNED" },
  ],
  activation: [
    { key: "FIELD", label: "Field Activation Capture", role: "TECHNICAL_MAN", wait: "IN_PROGRESS" },
    { key: "SEC", label: "Secretary Review", role: "SECRETARY", wait: "PENDING_SECRETARY" },
    { key: "EM", label: "Energy Manager Review", role: "ENERGY_MANAGER", wait: "PENDING_ENERGY_MANAGER" },
    { key: "GM", label: "General Manager Review", role: "GENERAL_MANAGER", wait: "PENDING_GM" },
    { key: "MD", label: "MD Final Approval", role: "MD", wait: "PENDING_MD" },
    { key: "ZVEND", label: "ZVend Activation", role: "ZVEND", wait: "WAITING_ZVEND" },
    { key: "CONFIRM", label: "Secretary Completion", role: "SECRETARY", wait: "ZVEND_SUCCESS" },
  ],
  inspection: [
    { key: "SCHED", label: "GM Scheduling", role: "GENERAL_MANAGER", wait: "SCHEDULED" },
    { key: "FIELD", label: "Field Inspection", role: "TECHNICAL_MAN", wait: "IN_PROGRESS" },
    { key: "SEC", label: "Secretary Review", role: "SECRETARY", wait: "PENDING_SECRETARY" },
    { key: "EM", label: "Energy Manager Review", role: "ENERGY_MANAGER", wait: "PENDING_ENERGY_MANAGER" },
    { key: "GM", label: "GM Review", role: "GENERAL_MANAGER", wait: "PENDING_GM" },
    { key: "MD", label: "MD Final Approval", role: "MD", wait: "PENDING_MD" },
  ],
  tamper: [
    { key: "EM", label: "Energy Manager Review", role: "ENERGY_MANAGER", wait: "PENDING_ENERGY_MANAGER" },
    { key: "GM", label: "General Manager Review", role: "GENERAL_MANAGER", wait: "PENDING_GM" },
    { key: "MD", label: "MD Final Approval", role: "MD", wait: "PENDING_MD" },
    { key: "ZVEND", label: "ZVend Code Generation", role: "ZVEND", wait: "WAITING_ZVEND" },
    { key: "DELIVER", label: "Code Delivery Confirmation", role: "SECRETARY", wait: "ZVEND_SUCCESS" },
  ],
  clear: [
    { key: "EM", label: "Energy Manager Review", role: "ENERGY_MANAGER", wait: "PENDING_ENERGY_MANAGER" },
    { key: "GM", label: "General Manager Review", role: "GENERAL_MANAGER", wait: "PENDING_GM" },
    { key: "MD", label: "MD Final Approval", role: "MD", wait: "PENDING_MD" },
    { key: "ZVEND", label: "ZVend Code Generation", role: "ZVEND", wait: "WAITING_ZVEND" },
    { key: "DELIVER", label: "Code Delivery Confirmation", role: "SECRETARY", wait: "ZVEND_SUCCESS" },
  ],
};

// ------------------------------------------------------------
// RBAC
// ------------------------------------------------------------

export const PERMS = [
  "installation.view", "installation.create", "installation.approve", "installation.execute",
  "activation.view", "activation.create", "activation.approve", "activation.execute",
  "inspection.view", "inspection.create", "inspection.approve", "inspection.execute",
  "tamper.view", "tamper.create", "tamper.approve", "tamper.execute",
  "clear.view", "clear.create", "clear.approve", "clear.execute",
  "approvals.view", "facilities.view", "facilities.sync", "customers.view", "meters.view",
  "reports.view", "notifications.view", "history.view",
  "admin.users", "admin.roles", "admin.api", "admin.apilogs", "admin.audit", "admin.settings", "admin.delegation", "admin.database",
] as const;

export type Perm = (typeof PERMS)[number];

const viewAll = [
  "installation.view", "activation.view", "inspection.view", "tamper.view", "clear.view",
  "facilities.view", "customers.view", "meters.view", "notifications.view", "history.view",
];

export const DEFAULT_MATRIX: Record<Role, string[]> = {
  SUPER_ADMIN: [...PERMS],
  SECRETARY: [
    ...viewAll, "reports.view", "facilities.sync",
    "installation.create", "installation.approve",
    "activation.approve", "inspection.approve",
    "tamper.create", "tamper.approve", "clear.create", "clear.approve",
    "approvals.view",
  ],
  TECHNICAL_MAN: [
    ...viewAll,
    "installation.execute", "activation.create", "activation.execute",
    "inspection.execute", "tamper.create", "clear.create",
  ],
  ENERGY_MANAGER: [...viewAll, "reports.view", "approvals.view",
    "installation.approve", "activation.approve", "inspection.approve", "tamper.approve", "clear.approve"],
  GENERAL_MANAGER: [...viewAll, "reports.view", "approvals.view", "inspection.create",
    "installation.approve", "activation.approve", "inspection.approve", "tamper.approve", "clear.approve"],
  MD: [...viewAll, "reports.view", "approvals.view", "admin.delegation",
    "installation.approve", "activation.approve", "inspection.approve", "tamper.approve", "clear.approve"],
  IT_MANAGER: [...viewAll, "reports.view", "facilities.sync",
    "admin.users", "admin.api", "admin.apilogs", "admin.audit", "admin.settings"],
};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const gen20 = () => Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("");

export const maskCode = (c?: string) => c ? "•••• •••• •••• •••• ••••" : "— — — — —";

export const fmtDate = (t?: number) =>
  t ? new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const fmtTime = (t?: number) =>
  t ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtDT = (t?: number) => (t ? `${fmtDate(t)} · ${fmtTime(t)}` : "—");

export const age = (t: number) => {
  const ms = Date.now() - t;
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
};

export const mmss = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

export const stageOf = (op: Op): Stage => STAGES[op.type][Math.min(op.stageIdx, STAGES[op.type].length - 1)];

export const isPendingStatus = (s: OpStatus) =>
  ["PENDING_ENERGY_MANAGER", "PENDING_GM", "PENDING_MD", "PENDING_SECRETARY"].includes(s);

/** Which role can act right now on this op (null = nobody / auto) */
export const actionableBy = (op: Op, delegationActive: boolean): Role | "ZVEND" | null => {
  const s = op.status;
  if (s === "PENDING_ENERGY_MANAGER") return "ENERGY_MANAGER";
  if (s === "PENDING_GM") return "GENERAL_MANAGER";
  if (s === "PENDING_MD") return delegationActive ? "GENERAL_MANAGER" : "MD";
  if (s === "PENDING_SECRETARY") return "SECRETARY";
  if (s === "WAITING_ZVEND") return "ZVEND";
  if (s === "ZVEND_SUCCESS") return "SECRETARY";
  if (s === "ZVEND_FAILED") return "MD";
  if (s === "ASSIGNED" || s === "IN_PROGRESS") return op.type === "activation" && op.stageIdx === 0 ? "TECHNICAL_MAN" : "TECHNICAL_MAN";
  if (s === "SCHEDULED" || s === "REJECTED") return op.type === "inspection" ? "TECHNICAL_MAN" : null;
  if (s === "RETURNED") return stageOf(op).role === "ZVEND" ? null : (stageOf(op).role as Role);
  return null;
};

export const activeDelegation = (d: Delegation[], now = Date.now()) =>
  d.find(x => x.status === "ACTIVE" && x.start <= now && x.end >= now) || null;
