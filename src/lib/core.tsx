import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

/* ================= Types ================= */
export type Role = "SUPER_ADMIN" | "SECRETARY" | "TECHNICAL_MAN" | "ENERGY_MANAGER" | "GENERAL_MANAGER" | "MD" | "IT_MANAGER";
export type OpType = "installation" | "activation" | "inspection" | "tamper" | "clear";
export type OpStatus = "PENDING" | "IN_PROGRESS" | "WAITING_ZVEND" | "ZVEND_SUCCESS" | "ZVEND_FAILED" | "ASSIGNED" | "SCHEDULED" | "COMPLETED" | "REJECTED" | "RETURNED" | "CANCELLED";
export type Decision = "approve" | "reject" | "return" | "execute" | "deliver" | "confirm";

export interface User { id: string; name: string; email: string; role: Role; active: boolean; }
export interface Facility { id: string; code: string; name: string; area: string; lat: number; lng: number; status: string; syncedAt: number; }
export interface Customer { id: string; name: string; phone: string; email: string; address: string; facilityId: string; }
export interface Meter { id: string; number: string; facilityId: string; customerId?: string; status: string; installedAt?: number; }
export interface Comment { id: string; userId: string; userName: string; role: Role; text: string; at: number; decision?: string; }
export interface ScanRec { value: string; matched: boolean; at: number; }
export interface GpsRec { lat: number; lng: number; accuracy: number; at: number; accepted: boolean; }
export interface PhotoRec { id: string; label: string; dataUrl: string; at: number; lat?: number; lng?: number; }
export interface VideoRec { url: string; durationSec: number; at: number; }
export interface CustomerInfo { name: string; phone: string; email: string; address: string; }
export interface ZvendRec { status: "success" | "failed"; ref: string; responseCode: string; tamper?: string; clear?: string; at: number; latencyMs: number; }
export interface AuditEntry { id: string; at: number; userId: string; userName: string; role: string; action: string; detail: string; txn?: string; }
export interface Notif { id: string; forRole: Role | "ALL"; forUser?: string; kind: "approval" | "zvend" | "field" | "system"; text: string; at: number; read: boolean; opId?: string; txn?: string; }
export interface ApiLog { id: string; at: number; user: string; endpoint: string; method: string; txn?: string; status: "success" | "failed" | "pending"; code: string; durationMs: number; }
export interface Delegation { mdId: string; gmId: string; from: number; to: number; reason: string; active: boolean; }

export interface Op {
  id: string; type: OpType; txn: string; status: OpStatus; stageIdx: number;
  meterNumber: string; facilityId: string;
  initiatorId: string; initiatorName: string; initiatorRole: Role;
  createdAt: number; updatedAt: number;
  comments: Comment[];
  note?: string; scan?: ScanRec; gps?: GpsRec; photos: PhotoRec[]; customer?: CustomerInfo;
  instruction?: string; durationSec?: number; scheduledFor?: number; video?: VideoRec; observations?: string;
  zvend?: ZvendRec; assignedToId?: string; availableAt?: number; completedAt?: number;
  retryCount: number; pendingSync?: boolean;
}

export interface Settings { maxGpsAccuracyM: number; inspectionDurations: number[]; defaultDurationSec: number; zvend: { baseUrl: string; token: string; timeout: number; retries: number }; db?: Record<string, unknown>; }

export interface AppState {
  v: number; currentUserId: string | null;
  users: User[]; permissionMatrix: Record<Role, string[]>;
  facilities: Facility[]; customers: Customer[]; meters: Meter[];
  operations: Op[]; notifications: Notif[]; audit: AuditEntry[]; apiLogs: ApiLog[];
  delegation: Delegation | null; settings: Settings;
}

/* ================= Constants ================= */
export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin", SECRETARY: "Secretary", TECHNICAL_MAN: "Technical Man",
  ENERGY_MANAGER: "Energy Manager", GENERAL_MANAGER: "General Manager", MD: "Managing Director", IT_MANAGER: "IT Manager",
};
export const OP_ORDER: OpType[] = ["installation", "activation", "inspection", "tamper", "clear"];
export const OPS: Record<OpType, { label: string; short: string; path: string; icon: string; prefix: string; blurb: string }> = {
  installation: { label: "Meter Installation", short: "Installation", path: "meter-installation", icon: "wrench", prefix: "INS", blurb: "New meter registration through EM → GM → MD → ZVend → field install." },
  activation: { label: "Meter Activation", short: "Activation", path: "meter-activation", icon: "power", prefix: "ACT", blurb: "Technical-Man-initiated energization with customer capture." },
  inspection: { label: "Meter Inspection", short: "Inspection", path: "meter-inspection", icon: "clipboard", prefix: "INSP", blurb: "GM-scheduled video inspection. No ZVend call." },
  tamper: { label: "Tamper Code", short: "Tamper", path: "tamper-code", icon: "shield", prefix: "TMP", blurb: "20-digit tamper code issued by ZVend after MD approval." },
  clear: { label: "Clear Code", short: "Clear", path: "clear-code", icon: "key", prefix: "CLR", blurb: "20-digit clear code issued by ZVend after MD approval." },
};

type StageRole = Role | "ZVEND" | "INITIATOR";
export interface StageDef { key: string; label: string; role: StageRole; }
const ap = (k: string, l: string, r: StageRole): StageDef => ({ key: k, label: l, role: r });
export const STAGES: Record<OpType, StageDef[]> = {
  installation: [
    ap("INITIATOR", "Secretary Submission", "SECRETARY"),
    ap("ENERGY_MANAGER", "Energy Manager Approval", "ENERGY_MANAGER"),
    ap("GENERAL_MANAGER", "General Manager Approval", "GENERAL_MANAGER"),
    ap("MD", "MD Final Approval", "MD"),
    ap("ZVEND", "ZVend Registration", "ZVEND"),
    ap("DELIVERY", "Secretary Release", "SECRETARY"),
    ap("EXECUTION", "Field Installation", "TECHNICAL_MAN"),
    ap("COMPLETED", "Completed", "INITIATOR"),
  ],
  activation: [
    ap("INITIATOR", "Technical Man Capture", "TECHNICAL_MAN"),
    ap("SECRETARY", "Secretary Review", "SECRETARY"),
    ap("ENERGY_MANAGER", "Energy Manager Approval", "ENERGY_MANAGER"),
    ap("GENERAL_MANAGER", "General Manager Approval", "GENERAL_MANAGER"),
    ap("MD", "MD Final Approval", "MD"),
    ap("ZVEND", "ZVend Energization", "ZVEND"),
    ap("DELIVERY", "Secretary Completion", "SECRETARY"),
    ap("COMPLETED", "Completed", "INITIATOR"),
  ],
  inspection: [
    ap("SCHEDULE", "Scheduled by GM", "GENERAL_MANAGER"),
    ap("EXECUTION", "Field Inspection", "TECHNICAL_MAN"),
    ap("SECRETARY", "Secretary Review", "SECRETARY"),
    ap("ENERGY_MANAGER", "Energy Manager Approval", "ENERGY_MANAGER"),
    ap("GENERAL_MANAGER", "General Manager Review", "GENERAL_MANAGER"),
    ap("MD", "MD Final Approval", "MD"),
    ap("COMPLETED", "Completed", "INITIATOR"),
  ],
  tamper: [
    ap("INITIATOR", "Request Initiated", "INITIATOR"),
    ap("ENERGY_MANAGER", "Energy Manager Approval", "ENERGY_MANAGER"),
    ap("GENERAL_MANAGER", "General Manager Approval", "GENERAL_MANAGER"),
    ap("MD", "MD Final Approval", "MD"),
    ap("ZVEND", "ZVend Code Issuance", "ZVEND"),
    ap("DELIVERY", "Code Delivered", "INITIATOR"),
    ap("COMPLETED", "Completed", "INITIATOR"),
  ],
  clear: [
    ap("INITIATOR", "Request Initiated", "INITIATOR"),
    ap("ENERGY_MANAGER", "Energy Manager Approval", "ENERGY_MANAGER"),
    ap("GENERAL_MANAGER", "General Manager Approval", "GENERAL_MANAGER"),
    ap("MD", "MD Final Approval", "MD"),
    ap("ZVEND", "ZVend Code Issuance", "ZVEND"),
    ap("DELIVERY", "Code Delivered", "INITIATOR"),
    ap("COMPLETED", "Completed", "INITIATOR"),
  ],
};
export const STATUS_META: Record<OpStatus, { label: string; tone: "gray" | "amber" | "green" | "red" | "blue" | "teal" | "ink" }> = {
  PENDING: { label: "Pending", tone: "amber" }, IN_PROGRESS: { label: "In Progress", tone: "blue" },
  WAITING_ZVEND: { label: "Waiting ZVend", tone: "blue" }, ZVEND_SUCCESS: { label: "ZVend Success", tone: "green" },
  ZVEND_FAILED: { label: "ZVend Failed", tone: "red" }, ASSIGNED: { label: "Assigned", tone: "teal" },
  SCHEDULED: { label: "Scheduled", tone: "teal" }, COMPLETED: { label: "Completed", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" }, RETURNED: { label: "Returned", tone: "amber" }, CANCELLED: { label: "Cancelled", tone: "gray" },
};
export const TERMINAL: OpStatus[] = ["COMPLETED", "CANCELLED"];

export const PERMS = [
  "installation.view", "installation.create", "installation.approve", "installation.execute", "installation.history", "installation.release",
  "activation.view", "activation.create", "activation.approve", "activation.execute", "activation.history",
  "inspection.view", "inspection.create", "inspection.approve", "inspection.execute", "inspection.history",
  "tamper.view", "tamper.create", "tamper.approve", "tamper.execute", "tamper.history",
  "clear.view", "clear.create", "clear.approve", "clear.execute", "clear.history",
  "approvals.view", "facilities.view", "facilities.sync", "customers.view", "meters.view",
  "reports.view", "notifications.view", "history.view",
  "admin.users", "admin.roles", "admin.api", "admin.apilogs", "admin.audit", "admin.settings", "admin.delegation", "admin.database",
] as const;
const viewAll = ["installation.view", "activation.view", "inspection.view", "tamper.view", "clear.view"];
const historyAll = viewAll.map(p => p.replace(".view", ".history"));
const approveAll = viewAll.map(p => p.replace(".view", ".approve"));
const dataView = ["facilities.view", "customers.view", "meters.view", "notifications.view"];
export const DEFAULT_MATRIX: Record<Role, string[]> = {
  SUPER_ADMIN: [...PERMS],
  SECRETARY: [...viewAll, ...historyAll, ...approveAll, "installation.create", "tamper.create", "clear.create", "installation.release", "approvals.view", "reports.view", ...dataView, "facilities.sync"],
  TECHNICAL_MAN: [...viewAll, ...historyAll, "activation.create", "tamper.create", "clear.create", "installation.execute", "activation.execute", "inspection.execute", "tamper.execute", "clear.execute", "history.view", ...dataView],
  ENERGY_MANAGER: [...viewAll, ...historyAll, ...approveAll, "approvals.view", "reports.view", ...dataView],
  GENERAL_MANAGER: [...viewAll, ...historyAll, ...approveAll, "inspection.create", "approvals.view", "reports.view", ...dataView],
  MD: [...viewAll, ...historyAll, ...approveAll, "approvals.view", "reports.view", "admin.delegation", ...dataView],
  IT_MANAGER: [...viewAll, ...historyAll, "reports.view", "facilities.sync", "admin.users", "admin.api", "admin.apilogs", "admin.audit", "admin.settings", ...dataView],
};

/* ================= Helpers ================= */
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const gen20 = () => Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("");
export const fmtDT = (t: number) => new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const fmtDate = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
export const age = (t: number) => {
  const m = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m}m`; const h = Math.round(m / 60); if (h < 24) return `${h}h`; return `${Math.round(h / 24)}d`;
};
export function activeDelegation(d: Delegation | null): boolean {
  return !!d && d.active && Date.now() >= d.from && Date.now() <= d.to;
}
export function actionableBy(op: Op, hasDelegation: boolean): Role | null {
  if (TERMINAL.includes(op.status) || op.status === "REJECTED") return null;
  if (op.status === "WAITING_ZVEND") return null;
  const stage = STAGES[op.type][Math.min(op.stageIdx, STAGES[op.type].length - 1)];
  if (stage.key === "ZVEND" || stage.key === "COMPLETED") return null;
  if (stage.role === "INITIATOR") return op.initiatorRole;
  if (stage.role === "MD" && hasDelegation) return "GENERAL_MANAGER";
  return stage.role as Role;
}

/* ================= Seed ================= */
const now = Date.now(); const H = 3600000; const D = 24 * H;
function buildSeed(): AppState {
  const users: User[] = [
    { id: "u-sa", name: "Amara Okafor", email: "super.admin@zarox.com", role: "SUPER_ADMIN", active: true },
    { id: "u-sec", name: "Bisi Adeyemi", email: "secretary@zarox.com", role: "SECRETARY", active: true },
    { id: "u-tech", name: "Chike Eze", email: "tech@zarox.com", role: "TECHNICAL_MAN", active: true },
    { id: "u-em", name: "Funke Balogun", email: "energy@zarox.com", role: "ENERGY_MANAGER", active: true },
    { id: "u-gm", name: "Ibrahim Musa", email: "gm@zarox.com", role: "GENERAL_MANAGER", active: true },
    { id: "u-md", name: "Zainab Farouk", email: "md@zarox.com", role: "MD", active: true },
    { id: "u-it", name: "Tunde Alabi", email: "it@zarox.com", role: "IT_MANAGER", active: true },
  ];
  const facilities: Facility[] = [
    { id: "f1", code: "FAC-IKY", name: "Ikoyi Head Office", area: "Ikoyi, Lagos", lat: 6.4432, lng: 3.4186, status: "ACTIVE", syncedAt: now - 6 * H },
    { id: "f2", code: "FAC-LEK", name: "Lekki Service Yard", area: "Lekki Phase 1", lat: 6.4478, lng: 3.4721, status: "ACTIVE", syncedAt: now - 6 * H },
    { id: "f3", code: "FAC-SUR", name: "Surulere Depot", area: "Surulere", lat: 6.4926, lng: 3.3605, status: "ACTIVE", syncedAt: now - 8 * H },
    { id: "f4", code: "FAC-YAB", name: "Yaba Substation", area: "Yaba", lat: 6.5083, lng: 3.3711, status: "ACTIVE", syncedAt: now - 6 * H },
    { id: "f5", code: "FAC-AJA", name: "Ajah Feeder Station", area: "Ajah", lat: 6.4668, lng: 3.5852, status: "ACTIVE", syncedAt: now - 30 * H },
    { id: "f6", code: "FAC-VIC", name: "Victoria Island Hub", area: "V.I.", lat: 6.4281, lng: 3.4218, status: "ACTIVE", syncedAt: now - 6 * H },
  ];
  const customers: Customer[] = [
    { id: "c1", name: "John Joe", phone: "0803 111 2222", email: "john.joe@mail.com", address: "12 Adeola Close, Ikoyi", facilityId: "f1" },
    { id: "c2", name: "John Joe", phone: "0809 888 7777", email: "jj@business.ng", address: "4B Freedom Way, Lekki", facilityId: "f2" },
    { id: "c3", name: "Adaeze Umeh", phone: "0805 555 4444", email: "adaeze@mail.com", address: "9 Herbert Macaulay Way", facilityId: "f4" },
    { id: "c4", name: "Sultan Bello", phone: "0802 222 3333", email: "sultan@mail.com", address: "21 Awolowo Road", facilityId: "f1" },
    { id: "c5", name: "Grace Obi", phone: "0807 777 6666", email: "grace.obi@mail.com", address: "33 Admiralty Way", facilityId: "f2" },
    { id: "c6", name: "Musa Danladi", phone: "0806 666 5555", email: "musa.d@mail.com", address: "5 Bode Thomas", facilityId: "f3" },
  ];
  const meters: Meter[] = [
    { id: "m1", number: "45039812990", facilityId: "f1", customerId: "c1", status: "ACTIVE", installedAt: now - 40 * D },
    { id: "m2", number: "45039812991", facilityId: "f2", customerId: "c2", status: "ACTIVE", installedAt: now - 33 * D },
    { id: "m3", number: "45039813002", facilityId: "f4", customerId: "c3", status: "ACTIVE", installedAt: now - 21 * D },
    { id: "m4", number: "45039813117", facilityId: "f1", customerId: "c4", status: "INSTALLED", installedAt: now - 9 * D },
    { id: "m5", number: "45039813228", facilityId: "f2", customerId: "c5", status: "ACTIVE", installedAt: now - 12 * D },
    { id: "m6", number: "45039813339", facilityId: "f3", customerId: "c6", status: "FAULTY", installedAt: now - 55 * D },
    { id: "m7", number: "45039813401", facilityId: "f5", status: "IN_STOCK" },
    { id: "m8", number: "45039813402", facilityId: "f6", status: "IN_STOCK" },
  ];
  const ymd = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
  const mk = (o: Partial<Op> & Pick<Op, "id" | "type" | "meterNumber" | "facilityId" | "status" | "stageIdx">): Op => ({
    txn: `ZADM-${OPS[o.type].prefix}-${ymd(o.createdAt ?? now)}-${String(Math.floor(Math.random() * 900) + 100)}`,
    initiatorId: "u-sec", initiatorName: "Bisi Adeyemi", initiatorRole: "SECRETARY",
    createdAt: now - 2 * D, updatedAt: now - 5 * H, comments: [], photos: [], retryCount: 0,
    ...o,
  } as Op);
  const operations: Op[] = [
    mk({ id: "op1", type: "installation", meterNumber: "45039813401", facilityId: "f5", status: "PENDING", stageIdx: 1, createdAt: now - 26 * H, note: "New build at Ajah Feeder — customer waiting on energization.",
      comments: [{ id: uid(), userId: "u-sec", userName: "Bisi Adeyemi", role: "SECRETARY", text: "Submitted for approval. Stock verified in store.", at: now - 26 * H, decision: "submit" }] }),
    mk({ id: "op2", type: "installation", meterNumber: "45039813402", facilityId: "f6", status: "PENDING", stageIdx: 2, createdAt: now - 2 * D, note: "VI Hub expansion, phase 2.",
      comments: [
        { id: uid(), userId: "u-sec", userName: "Bisi Adeyemi", role: "SECRETARY", text: "Submitted for approval.", at: now - 2 * D, decision: "submit" },
        { id: uid(), userId: "u-em", userName: "Funke Balogun", role: "ENERGY_MANAGER", text: "Stock and facility verified. Approved.", at: now - 40 * H, decision: "approve" }] }),
    mk({ id: "op3", type: "installation", meterNumber: "45039813117", facilityId: "f1", status: "ZVEND_SUCCESS", stageIdx: 5, createdAt: now - 9 * D, note: "Standard new install — Ikoyi block C.",
      initiatorId: "u-sec", zvend: { status: "success", ref: "ZV-REF-88213", responseCode: "00", tamper: "88410293571620483759", clear: "66291847350219864530", at: now - 9 * D + 5 * H, latencyMs: 412 },
      comments: [
        { id: uid(), userId: "u-sec", userName: "Bisi Adeyemi", role: "SECRETARY", text: "Submitted.", at: now - 9 * D, decision: "submit" },
        { id: uid(), userId: "u-em", userName: "Funke Balogun", role: "ENERGY_MANAGER", text: "Stock verified.", at: now - 9 * D + 2 * H, decision: "approve" },
        { id: uid(), userId: "u-gm", userName: "Ibrahim Musa", role: "GENERAL_MANAGER", text: "Approved.", at: now - 9 * D + 3 * H, decision: "approve" },
        { id: uid(), userId: "u-md", userName: "Zainab Farouk", role: "MD", text: "Final approval granted.", at: now - 9 * D + 5 * H, decision: "approve" }] }),
    mk({ id: "op4", type: "installation", meterNumber: "45039813002", facilityId: "f4", status: "COMPLETED", stageIdx: 7, createdAt: now - 22 * D, completedAt: now - 21 * D, note: "Yaba substation meter swap.",
      zvend: { status: "success", ref: "ZV-REF-77102", responseCode: "00", tamper: "12093847561029384756", clear: "99887766554433221100", at: now - 22 * D + 6 * H, latencyMs: 380 },
      comments: [
        { id: uid(), userId: "u-sec", userName: "Bisi Adeyemi", role: "SECRETARY", text: "Submitted.", at: now - 22 * D, decision: "submit" },
        { id: uid(), userId: "u-em", userName: "Funke Balogun", role: "ENERGY_MANAGER", text: "Approved.", at: now - 22 * D + 2 * H, decision: "approve" },
        { id: uid(), userId: "u-gm", userName: "Ibrahim Musa", role: "GENERAL_MANAGER", text: "Approved.", at: now - 22 * D + 4 * H, decision: "approve" },
        { id: uid(), userId: "u-md", userName: "Zainab Farouk", role: "MD", text: "Approved.", at: now - 22 * D + 6 * H, decision: "approve" },
        { id: uid(), userId: "u-sec", userName: "Bisi Adeyemi", role: "SECRETARY", text: "Released to Technical Man.", at: now - 22 * D + 7 * H, decision: "deliver" },
        { id: uid(), userId: "u-tech", userName: "Chike Eze", role: "TECHNICAL_MAN", text: "Installed, sealed and tested.", at: now - 21 * D, decision: "execute" }] }),
    mk({ id: "op5", type: "activation", meterNumber: "45039813117", facilityId: "f1", status: "PENDING", stageIdx: 1, createdAt: now - 7 * H,
      initiatorId: "u-tech", initiatorName: "Chike Eze", initiatorRole: "TECHNICAL_MAN",
      customer: { name: "Sultan Bello", phone: "0802 222 3333", email: "sultan@mail.com", address: "21 Awolowo Road, Ikoyi" },
      gps: { lat: 6.4433, lng: 3.4188, accuracy: 14, at: now - 7 * H, accepted: true },
      scan: { value: "45039813117", matched: true, at: now - 7 * H }, note: "Customer verified in person with ID.",
      comments: [{ id: uid(), userId: "u-tech", userName: "Chike Eze", role: "TECHNICAL_MAN", text: "Field capture submitted — scan, GPS and 4 photos attached.", at: now - 7 * H, decision: "submit" }] }),
    mk({ id: "op6", type: "activation", meterNumber: "45039812990", facilityId: "f1", status: "COMPLETED", stageIdx: 7, createdAt: now - 39 * D, completedAt: now - 38 * D,
      initiatorId: "u-tech", initiatorName: "Chike Eze", initiatorRole: "TECHNICAL_MAN",
      customer: { name: "John Joe", phone: "0803 111 2222", email: "john.joe@mail.com", address: "12 Adeola Close, Ikoyi" },
      zvend: { status: "success", ref: "ZV-REF-66021", responseCode: "00", at: now - 39 * D + 8 * H, latencyMs: 455 },
      comments: [
        { id: uid(), userId: "u-tech", userName: "Chike Eze", role: "TECHNICAL_MAN", text: "Field capture submitted.", at: now - 39 * D, decision: "submit" },
        { id: uid(), userId: "u-sec", userName: "Bisi Adeyemi", role: "SECRETARY", text: "Customer details verified.", at: now - 39 * D + 2 * H, decision: "approve" },
        { id: uid(), userId: "u-em", userName: "Funke Balogun", role: "ENERGY_MANAGER", text: "Approved.", at: now - 39 * D + 4 * H, decision: "approve" },
        { id: uid(), userId: "u-gm", userName: "Ibrahim Musa", role: "GENERAL_MANAGER", text: "Approved.", at: now - 39 * D + 6 * H, decision: "approve" },
        { id: uid(), userId: "u-md", userName: "Zainab Farouk", role: "MD", text: "Approved.", at: now - 39 * D + 8 * H, decision: "approve" },
        { id: uid(), userId: "u-sec", userName: "Bisi Adeyemi", role: "SECRETARY", text: "Activation confirmed after ZVend success.", at: now - 38 * D, decision: "confirm" }] }),
    mk({ id: "op7", type: "inspection", meterNumber: "45039813339", facilityId: "f3", status: "SCHEDULED", stageIdx: 1, createdAt: now - 20 * H, scheduledFor: now + 2 * D, durationSec: 120,
      initiatorId: "u-gm", initiatorName: "Ibrahim Musa", initiatorRole: "GENERAL_MANAGER",
      instruction: "Verify terminal block seals and display readings; meter reported FAULTY by customer.",
      comments: [{ id: uid(), userId: "u-gm", userName: "Ibrahim Musa", role: "GENERAL_MANAGER", text: "Scheduled — 2-minute video rule applies.", at: now - 20 * H, decision: "submit" }] }),
    mk({ id: "op8", type: "inspection", meterNumber: "45039812991", facilityId: "f2", status: "COMPLETED", stageIdx: 6, createdAt: now - 15 * D, completedAt: now - 14 * D, durationSec: 60,
      initiatorId: "u-gm", initiatorName: "Ibrahim Musa", initiatorRole: "GENERAL_MANAGER", instruction: "Routine quarterly inspection.",
      comments: [
        { id: uid(), userId: "u-gm", userName: "Ibrahim Musa", role: "GENERAL_MANAGER", text: "Scheduled.", at: now - 15 * D, decision: "submit" },
        { id: uid(), userId: "u-tech", userName: "Chike Eze", role: "TECHNICAL_MAN", text: "Video submitted — seals intact.", at: now - 15 * D + 5 * H, decision: "execute" },
        { id: uid(), userId: "u-sec", userName: "Bisi Adeyemi", role: "SECRETARY", text: "Reviewed.", at: now - 15 * D + 7 * H, decision: "approve" },
        { id: uid(), userId: "u-em", userName: "Funke Balogun", role: "ENERGY_MANAGER", text: "Approved.", at: now - 14 * D, decision: "approve" },
        { id: uid(), userId: "u-gm", userName: "Ibrahim Musa", role: "GENERAL_MANAGER", text: "Approved.", at: now - 14 * D + 2 * H, decision: "approve" },
        { id: uid(), userId: "u-md", userName: "Zainab Farouk", role: "MD", text: "Approved.", at: now - 14 * D + 4 * H, decision: "approve" }] }),
    mk({ id: "op9", type: "tamper", meterNumber: "45039813339", facilityId: "f3", status: "PENDING", stageIdx: 3, createdAt: now - 30 * H, note: "Meter locked out after storm surge; customer verified in person.",
      comments: [
        { id: uid(), userId: "u-sec", userName: "Bisi Adeyemi", role: "SECRETARY", text: "Requested per customer complaint #C-2291.", at: now - 30 * H, decision: "submit" },
        { id: uid(), userId: "u-em", userName: "Funke Balogun", role: "ENERGY_MANAGER", text: "Fault history confirms lockout. Approved.", at: now - 24 * H, decision: "approve" },
        { id: uid(), userId: "u-gm", userName: "Ibrahim Musa", role: "GENERAL_MANAGER", text: "Approved — schedule field reset after code issue.", at: now - 12 * H, decision: "approve" }] }),
    mk({ id: "op10", type: "clear", meterNumber: "45039812990", facilityId: "f1", status: "COMPLETED", stageIdx: 6, createdAt: now - 30 * D, completedAt: now - 29 * D, note: "Credit lockout after token reversal.",
      zvend: { status: "success", ref: "ZV-REF-55190", responseCode: "00", clear: "20981374655544332211", at: now - 30 * D + 4 * H, latencyMs: 391 },
      comments: [
        { id: uid(), userId: "u-tech", userName: "Chike Eze", role: "TECHNICAL_MAN", text: "Requested via barcode scan on site.", at: now - 30 * D, decision: "submit" },
        { id: uid(), userId: "u-em", userName: "Funke Balogun", role: "ENERGY_MANAGER", text: "Approved.", at: now - 30 * D + 1 * H, decision: "approve" },
        { id: uid(), userId: "u-gm", userName: "Ibrahim Musa", role: "GENERAL_MANAGER", text: "Approved.", at: now - 30 * D + 2 * H, decision: "approve" },
        { id: uid(), userId: "u-md", userName: "Zainab Farouk", role: "MD", text: "Approved.", at: now - 30 * D + 4 * H, decision: "approve" },
        { id: uid(), userId: "u-tech", userName: "Chike Eze", role: "TECHNICAL_MAN", text: "Code delivered to customer on site.", at: now - 29 * D, decision: "confirm" }] }),
  ];
  const audit: AuditEntry[] = [
    { id: uid(), at: now - 26 * H, userId: "u-sec", userName: "Bisi Adeyemi", role: "SECRETARY", action: "operation_submitted", detail: "Meter Installation submitted.", txn: operations[0].txn },
    { id: uid(), at: now - 7 * H, userId: "u-tech", userName: "Chike Eze", role: "TECHNICAL_MAN", action: "barcode_scan", detail: "Meter 45039813117 verified by scan.", txn: operations[4].txn },
    { id: uid(), at: now - 7 * H, userId: "u-tech", userName: "Chike Eze", role: "TECHNICAL_MAN", action: "gps_capture", detail: "GPS ±14 m accepted.", txn: operations[4].txn },
    { id: uid(), at: now - 12 * H, userId: "u-gm", userName: "Ibrahim Musa", role: "GENERAL_MANAGER", action: "operation_approve", detail: "Tamper Code approved.", txn: operations[8].txn },
    { id: uid(), at: now - 6 * H, userId: "u-it", userName: "Tunde Alabi", role: "IT_MANAGER", action: "sync_completed", detail: "ZVend facility sync: 6 processed, 0 failed." },
  ];
  const apiLogs: ApiLog[] = [
    { id: uid(), at: now - 9 * D + 5 * H, user: "ZVend Gateway", endpoint: "/v1/meters/install", method: "POST", txn: operations[2].txn, status: "success", code: "00", durationMs: 412 },
    { id: uid(), at: now - 30 * D + 4 * H, user: "ZVend Gateway", endpoint: "/v1/meters/clear-code", method: "POST", txn: operations[9].txn, status: "success", code: "00", durationMs: 391 },
    { id: uid(), at: now - 6 * H, user: "Tunde Alabi", endpoint: "/v1/facilities", method: "GET", status: "success", code: "200", durationMs: 240 },
  ];
  const notifications: Notif[] = [
    { id: uid(), forRole: "ENERGY_MANAGER", kind: "approval", text: "New meter installation awaiting your approval.", at: now - 26 * H, read: false, opId: "op1", txn: operations[0].txn },
    { id: uid(), forRole: "SECRETARY", kind: "approval", text: "Meter activation requires your review.", at: now - 7 * H, read: false, opId: "op5", txn: operations[4].txn },
    { id: uid(), forRole: "MD", kind: "approval", text: "Tamper Code request awaits final approval.", at: now - 12 * H, read: false, opId: "op9", txn: operations[8].txn },
    { id: uid(), forRole: "TECHNICAL_MAN", kind: "field", text: "Inspection scheduled — field action required.", at: now - 20 * H, read: false, opId: "op7", txn: operations[6].txn },
    { id: uid(), forRole: "SECRETARY", kind: "zvend", text: "ZVend installation completed — codes ready for release.", at: now - 9 * D + 5 * H, read: true, opId: "op3", txn: operations[2].txn },
  ];
  return {
    v: 4, currentUserId: null, users, permissionMatrix: JSON.parse(JSON.stringify(DEFAULT_MATRIX)),
    facilities, customers, meters, operations, notifications, audit, apiLogs,
    delegation: { mdId: "u-md", gmId: "u-gm", from: now - 2 * D, to: now + 5 * D, reason: "MD travelling — approval authority delegated.", active: true },
    settings: { maxGpsAccuracyM: 50, inspectionDurations: [60, 120, 180, 300], defaultDurationSec: 120, zvend: { baseUrl: "https://api.zvend.zarox.com", token: "zv_live_••••••••", timeout: 20, retries: 3 } },
  };
}

/* ================= Store ================= */
const LS_KEY = "zadmin:v4";
function load(): AppState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (s.v === 4) {
        s.permissionMatrix = { ...s.permissionMatrix, SUPER_ADMIN: [...PERMS] };
        return s;
      }
    }
  } catch { /* reseed */ }
  return buildSeed();
}

export interface Toast { id: string; text: string; tone: "ok" | "warn" | "danger" | "info"; }
interface StoreCtx {
  state: AppState; user: User | null; can: (p: string) => boolean;
  online: boolean; syncing: boolean; delegation: boolean; toasts: Toast[];
  toast: (text: string, tone?: Toast["tone"]) => void; dismissToast: (id: string) => void;
  login: (id: string) => void; logout: () => void;
  decide: (opId: string, d: Decision, comment: string) => string | null;
  createInstallation: (d: { meterNumber: string; facilityId: string; comment: string }) => Op | null;
  createActivation: (d: { meterNumber: string; facilityId: string; customer: CustomerInfo; gps: GpsRec; photos: PhotoRec[]; scan: ScanRec; comment: string }) => Op | null;
  scheduleInspection: (d: { meterNumber: string; facilityId: string; date: number; instruction: string; durationSec: number }) => Op | null;
  requestCode: (t: "tamper" | "clear", d: { meterNumber: string; facilityId: string; via: string; comment: string }) => Op | null;
  saveScan: (opId: string, s: ScanRec) => void; saveGps: (opId: string, g: GpsRec) => void;
  addPhoto: (opId: string, p: PhotoRec) => void; saveCustomer: (opId: string, c: CustomerInfo) => void;
  saveVideo: (opId: string, v: VideoRec, obs: string) => void; startField: (opId: string) => void;
  markRead: (id: string) => void; markAllRead: () => void;
  auditCode: (opId: string, action: string) => void; saveSettings: (p: Partial<Settings>) => void;
  saveZvend: (p: Partial<Settings["zvend"]>) => void; togglePerm: (r: Role, p: string) => void;
  addUser: (d: { name: string; email: string; role: Role }) => void; setUserActive: (id: string, a: boolean) => void;
  setDelegation: (d: Delegation | null) => void; syncFacilities: () => void; pushAudit: (action: string, detail: string) => void;
}
const Ctx = createContext<StoreCtx | null>(null);
export const useStore = () => useContext(Ctx)!;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [syncing, setSyncing] = useState(false);
  const stateRef = useRef(state); stateRef.current = state;

  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* full */ } }, [state]);
  useEffect(() => {
    const on = () => { setOnline(true); const s = stateRef.current; if (s.operations.some(o => o.pendingSync)) { setSyncing(true); setTimeout(() => { mutate(st => ({ ...st, operations: st.operations.map(o => o.pendingSync ? { ...o, pendingSync: false } : o), audit: [...mkAudit(st, "sync", "Offline queue synchronized."), ...st.audit] })); setSyncing(false); toast("Offline queue synchronized", "ok"); }, 1400); } };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutate = useCallback((fn: (s: AppState) => AppState) => setState(fn), []);
  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = uid(); setToasts(t => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts(t => t.filter(x => x.id !== id)), []);

  const user = useMemo(() => state.users.find(u => u.id === state.currentUserId) ?? null, [state.users, state.currentUserId]);
  const delegation = activeDelegation(state.delegation);
  const can = useCallback((p: string) => !!user && (state.permissionMatrix[user.role] || []).includes(p), [user, state.permissionMatrix]);

  const mkAudit = (s: AppState, action: string, detail: string, txn?: string): AuditEntry[] => {
    const u = s.users.find(x => x.id === s.currentUserId);
    return [{ id: uid(), at: Date.now(), userId: u?.id ?? "sys", userName: u?.name ?? "ZVend Gateway", role: u?.role ?? "SYSTEM", action, detail, txn }];
  };
  const mkNotif = (forRole: Role | "ALL", text: string, kind: Notif["kind"], op?: Op): Notif =>
    ({ id: uid(), forRole, text, kind, at: Date.now(), read: false, opId: op?.id, txn: op?.txn });
  const touch = (o: Op, patch: Partial<Op>): Op => ({ ...o, ...patch, updatedAt: Date.now() });

  const txnFor = (s: AppState, t: OpType) => {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const pre = `ZADM-${OPS[t].prefix}-${d}-`;
    const n = s.operations.filter(o => o.txn.startsWith(pre)).length + 1 + s.operations.length % 7;
    return pre + String(n).padStart(6, "0");
  };

  const settleZvend = useCallback((opId: string) => {
    setTimeout(() => {
      mutate(s => {
        const op = s.operations.find(o => o.id === opId);
        if (!op || op.status !== "WAITING_ZVEND") return s;
        const ok = true;
        const zv: ZvendRec = { status: "success", ref: `ZV-REF-${Math.floor(10000 + Math.random() * 89999)}`, responseCode: "00", at: Date.now(), latencyMs: Math.floor(280 + Math.random() * 320) };
        if (op.type === "installation") { zv.tamper = gen20(); zv.clear = gen20(); }
        if (op.type === "tamper") zv.tamper = gen20();
        if (op.type === "clear") zv.clear = gen20();
        const stages = STAGES[op.type]; const nextIdx = op.stageIdx + 1;
        const updated = touch(op, { status: ok ? "ZVEND_SUCCESS" : "ZVEND_FAILED", zvend: zv, stageIdx: nextIdx });
        const log: ApiLog = { id: uid(), at: Date.now(), user: "ZVend Gateway", method: "POST", txn: op.txn, status: "success", code: "00", durationMs: zv.latencyMs,
          endpoint: op.type === "installation" ? "/v1/meters/install" : op.type === "activation" ? "/v1/meters/activate" : op.type === "tamper" ? "/v1/meters/tamper-code" : "/v1/meters/clear-code" };
        return {
          ...s, operations: s.operations.map(o => o.id === opId ? updated : o), apiLogs: [log, ...s.apiLogs],
          audit: [...mkAudit(s, "zvend_success", `${OPS[op.type].label} ${op.txn} — ZVend completed (ref ${zv.ref}).`, op.txn), ...s.audit],
          notifications: [mkNotif("SECRETARY", `${OPS[op.type].label} ${op.txn} — ZVend succeeded. Result ready.`, "zvend", updated), ...s.notifications],
        };
      });
    }, 1600);
  }, [mutate]);

  /* ---- decisions ---- */
  const decide: StoreCtx["decide"] = (opId, d, comment) => {
    const s0 = stateRef.current;
    const op = s0.operations.find(o => o.id === opId);
    const u = s0.users.find(x => x.id === s0.currentUserId);
    if (!op || !u) return "Record not found.";
    if (!comment.trim()) return "A comment is required for every workflow decision.";
    if (TERMINAL.includes(op.status)) return "Record is in a terminal state.";
    const stages = STAGES[op.type]; const stage = stages[Math.min(op.stageIdx, stages.length - 1)];
    const owner = actionableBy(op, activeDelegation(s0.delegation));
    if (owner !== u.role) return `This stage belongs to ${owner ? ROLE_LABEL[owner] : "another actor"}.`;
    const isMDdelegated = stage.role === "MD" && u.role === "GENERAL_MANAGER";
    const text = isMDdelegated ? `${comment.trim()} — Approved under MD delegation.` : comment.trim();
    const c: Comment = { id: uid(), userId: u.id, userName: u.name, role: u.role, text, at: Date.now(), decision: d };
    let error: string | null = null;
    mutate(s => {
      const cur = s.operations.find(o => o.id === opId)!;
      let next: Op;
      if (d === "reject") next = touch(cur, { status: "REJECTED" });
      else if (d === "return") next = touch(cur, { status: "RETURNED" });
      else {
        const nextIdx = cur.stageIdx + 1; const ns = stages[nextIdx];
        if (d === "deliver" && cur.type === "installation") next = touch(cur, { status: "ASSIGNED", availableAt: Date.now() });
        else if (ns?.key === "ZVEND") next = touch(cur, { status: "WAITING_ZVEND", stageIdx: nextIdx });
        else if (!ns || ns.key === "COMPLETED") next = touch(cur, { status: "COMPLETED", completedAt: Date.now(), stageIdx: stages.length - 1 });
        else next = touch(cur, { status: "PENDING", stageIdx: nextIdx });
      }
      const notifs: Notif[] = [];
      if (d === "reject" || d === "return") notifs.push(mkNotif(cur.initiatorRole, `${OPS[cur.type].label} ${cur.txn} was ${d === "reject" ? "rejected" : "returned"} by ${u.name}.`, "approval", next));
      else if (next.status === "WAITING_ZVEND") notifs.push(mkNotif("IT_MANAGER", `${OPS[cur.type].label} ${cur.txn} — ZVend call in progress after MD approval.`, "zvend", next));
      else if (next.status === "ASSIGNED") notifs.push(mkNotif("TECHNICAL_MAN", `Installation ${cur.txn} assigned for field execution.`, "field", next));
      else if (next.status === "COMPLETED") notifs.push(mkNotif(cur.initiatorRole, `${OPS[cur.type].label} ${cur.txn} is complete.`, "system", next));
      else {
        const nr = actionableBy(next, activeDelegation(s.delegation));
        if (nr) notifs.push(mkNotif(nr, `${OPS[cur.type].label} ${cur.txn} awaits your action.`, "approval", next));
      }
      return {
        ...s,
        operations: s.operations.map(o => o.id === opId ? { ...next, comments: [...o.comments, c] } : o),
        meters: d === "execute" && cur.type === "installation" ? s.meters.map(m => m.number === cur.meterNumber ? { ...m, status: "INSTALLED", installedAt: Date.now() } : m)
          : (d === "confirm" && cur.type === "activation") ? s.meters.map(m => m.number === cur.meterNumber ? { ...m, status: "ACTIVE" } : m) : s.meters,
        audit: [...mkAudit(s, `operation_${d}${isMDdelegated ? "_delegated" : ""}`, `${OPS[cur.type].label} ${cur.txn} — ${d} by ${u.name}.`, cur.txn), ...s.audit],
        notifications: [...notifs, ...s.notifications],
      };
    });
    if (error) return error;
    const after = stateRef.current.operations.find(o => o.id === opId);
    if (after?.status === "WAITING_ZVEND") settleZvend(opId);
    toast(d === "reject" ? "Record rejected" : d === "return" ? "Record returned to initiator" : "Decision recorded", d === "reject" ? "danger" : "ok");
    return null;
  };

  /* ---- creation ---- */
  const begin = (s: AppState, partial: Omit<Op, "id" | "txn" | "createdAt" | "updatedAt" | "comments" | "retryCount" | "photos"> & { comments?: Comment[]; photos?: PhotoRec[] }): [AppState, Op] => {
    const op: Op = { ...partial, id: uid(), txn: txnFor(s, partial.type), createdAt: Date.now(), updatedAt: Date.now(), comments: partial.comments ?? [], photos: partial.photos ?? [], retryCount: 0 };
    return [{ ...s, operations: [op, ...s.operations], audit: [...mkAudit(s, "operation_submitted", `${OPS[op.type].label} ${op.txn} submitted.`, op.txn), ...s.audit] }, op];
  };
  const offline = !online;
  const createInstallation: StoreCtx["createInstallation"] = d => {
    if (!/^\d+$/.test(d.meterNumber.trim())) { toast("Meter number must be numerals only.", "danger"); return null; }
    if (stateRef.current.meters.some(m => m.number === d.meterNumber.trim())) { toast("This meter number already exists.", "danger"); return null; }
    const u = stateRef.current.users.find(x => x.id === stateRef.current.currentUserId)!;
    let created: Op | null = null;
    mutate(s => {
      const meter = { id: uid(), number: d.meterNumber.trim(), facilityId: d.facilityId, status: "IN_STOCK" };
      const [ns, op] = begin(s, {
        type: "installation", status: "PENDING", stageIdx: 1, meterNumber: meter.number, facilityId: d.facilityId,
        initiatorId: u.id, initiatorName: u.name, initiatorRole: u.role, note: d.comment, pendingSync: offline || undefined,
        comments: [{ id: uid(), userId: u.id, userName: u.name, role: u.role, text: d.comment || "Submitted for approval.", at: Date.now(), decision: "submit" }],
      });
      created = op;
      return { ...ns, meters: [...ns.meters, meter], notifications: [mkNotif("ENERGY_MANAGER", `New meter installation awaiting your approval · ${op.txn}`, "approval", op), ...ns.notifications] };
    });
    toast(offline ? "Queued offline — will sync when reconnected." : "Submitted to Energy Manager.", offline ? "warn" : "ok");
    return created;
  };
  const createActivation: StoreCtx["createActivation"] = d => {
    const u = stateRef.current.users.find(x => x.id === stateRef.current.currentUserId)!;
    let created: Op | null = null;
    mutate(s => {
      const [ns, op] = begin(s, {
        type: "activation", status: "PENDING", stageIdx: 1, meterNumber: d.meterNumber, facilityId: d.facilityId,
        initiatorId: u.id, initiatorName: u.name, initiatorRole: "TECHNICAL_MAN", customer: d.customer, gps: d.gps, photos: d.photos, scan: d.scan, note: d.comment,
        pendingSync: offline || undefined,
        comments: [{ id: uid(), userId: u.id, userName: u.name, role: "TECHNICAL_MAN", text: d.comment || "Field capture submitted.", at: Date.now(), decision: "submit" }],
      });
      created = op;
      return { ...ns, notifications: [mkNotif("SECRETARY", `Meter activation requires your review · ${op.txn}`, "approval", op), ...ns.notifications] };
    });
    toast(offline ? "Activation queued offline." : "Submitted for Secretary review.", offline ? "warn" : "ok");
    return created;
  };
  const scheduleInspection: StoreCtx["scheduleInspection"] = d => {
    const u = stateRef.current.users.find(x => x.id === stateRef.current.currentUserId)!;
    let created: Op | null = null;
    mutate(s => {
      const [ns, op] = begin(s, {
        type: "inspection", status: "SCHEDULED", stageIdx: 1, meterNumber: d.meterNumber, facilityId: d.facilityId,
        initiatorId: u.id, initiatorName: u.name, initiatorRole: "GENERAL_MANAGER", instruction: d.instruction, durationSec: d.durationSec, scheduledFor: d.date,
        comments: [{ id: uid(), userId: u.id, userName: u.name, role: "GENERAL_MANAGER", text: d.instruction, at: Date.now(), decision: "submit" }],
      });
      created = op;
      return { ...ns, notifications: [mkNotif("TECHNICAL_MAN", `Inspection scheduled — field action required · ${op.txn}`, "field", op), ...ns.notifications] };
    });
    toast("Inspection scheduled for Technical Man.");
    return created;
  };
  const requestCode: StoreCtx["requestCode"] = (t, d) => {
    const u = stateRef.current.users.find(x => x.id === stateRef.current.currentUserId)!;
    let created: Op | null = null;
    mutate(s => {
      const [ns, op] = begin(s, {
        type: t, status: "PENDING", stageIdx: 1, meterNumber: d.meterNumber, facilityId: d.facilityId,
        initiatorId: u.id, initiatorName: u.name, initiatorRole: u.role, note: d.comment, pendingSync: offline || undefined,
        comments: [{ id: uid(), userId: u.id, userName: u.name, role: u.role, text: d.comment || `${t === "tamper" ? "Tamper" : "Clear"} code requested (${d.via}).`, at: Date.now(), decision: "submit" }],
      });
      created = op;
      return { ...ns, notifications: [mkNotif("ENERGY_MANAGER", `${t === "tamper" ? "Tamper" : "Clear"} Code request awaits approval · ${op.txn}`, "approval", op), ...ns.notifications] };
    });
    toast("Submitted to Energy Manager.");
    return created;
  };

  /* ---- field updates ---- */
  const patchOp = (opId: string, fn: (o: Op) => Op, audit?: [string, string]) => mutate(s => ({
    ...s, operations: s.operations.map(o => o.id === opId ? { ...fn(o), updatedAt: Date.now() } : o),
    audit: audit ? [...mkAudit(s, audit[0], audit[1], s.operations.find(o => o.id === opId)?.txn), ...s.audit] : s.audit,
  }));
  const saveScan: StoreCtx["saveScan"] = (opId, sc) => patchOp(opId, o => ({ ...o, scan: sc }), sc.matched ? ["barcode_scan", `Meter ${sc.value} verified by scan.`] : ["barcode_mismatch", `Scanned ${sc.value} — mismatch, operation stopped.`]);
  const saveGps: StoreCtx["saveGps"] = (opId, g) => patchOp(opId, o => ({ ...o, gps: g }), g.accepted ? ["gps_capture", `GPS ±${g.accuracy} m accepted.`] : ["suspicious_gps", `GPS ±${g.accuracy} m exceeded ceiling — rejected.`]);
  const addPhoto: StoreCtx["addPhoto"] = (opId, p) => patchOp(opId, o => ({ ...o, photos: [...o.photos, p] }), ["photo_capture", `Photo '${p.label}' captured.`]);
  const saveCustomer: StoreCtx["saveCustomer"] = (opId, c) => patchOp(opId, o => ({ ...o, customer: c }));
  const saveVideo: StoreCtx["saveVideo"] = (opId, v, obs) => patchOp(opId, o => ({ ...o, video: v, observations: obs }), ["video_capture", `Inspection video (${v.durationSec}s) captured.`]);
  const startField: StoreCtx["startField"] = opId => patchOp(opId, o => ({ ...o, status: "IN_PROGRESS", assignedToId: stateRef.current.currentUserId ?? undefined, retryCount: o.status === "REJECTED" ? o.retryCount + 1 : o.retryCount }), ["field_start", "Field operation started."]);
  const auditCode: StoreCtx["auditCode"] = (opId, action) => mutate(s => ({ ...s, audit: [...mkAudit(s, action, `${action.replace(/_/g, " ")} · ${s.operations.find(o => o.id === opId)?.txn ?? ""}`), ...s.audit] }));

  /* ---- misc ---- */
  const login: StoreCtx["login"] = id => mutate(s => ({ ...s, currentUserId: id, audit: [...mkAudit({ ...s, currentUserId: id }, "login", "Signed in."), ...s.audit] }));
  const logout: StoreCtx["logout"] = () => { mutate(s => ({ ...s, audit: [...mkAudit(s, "logout", "Signed out."), ...s.audit], currentUserId: null })); };
  const markRead: StoreCtx["markRead"] = id => mutate(s => ({ ...s, notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n) }));
  const markAllRead: StoreCtx["markAllRead"] = () => mutate(s => ({ ...s, notifications: s.notifications.map(n => !n.read && (!user || n.forRole === "ALL" || n.forRole === user.role) ? { ...n, read: true } : n) }));
  const saveSettings: StoreCtx["saveSettings"] = p => { mutate(s => ({ ...s, settings: { ...s.settings, ...p }, audit: [...mkAudit(s, "settings_change", `System settings updated (${Object.keys(p).join(", ")}).`), ...s.audit] })); toast("System settings saved."); };
  const saveZvend: StoreCtx["saveZvend"] = p => { mutate(s => ({ ...s, settings: { ...s.settings, zvend: { ...s.settings.zvend, ...p } }, audit: [...mkAudit(s, "api_config", `ZVend configuration updated (${Object.keys(p).join(", ")}).`), ...s.audit] })); toast("ZVend configuration saved."); };
  const togglePerm: StoreCtx["togglePerm"] = (r, p) => mutate(s => {
    const has = (s.permissionMatrix[r] || []).includes(p);
    return { ...s, permissionMatrix: { ...s.permissionMatrix, [r]: has ? s.permissionMatrix[r].filter(x => x !== p) : [...s.permissionMatrix[r], p] }, audit: [...mkAudit(s, "permission_change", `${has ? "Revoked" : "Granted"} ${p} for ${ROLE_LABEL[r]}.`), ...s.audit] };
  });
  const addUser: StoreCtx["addUser"] = d => mutate(s => ({ ...s, users: [...s.users, { id: uid(), ...d, active: true }], audit: [...mkAudit(s, "user_created", `User ${d.name} (${ROLE_LABEL[d.role]}) created.`), ...s.audit] }));
  const setUserActive: StoreCtx["setUserActive"] = (id, a) => mutate(s => ({ ...s, users: s.users.map(u => u.id === id ? { ...u, active: a } : u), audit: [...mkAudit(s, "user_change", `User ${a ? "activated" : "deactivated"}.`), ...s.audit] }));
  const setDelegation: StoreCtx["setDelegation"] = d => mutate(s => ({ ...s, delegation: d, audit: [...mkAudit(s, d ? "delegation_created" : "delegation_revoked", d ? `MD delegation to GM (${new Date(d.from).toLocaleDateString()} → ${new Date(d.to).toLocaleDateString()}).` : "Delegation revoked."), ...s.audit] }));
  const syncFacilities: StoreCtx["syncFacilities"] = () => { mutate(s => ({ ...s, facilities: s.facilities.map(f => ({ ...f, syncedAt: Date.now() })), audit: [...mkAudit(s, "sync_completed", `ZVend facility sync: ${s.facilities.length} processed, 0 failed.`), ...s.audit] })); toast("Facilities refreshed from ZVend."); };
  const pushAudit: StoreCtx["pushAudit"] = (action, detail) => mutate(s => ({ ...s, audit: [...mkAudit(s, action, detail), ...s.audit] }));

  const value: StoreCtx = {
    state, user, can, online, syncing, delegation, toasts, toast, dismissToast,
    login, logout, decide, createInstallation, createActivation, scheduleInspection, requestCode,
    saveScan, saveGps, addPhoto, saveCustomer, saveVideo, startField, markRead, markAllRead,
    auditCode, saveSettings, saveZvend, togglePerm, addUser, setUserActive, setDelegation, syncFacilities, pushAudit,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
